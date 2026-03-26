import { replyText } from "./lineReply.service.js";
import { replyTextSequenceOrSingle } from "./lineSequenceReply.service.js";
import { preparePhaseAHumanizedSendTexts } from "../core/conversation/conversationPipeline.service.js";
import { TelemetryEvents, logTelemetryEvent } from "../core/telemetry/telemetryEvents.js";

/** @type {Map<string, string>} */
const lastNonScanTextByUser = new Map();

/** @type {Map<string, { key: string, norm: string, at: number }>} */
const lastSemanticByUser = new Map();

const DEFAULT_SEMANTIC_WINDOW_MS = 22_000;

function resolveSemanticWindowMs() {
  const raw = process.env.NON_SCAN_SEMANTIC_WINDOW_MS;
  if (raw === undefined || raw === "") return DEFAULT_SEMANTIC_WINDOW_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 5000 && n <= 120_000 ? n : DEFAULT_SEMANTIC_WINDOW_MS;
}

function normalizeForSemantic(s) {
  return String(s || "")
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function resolveDedupeKey(replyType, semanticKey) {
  const sk = String(semanticKey || "").trim();
  if (sk) return sk;
  const rt = String(replyType || "").trim();
  return rt || "unknown";
}

/**
 * @param {string} userId
 * @param {string} dedupeKey
 * @param {string} bodyText normalized multi-line body used for exact + semantic body match
 */
function evaluateDuplicate(userId, dedupeKey, bodyText) {
  const uid = String(userId || "").trim();
  const trimmed = String(bodyText || "").replace(/\r\n/g, "\n");
  const lastExact = lastNonScanTextByUser.get(uid) || null;
  const exactDuplicate = lastExact !== null && lastExact === trimmed;

  const norm = normalizeForSemantic(trimmed);
  const sem = lastSemanticByUser.get(uid);
  const now = Date.now();
  const windowMs = resolveSemanticWindowMs();
  const semanticDuplicate = Boolean(
    sem &&
      sem.key === dedupeKey &&
      sem.norm === norm &&
      now - sem.at < windowMs,
  );

  return {
    blocked: exactDuplicate || semanticDuplicate,
    exactDuplicate,
    semanticDuplicate,
  };
}

function recordSent(userId, dedupeKey, bodyText) {
  const uid = String(userId || "").trim();
  const trimmed = String(bodyText || "").replace(/\r\n/g, "\n");
  lastNonScanTextByUser.set(uid, trimmed);
  lastSemanticByUser.set(uid, {
    key: dedupeKey,
    norm: normalizeForSemantic(trimmed),
    at: Date.now(),
  });
}

function logGateway(payload) {
  console.log(
    JSON.stringify({
      event: "NON_SCAN_REPLY_GATEWAY",
      ...payload,
    }),
  );
}

/**
 * Global outbound gateway for non-scan text replies (single bubble).
 *
 * @param {object} opts
 * @param {*} opts.client
 * @param {string} opts.userId
 * @param {string|null|undefined} opts.replyToken
 * @param {string} opts.replyType
 * @param {string} [opts.semanticKey] — defaults to replyType; used for semantic duplicate window
 * @param {string} opts.text — primary copy
 * @param {string[]} [opts.alternateTexts] — additional candidates (not including primary)
 * @param {Record<string, unknown>} [opts.scanOfferMeta] — PR2: log SCAN_OFFER_REPLY_BUILT on successful send
 * @returns {Promise<{ sent: boolean, suppressed: boolean, exactDuplicate: boolean, semanticDuplicate: boolean, retryCount: number }>}
 */
/**
 * Same as {@link sendNonScanReply} but optionally rephrases `text` via Phase A conversation surface
 * when `opts.convSurface` is set and `CONV_AI_ENABLED=true`.
 *
 * @param {Parameters<typeof sendNonScanReply>[0] & { convSurface?: Record<string, unknown> }} opts
 * @returns {Promise<Awaited<ReturnType<typeof sendNonScanReply>> & { usedAi: boolean, modelUsed: string|null, fallbackReason: string|null }>}
 */
export async function sendNonScanReplyWithOptionalConvSurface(opts) {
  const { convSurface, ...base } = opts;
  let text = base.text;
  let usedAi = false;
  let modelUsed = null;
  let fallbackReason = null;

  if (convSurface) {
    const prep = await preparePhaseAHumanizedSendTexts(convSurface);
    if (prep.ok && prep.primaryText) {
      text = prep.primaryText;
      usedAi = true;
      modelUsed = prep.modelUsed ?? null;
    } else {
      fallbackReason = prep.reason ?? null;
    }
  }

  const sendRes = await sendNonScanReply({
    ...base,
    text,
  });

  if (convSurface) {
    logTelemetryEvent(TelemetryEvents.NONSCAN_REPLY_SENT, {
      userId: base.userId,
      replyType: base.replyType,
      usedAi,
      modelUsed,
      fallbackReason,
      suppressedDuplicate: sendRes.suppressed,
      semanticKey: base.semanticKey,
    });
  }

  return { ...sendRes, usedAi, modelUsed, fallbackReason };
}

export async function sendNonScanReply(opts) {
  const {
    client,
    userId,
    replyToken,
    replyType,
    semanticKey,
    text,
    alternateTexts = [],
    scanOfferMeta,
  } = opts;

  const uid = String(userId || "").trim();
  const dedupeKey = resolveDedupeKey(replyType, semanticKey);
  const rt = String(replyType || "").trim() || "unknown";
  const skLog = String(semanticKey || "").trim() || dedupeKey;

  if (!uid) {
    logGateway({
      userId: "",
      replyType: rt,
      semanticKey: skLog,
      exactDuplicate: false,
      semanticDuplicate: false,
      suppressed: true,
      retryCount: 0,
      reason: "missing_userId",
    });
    return {
      sent: false,
      suppressed: true,
      exactDuplicate: false,
      semanticDuplicate: false,
      retryCount: 0,
    };
  }

  const primary = String(text || "").trim();
  const alts = (Array.isArray(alternateTexts) ? alternateTexts : [])
    .map((t) => String(t || "").trim())
    .filter(Boolean);

  const candidates = [primary, ...alts].filter(Boolean);
  if (candidates.length === 0) {
    logGateway({
      userId: uid,
      replyType: rt,
      semanticKey: skLog,
      exactDuplicate: false,
      semanticDuplicate: false,
      suppressed: true,
      retryCount: 0,
      reason: "empty_candidates",
    });
    return {
      sent: false,
      suppressed: true,
      exactDuplicate: false,
      semanticDuplicate: false,
      retryCount: 0,
    };
  }

  let lastEval = {
    exactDuplicate: false,
    semanticDuplicate: false,
  };

  for (let i = 0; i < candidates.length; i += 1) {
    const body = candidates[i];
    lastEval = evaluateDuplicate(uid, dedupeKey, body);
    if (!lastEval.blocked) {
      await replyText(client, replyToken, body);
      recordSent(uid, dedupeKey, body);
      if (scanOfferMeta && typeof scanOfferMeta === "object") {
        console.log(
          JSON.stringify({
            event: "SCAN_OFFER_REPLY_BUILT",
            phase: "send",
            userIdPrefix: uid.slice(0, 8),
            ...scanOfferMeta,
          }),
        );
      }
      logGateway({
        userId: uid,
        replyType: rt,
        semanticKey: skLog,
        exactDuplicate: false,
        semanticDuplicate: false,
        suppressed: false,
        retryCount: i + 1,
      });
      return {
        sent: true,
        suppressed: false,
        exactDuplicate: false,
        semanticDuplicate: false,
        retryCount: i + 1,
      };
    }
  }

  logGateway({
    userId: uid,
    replyType: rt,
    semanticKey: skLog,
    exactDuplicate: lastEval.exactDuplicate,
    semanticDuplicate: lastEval.semanticDuplicate,
    suppressed: true,
    retryCount: candidates.length,
  });

  return {
    sent: false,
    suppressed: true,
    exactDuplicate: lastEval.exactDuplicate,
    semanticDuplicate: lastEval.semanticDuplicate,
    retryCount: candidates.length,
  };
}

function fingerprintSequence(messages) {
  const list = (Array.isArray(messages) ? messages : [])
    .map((m) => String(m || "").replace(/\r\n/g, "\n").trim())
    .filter(Boolean);
  return { list, fingerprint: list.join("\n---\n") };
}

/**
 * Non-scan multi-bubble reply: dedupes on a fingerprint of the full sequence.
 *
 * @param {object} opts
 * @param {string[]} opts.messages
 * @param {string[][]} [opts.alternateSequences]
 */
export async function sendNonScanSequenceReply(opts) {
  const {
    client,
    userId,
    replyToken,
    replyType,
    semanticKey,
    messages,
    alternateSequences = [],
  } = opts;

  const uid = String(userId || "").trim();
  const dedupeKey = resolveDedupeKey(replyType, semanticKey);
  const rt = String(replyType || "").trim() || "unknown";
  const skLog = String(semanticKey || "").trim() || dedupeKey;

  if (!uid) {
    logGateway({
      userId: "",
      replyType: rt,
      semanticKey: skLog,
      exactDuplicate: false,
      semanticDuplicate: false,
      suppressed: true,
      retryCount: 0,
      reason: "missing_userId_sequence",
    });
    return {
      sent: false,
      suppressed: true,
      exactDuplicate: false,
      semanticDuplicate: false,
      retryCount: 0,
    };
  }

  const primary = fingerprintSequence(messages);
  const altSeqs = (Array.isArray(alternateSequences) ? alternateSequences : [])
    .map((seq) => fingerprintSequence(seq))
    .filter((x) => x.list.length > 0);

  const candidates = [primary, ...altSeqs];
  if (!primary.list.length) {
    logGateway({
      userId: uid,
      replyType: rt,
      semanticKey: skLog,
      exactDuplicate: false,
      semanticDuplicate: false,
      suppressed: true,
      retryCount: 0,
      reason: "empty_sequence",
    });
    return {
      sent: false,
      suppressed: true,
      exactDuplicate: false,
      semanticDuplicate: false,
      retryCount: 0,
    };
  }

  let lastEval = {
    exactDuplicate: false,
    semanticDuplicate: false,
  };

  for (let i = 0; i < candidates.length; i += 1) {
    const { list, fingerprint } = candidates[i];
    lastEval = evaluateDuplicate(uid, dedupeKey, fingerprint);
    if (!lastEval.blocked) {
      await replyTextSequenceOrSingle({
        client,
        replyToken,
        userId,
        messages: list,
      });
      recordSent(uid, dedupeKey, fingerprint);
      logGateway({
        userId: uid,
        replyType: rt,
        semanticKey: skLog,
        exactDuplicate: false,
        semanticDuplicate: false,
        suppressed: false,
        retryCount: i + 1,
        sequence: true,
      });
      return {
        sent: true,
        suppressed: false,
        exactDuplicate: false,
        semanticDuplicate: false,
        retryCount: i + 1,
      };
    }
  }

  logGateway({
    userId: uid,
    replyType: rt,
    semanticKey: skLog,
    exactDuplicate: lastEval.exactDuplicate,
    semanticDuplicate: lastEval.semanticDuplicate,
    suppressed: true,
    retryCount: candidates.length,
    sequence: true,
  });

  return {
    sent: false,
    suppressed: true,
    exactDuplicate: lastEval.exactDuplicate,
    semanticDuplicate: lastEval.semanticDuplicate,
    retryCount: candidates.length,
  };
}
