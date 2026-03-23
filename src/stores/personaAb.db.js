/**
 * Supabase persistence for persona A/B weights, sticky assignments, and funnel stats.
 */

import { supabase } from "../config/supabase.js";
import { env } from "../config/env.js";
import { getLocalDateKey } from "./paymentAccess.db.js";
import { getLatestAwaitingPaymentForLineUserId } from "./payments.db.js";
import {
  buildDefaultWeights,
  buildRollingDayWeightsNormalized,
  recomputeWeights,
  variantLabelsForCount,
  weightedPick,
  uniformFromHash32,
} from "../utils/personaAbOptimize.util.js";

/** Persona assignment when no active payment row (awaiting_payment / pending_verify). */
export const PERSONA_AB_IDLE_SESSION_KEY = "__idle__";

/** FNV-1a 32-bit — must match personaVariant.util.js */
function hashUserId(userId) {
  const s = String(userId || "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function normalizeVariant(v) {
  const c = String(v || "A").trim().toUpperCase().slice(0, 1);
  return c || "A";
}

export async function getPersonaWeightsFromDb() {
  const { data, error } = await supabase
    .from("persona_ab_weights")
    .select("weights")
    .eq("id", 1)
    .maybeSingle();

  if (error) throw error;
  const w = data?.weights;
  if (w && typeof w === "object") return /** @type {Record<string, number>} */ ({ ...w });
  return null;
}

export async function upsertPersonaWeights(weights) {
  const payload = {
    id: 1,
    weights,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("persona_ab_weights").upsert(payload, {
    onConflict: "id",
    ignoreDuplicates: false,
  });
  if (error) throw error;
}

export async function ensurePersonaWeightsSeeded() {
  const n = env.PERSONA_AB_VARIANT_COUNT;
  const defaults = buildDefaultWeights(n);
  const existing = await getPersonaWeightsFromDb();
  if (existing && Object.keys(existing).length > 0) return existing;
  await upsertPersonaWeights(defaults);
  return defaults;
}

/**
 * Active payment session = latest `payments` row in awaiting_payment | pending_verify.
 * Otherwise `__idle__` (persona can differ again on the next payment session).
 */
export async function getPaymentSessionKeyForPersona(lineUserId) {
  const uid = String(lineUserId || "").trim();
  if (!uid) return PERSONA_AB_IDLE_SESSION_KEY;
  try {
    const row = await getLatestAwaitingPaymentForLineUserId(uid);
    if (row?.id) return String(row.id);
  } catch (err) {
    console.error("[PERSONA_AB] getPaymentSessionKeyForPersona failed:", {
      message: err?.message,
      code: err?.code,
    });
  }
  return PERSONA_AB_IDLE_SESSION_KEY;
}

/**
 * @returns {Promise<string | null>}
 */
export async function getPersonaAssignment(lineUserId, paymentSessionKey) {
  const uid = String(lineUserId || "").trim();
  if (!uid) return null;
  const sk = String(paymentSessionKey || PERSONA_AB_IDLE_SESSION_KEY);

  const { data, error } = await supabase
    .from("persona_ab_assignments")
    .select("persona_variant")
    .eq("line_user_id", uid)
    .eq("payment_session_key", sk)
    .maybeSingle();

  if (error) throw error;
  return data?.persona_variant ? String(data.persona_variant) : null;
}

/**
 * Insert assignment if missing; never overwrite (sticky within this payment session).
 * @returns {Promise<string>} final variant
 */
export async function ensurePersonaAssignment(
  lineUserId,
  paymentSessionKey,
  weights
) {
  const uid = String(lineUserId || "").trim();
  if (!uid) return "A";
  const sk = String(paymentSessionKey || PERSONA_AB_IDLE_SESSION_KEY);

  const existing = await getPersonaAssignment(uid, sk);
  if (existing) return normalizeVariant(existing);

  const pickSeed = hashUserId(`${uid}\x1f${sk}`);
  const u = uniformFromHash32(pickSeed);
  const picked = normalizeVariant(weightedPick(weights, u));

  const { data, error } = await supabase
    .from("persona_ab_assignments")
    .insert({
      line_user_id: uid,
      payment_session_key: sk,
      persona_variant: picked,
      created_at: new Date().toISOString(),
    })
    .select("persona_variant")
    .maybeSingle();

  if (error) {
    if (String(error.code) === "23505") {
      const again = await getPersonaAssignment(uid, sk);
      return normalizeVariant(again || picked);
    }
    throw error;
  }

  return normalizeVariant(data?.persona_variant || picked);
}

const STAT_COLUMNS = [
  "paywall_shown",
  "payment_intent",
  "payment_success",
  "paywall_shown_deduped",
  "payment_intent_deduped",
  "slip_uploaded_raw",
  "slip_uploaded_deduped",
];

/**
 * Increment multiple counters on one row (non-negative deltas only).
 * @param {string} variant
 * @param {Partial<Record<string, number>>} deltas
 */
export async function incrementPersonaAbStatDeltas(variant, deltas) {
  const v = normalizeVariant(variant);
  const { data: row, error: selErr } = await supabase
    .from("persona_ab_stats")
    .select(
      "variant,paywall_shown,payment_intent,payment_success,paywall_shown_deduped,payment_intent_deduped,slip_uploaded_raw,slip_uploaded_deduped"
    )
    .eq("variant", v)
    .maybeSingle();

  if (selErr) throw selErr;

  const base = {
    variant: v,
    updated_at: new Date().toISOString(),
  };
  for (const col of STAT_COLUMNS) {
    const prev = Number(row?.[col]) || 0;
    const d = Math.max(0, Number(deltas?.[col]) || 0);
    base[col] = prev + d;
  }

  const { error: upErr } = await supabase
    .from("persona_ab_stats")
    .upsert(base, { onConflict: "variant" });

  if (upErr) throw upErr;

  void incrementPersonaFunnelDailyBucket(v, deltas).catch((err) => {
    console.error("[PERSONA_AB] funnel_daily increment failed:", {
      message: err?.message,
      code: err?.code,
    });
  });
}

/**
 * Per-calendar-day rollup (same counters as `persona_ab_stats` lifetime table).
 */
async function incrementPersonaFunnelDailyBucket(variant, deltas) {
  const bucketDate = getLocalDateKey(new Date());
  const v = normalizeVariant(variant);

  const { data: row, error: selErr } = await supabase
    .from("persona_ab_funnel_daily")
    .select(
      "variant,bucket_date,paywall_shown,payment_intent,payment_success,paywall_shown_deduped,payment_intent_deduped,slip_uploaded_raw,slip_uploaded_deduped"
    )
    .eq("variant", v)
    .eq("bucket_date", bucketDate)
    .maybeSingle();

  if (selErr) throw selErr;

  const base = {
    variant: v,
    bucket_date: bucketDate,
    updated_at: new Date().toISOString(),
  };
  for (const col of STAT_COLUMNS) {
    const prev = Number(row?.[col]) || 0;
    const d = Math.max(0, Number(deltas?.[col]) || 0);
    base[col] = prev + d;
  }

  const { error: upErr } = await supabase
    .from("persona_ab_funnel_daily")
    .upsert(base, { onConflict: "variant,bucket_date" });

  if (upErr) throw upErr;
}

function buildDateKeysOldestFirst(numDays) {
  const n = Math.max(1, Math.floor(Number(numDays) || 1));
  const keys = [];
  const today = new Date();
  for (let offset = n - 1; offset >= 0; offset -= 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - offset);
    keys.push(getLocalDateKey(d));
  }
  return keys;
}

/**
 * Rolling-window weighted stats for recompute, or lifetime totals if daily table empty.
 * @returns {Promise<{
 *   stats: import("../utils/personaAbOptimize.util.js").PersonaAbStatRow[],
 *   rawTotalPaywallInWindow: number,
 *   source: string,
 * }>}
 */
export async function fetchPersonaAbStatsForRecompute() {
  const labels = variantLabelsForCount(env.PERSONA_AB_VARIANT_COUNT);
  const windowDays = env.PERSONA_AB_STATS_WINDOW_DAYS;
  const dateKeys = buildDateKeysOldestFirst(windowDays);
  const start = dateKeys[0];
  const end = dateKeys[dateKeys.length - 1];

  const { data, error } = await supabase
    .from("persona_ab_funnel_daily")
    .select(
      "variant,bucket_date,paywall_shown,payment_intent,payment_success,paywall_shown_deduped,payment_intent_deduped,slip_uploaded_raw,slip_uploaded_deduped"
    )
    .gte("bucket_date", start)
    .lte("bucket_date", end);

  if (error) throw error;

  let rawTotalPaywallInWindow = 0;
  const byVariantDate = new Map();
  for (const r of data || []) {
    const vv = normalizeVariant(r.variant);
    const dk = String(r.bucket_date || "").slice(0, 10);
    rawTotalPaywallInWindow += Number(r.paywall_shown) || 0;
    byVariantDate.set(`${vv}|${dk}`, r);
  }

  if (rawTotalPaywallInWindow <= 0) {
    const stats = await fetchPersonaAbStatsSnapshot();
    const rawTotal = stats.reduce(
      (s, row) => s + (Number(row.paywallShown) || 0),
      0
    );
    return {
      stats,
      rawTotalPaywallInWindow: rawTotal,
      source: "lifetime_totals_fallback",
    };
  }

  const dayWeights = buildRollingDayWeightsNormalized(
    dateKeys.length,
    env.PERSONA_AB_STATS_WEIGHT_MODE,
    env.PERSONA_AB_STATS_EXP_LAMBDA
  );

  const stats = labels.map((v) => {
    let paywallShownRawWeighted = 0;
    let paywallShownDedupedWeighted = 0;
    let paymentIntentRawWeighted = 0;
    let paymentIntentDedupedWeighted = 0;
    let paymentSuccessRawWeighted = 0;
    for (let i = 0; i < dateKeys.length; i += 1) {
      const dk = dateKeys[i];
      const w = dayWeights[i] ?? 0;
      const row = byVariantDate.get(`${v}|${dk}`);
      paywallShownRawWeighted += (Number(row?.paywall_shown) || 0) * w;
      paywallShownDedupedWeighted +=
        (Number(row?.paywall_shown_deduped) || 0) * w;
      paymentIntentRawWeighted += (Number(row?.payment_intent) || 0) * w;
      paymentIntentDedupedWeighted +=
        (Number(row?.payment_intent_deduped) || 0) * w;
      paymentSuccessRawWeighted += (Number(row?.payment_success) || 0) * w;
    }
    const paywallShown =
      paywallShownDedupedWeighted > 0
        ? paywallShownDedupedWeighted
        : paywallShownRawWeighted;
    const paymentIntent =
      paymentIntentDedupedWeighted > 0
        ? paymentIntentDedupedWeighted
        : paymentIntentRawWeighted;
    return {
      variant: v,
      paywallShown,
      paymentIntent,
      paymentSuccess: paymentSuccessRawWeighted,
    };
  });

  return {
    stats,
    rawTotalPaywallInWindow,
    source: "rolling_window",
  };
}

/**
 * @returns {Promise<import("../utils/personaAbOptimize.util.js").PersonaAbStatRow[]>}
 */
export async function fetchPersonaAbStatsSnapshot() {
  const labels = variantLabelsForCount(env.PERSONA_AB_VARIANT_COUNT);
  const { data, error } = await supabase
    .from("persona_ab_stats")
    .select(
      "variant,paywall_shown,payment_intent,payment_success,paywall_shown_deduped,payment_intent_deduped"
    );

  if (error) throw error;

  const byV = new Map(
    (data || []).map((r) => [
      normalizeVariant(r.variant),
      {
        variant: normalizeVariant(r.variant),
        paywallShown:
          Number(r.paywall_shown_deduped) > 0
            ? Number(r.paywall_shown_deduped) || 0
            : Number(r.paywall_shown) || 0,
        paymentIntent:
          Number(r.payment_intent_deduped) > 0
            ? Number(r.payment_intent_deduped) || 0
            : Number(r.payment_intent) || 0,
        paymentSuccess: Number(r.payment_success) || 0,
      },
    ])
  );

  return labels.map((v) => {
    if (byV.has(v)) return byV.get(v);
    return {
      variant: v,
      paywallShown: 0,
      paymentIntent: 0,
      paymentSuccess: 0,
    };
  });
}

export async function incrementPersonaAbStatFromEvent(eventName, payload) {
  if (!env.PERSONA_AB_OPTIMIZE_ENABLED) return;
  const pv = payload?.personaVariant;
  if (!pv) return;

  const dedupe = payload?.funnelDedupeCounted === true;

  if (eventName === "paywall_shown") {
    await incrementPersonaAbStatDeltas(String(pv), {
      paywall_shown: 1,
      paywall_shown_deduped: dedupe ? 1 : 0,
    });
    return;
  }
  if (eventName === "payment_intent") {
    await incrementPersonaAbStatDeltas(String(pv), {
      payment_intent: 1,
      payment_intent_deduped: dedupe ? 1 : 0,
    });
    return;
  }
  if (eventName === "slip_uploaded") {
    await incrementPersonaAbStatDeltas(String(pv), {
      slip_uploaded_raw: 1,
      slip_uploaded_deduped: dedupe ? 1 : 0,
    });
    return;
  }
  if (eventName === "payment_success") {
    await incrementPersonaAbStatDeltas(String(pv), {
      payment_success: 1,
    });
  }
}

export async function runPersonaAbRecomputeJob() {
  if (!env.PERSONA_AB_OPTIMIZE_ENABLED) return;

  const labels = variantLabelsForCount(env.PERSONA_AB_VARIANT_COUNT);
  const defaultWeights = buildDefaultWeights(env.PERSONA_AB_VARIANT_COUNT);
  const { stats, rawTotalPaywallInWindow, source } =
    await fetchPersonaAbStatsForRecompute();

  const newWeights = recomputeWeights(stats, {
    variantLabels: labels,
    minWeight: env.PERSONA_AB_MIN_WEIGHT,
    minTotalPaywall: env.PERSONA_AB_MIN_SAMPLE_PAYWALL,
    defaultWeights,
    useBlendedScore: env.PERSONA_AB_USE_BLENDED_SCORE,
    blendedIntentWeight: env.PERSONA_AB_BLENDED_INTENT_WEIGHT,
    bayesAlpha: env.PERSONA_AB_BAYES_ALPHA,
    bayesBeta: env.PERSONA_AB_BAYES_BETA,
    totalPaywallRawForThreshold: rawTotalPaywallInWindow,
  });

  const prev = (await getPersonaWeightsFromDb()) || defaultWeights;
  const same =
    labels.length &&
    labels.every((l) => Math.abs((Number(prev[l]) || 0) - (Number(newWeights[l]) || 0)) < 1e-9);

  if (same) {
    console.log(
      JSON.stringify({
        event: "PERSONA_AB_RECOMPUTE",
        skipped: true,
        reason: "weights_unchanged",
      })
    );
    return;
  }

  await upsertPersonaWeights(newWeights);
  console.log(
    JSON.stringify({
      event: "PERSONA_AB_RECOMPUTE",
      weights: newWeights,
      statsSource: source,
      rawTotalPaywallInWindow,
      stats: stats.map((s) => ({
        variant: s.variant,
        paywallShown: s.paywallShown,
        paymentIntent: s.paymentIntent,
        paymentSuccess: s.paymentSuccess,
        smoothedRate:
          s.paywallShown + env.PERSONA_AB_BAYES_BETA > 0
            ? (s.paymentSuccess + env.PERSONA_AB_BAYES_ALPHA) /
              (s.paywallShown + env.PERSONA_AB_BAYES_BETA)
            : null,
      })),
    })
  );
}

export { hashUserId };
