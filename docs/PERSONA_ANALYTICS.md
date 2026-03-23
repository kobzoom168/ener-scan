# Persona A/B & conversion analytics

Structured logs are emitted as **single-line JSON** on stdout with `event: "PERSONA_ANALYTICS"` and `eventName` set to the funnel step.

## Events

| `eventName`       | When |
|-------------------|------|
| `preview_shown`   | Free-tier scan result shown (Flex). |
| `paywall_shown`   | User sees payment UI (QR triple, text fallback, persona paywall copy, scan/payment flows). |
| `payment_intent`  | User sends the payment command (e.g. types **จ่ายเงิน**) after abuse checks pass. |
| `slip_uploaded`   | Slip image accepted and stored as `pending_verify`. |
| `payment_success` | Admin approves payment and unlock runs (**non-idempotent** activation only). |

Payload fields (where applicable):

- `userId` — LINE user id  
- `personaVariant` — `getAssignedPersonaVariant(userId)` (`A`… configurable via `PERSONA_AB_VARIANT_COUNT`)  
- `patternUsed` — persona pattern id or paywall pattern label when available  
- `bubbleCount` — message bubble count for that step  
- `source` — optional string (e.g. `payment_command`, `finalize_image_payment_required`)  
- `paymentId` — optional; included for paywall / intent when a `payments` row exists, and for slip / success correlation  
- `funnelRaw` — always `true` on emitted lines (each line is one raw event)  
- `funnelDedupeKey` — present for `paywall_shown`, `payment_intent`, `slip_uploaded` (see dedupe rules below)  
- `funnelDedupeCounted` — `true` if this event is the **first** in the dedupe window for that key (counts toward **deduped** DB columns); `false` if duplicate  

## Funnel dedupe (server-side)

Applies to **`paywall_shown`**, **`payment_intent`**, **`slip_uploaded`** only. **`payment_success`** is unchanged (every success still increments raw `payment_success` once per approval event).

**Dedupe key** (in-memory, per server process):

1. If `paymentId` is present in the payload:  
   `lineUserId|eventName|pay:<paymentId>`  
   — One deduped count per user + event + payment row until the in-memory TTL expires (default **48h**, `PERSONA_FUNNEL_DEDUPE_PAYMENT_TTL_MS`).
2. If `paymentId` is absent:  
   `lineUserId|eventName|win:<floor(now / windowMs)>`  
   — Rolling **time bucket** (default window **10 min**, `PERSONA_FUNNEL_DEDUPE_WINDOW_MS`).

**Raw vs deduped:**

- Every log line is a **raw** event (`funnelRaw: true`). Supabase `persona_ab_stats` stores **raw** columns: `paywall_shown`, `payment_intent`, `slip_uploaded_raw` (slip), plus **`_deduped`** columns that increment only when `funnelDedupeCounted` is `true`.
- **Rates from logs:** count all lines with a given `eventName` = raw; count lines where `funnelDedupeCounted == true` = deduped funnel.

## Sample log lines

```text
{"event":"PERSONA_ANALYTICS","eventName":"preview_shown","ts":"2025-03-19T10:00:00.000Z","funnelRaw":true,"userId":"Uabc...","personaVariant":"B","patternUsed":"scan_result_flex","bubbleCount":1}
{"event":"PERSONA_ANALYTICS","eventName":"paywall_shown","ts":"2025-03-19T10:00:01.000Z","funnelRaw":true,"funnelDedupeKey":"Uabc...|paywall_shown|pay:uuid-...","funnelDedupeCounted":true,"userId":"Uabc...","personaVariant":"B","patternUsed":"qr_intro_image_slip","bubbleCount":3,"source":"payment_command","paymentId":"uuid-..."}
{"event":"PERSONA_ANALYTICS","eventName":"payment_intent","ts":"2025-03-19T10:00:02.000Z","funnelRaw":true,"funnelDedupeKey":"Uabc...|payment_intent|pay:uuid-...","funnelDedupeCounted":true,"userId":"Uabc...","personaVariant":"B","patternUsed":null,"bubbleCount":1,"source":"payment_command","paymentId":"uuid-..."}
{"event":"PERSONA_ANALYTICS","eventName":"slip_uploaded","ts":"2025-03-19T10:05:00.000Z","funnelRaw":true,"funnelDedupeKey":"Uabc...|slip_uploaded|pay:uuid-...","funnelDedupeCounted":true,"userId":"Uabc...","personaVariant":"B","patternUsed":null,"bubbleCount":1,"paymentId":"uuid-..."}
{"event":"PERSONA_ANALYTICS","eventName":"payment_success","ts":"2025-03-19T10:10:00.000Z","funnelRaw":true,"userId":"Uabc...","personaVariant":"B","patternUsed":null,"bubbleCount":1,"paymentId":"uuid-...","source":"admin_dashboard_approve"}
```

## Metrics (by `personaVariant`)

Definitions:

- **intent_rate** = `payment_intent` / `paywall_shown`  
- **conversion_rate** = `payment_success` / `paywall_shown`  

Use the **same time window** and dedupe **per user per event** if you aggregate from raw logs (optional).

### Example: `jq` aggregation (stdin = newline JSON logs)

```bash
jq -s '
  map(select(.event == "PERSONA_ANALYTICS"))
  | group_by(.personaVariant)
  | map(
      . as $rows
      | ($rows | map(select(.eventName == "paywall_shown")) | length) as $p
      | {
          personaVariant: $rows[0].personaVariant,
          paywall_shown: $p,
          payment_intent: ($rows | map(select(.eventName == "payment_intent")) | length),
          payment_success: ($rows | map(select(.eventName == "payment_success")) | length),
          intent_rate: (if $p == 0 then null else ($rows | map(select(.eventName == "payment_intent")) | length) / $p end),
          conversion_rate: (if $p == 0 then null else ($rows | map(select(.eventName == "payment_success")) | length) / $p end)
        }
    )
' persona.jsonl
```

### Example: SQL (if you load JSON lines into a table `analytics_events`)

```sql
SELECT
  payload->>'personaVariant' AS persona_variant,
  COUNT(*) FILTER (WHERE event_name = 'paywall_shown') AS paywall_shown,
  COUNT(*) FILTER (WHERE event_name = 'payment_intent') AS payment_intent,
  COUNT(*) FILTER (WHERE event_name = 'payment_success') AS payment_success,
  CASE WHEN COUNT(*) FILTER (WHERE event_name = 'paywall_shown') = 0 THEN NULL
       ELSE COUNT(*) FILTER (WHERE event_name = 'payment_intent')::float
            / COUNT(*) FILTER (WHERE event_name = 'paywall_shown')
  END AS intent_rate,
  CASE WHEN COUNT(*) FILTER (WHERE event_name = 'paywall_shown') = 0 THEN NULL
       ELSE COUNT(*) FILTER (WHERE event_name = 'payment_success')::float
            / COUNT(*) FILTER (WHERE event_name = 'paywall_shown')
  END AS conversion_rate
FROM analytics_events
WHERE ts >= NOW() - INTERVAL '7 days'
GROUP BY 1
ORDER BY 1;
```

## Config

- `PERSONA_AB_VARIANT_COUNT` — number of variants (default `3` → `A`, `B`, `C`). Clamped in `env` if applicable.
- `PERSONA_FUNNEL_DEDUPE_WINDOW_MS` — rolling bucket when `paymentId` is absent (default 10 minutes).
- `PERSONA_FUNNEL_DEDUPE_PAYMENT_TTL_MS` — TTL for in-memory keys scoped with `paymentId` (default 48 hours).

See also `docs/PERSONA_AB_OPTIMIZATION.md` for persona weight recompute (uses raw `paywall_shown` / `payment_success` unless you change the job).
