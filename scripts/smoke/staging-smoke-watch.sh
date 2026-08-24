#!/usr/bin/env bash
# timeline สำหรับตัด PASS/FAIL smoke รายเคส (staging) — group ตาม UID prefix
# ใช้: bash scripts/smoke/staging-smoke-watch.sh [since=30m]
SINCE="${1:-30m}"
for c in ener-scan-staging ener-scan-staging-worker-delivery ener-scan-staging-worker-scan; do
  docker logs --since "$SINCE" --timestamps "$c" 2>&1
done | grep -E '"event":"(TEXT_TURN_ROUTING_SNAPSHOT|INBOUND_[A-Z_]*|SLIP_RECEIVED_STATE_TRANSITION|HARD_TONE_BLOCKED_BEFORE_SEND|LLM_INTENT_CONTRACT_MISSING|CHAT_TURN_AI_CHAIN|LLM_(TONE|GROUNDING)_REJECTED|LLM_FACTUAL_FALLBACK_USED|LLM_REGENERATED|LLM_TURN_BUDGET_EXHAUSTED|NON_SCAN_REPLY_GATEWAY|OUTBOUND_SEND_SUCCESS|OUTBOUND_SEND_FAIL[A-Z_]*|CUSTOMER_(REPLY|PUSH)_TONE_BLOCKED|OBJECT_INFO_GATE_ASKED|PRE_SCAN_ACK_ENQUEUED|SCAN_JOB_QUEUED|FREE_QUOTA_EXHAUSTED_REPLY_ROUTED|PAYMENT_[A-Z_]*|SLIP_[A-Z_]*|YT_[A-Z_]*|SMOKE_YT_NOTIFY|GEMINI_CONSULT|AJARN_MONEY_PRESEND[A-Z_]*|TONE_PRESEND[A-Z_]*|OBJECT_REPLY_TYPE_SELECTED|SMART_REJECTION_TEXT)"' \
  | sed -E 's/(U[0-9a-f]{6})[0-9a-f]{26}/\1…/g' \
  | node -e '
const lines = require("fs").readFileSync(0,"utf8").trim().split("\n").filter(Boolean);
const rows = [];
for (const l of lines) {
  const ts = l.slice(0,19).replace("T"," ");
  const j = l.slice(l.indexOf("{")); let o; try { o = JSON.parse(j); } catch { continue; }
  const uid = o.userId || o.lineUserIdPrefix || o.lineUserId || o.uid || o.userIdPrefix || "-";
  const pick = (k) => o[k] === undefined ? "" : (typeof o[k] === "object" ? JSON.stringify(o[k]) : String(o[k]));
  rows.push([ts, String(uid).slice(0,7), o.event, pick("replyType")||pick("kind"), pick("suppressed"), pick("toneViolations")||pick("violations"), pick("aiCallCount")||pick("aiCalls"), (pick("sample")||pick("text")||pick("textSample")).slice(0,70)].join(" | "));
}
console.log(rows.join("\n"));
console.log("--- rows:", rows.length);
'
