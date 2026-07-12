import { pushText } from "../lineSequenceReply.service.js";
import { env } from "../../config/env.js";

/**
 * LINE typing indicator ("•••"), fired after the pre-scan ack so it covers the
 * report-generation wait. Fire-and-forget; never blocks delivery.
 */
async function startPostAckLoadingAnimation(chatId) {
  const uid = String(chatId || "").trim();
  const token = String(env.CHANNEL_ACCESS_TOKEN || "").trim();
  if (!uid || !token) return;
  try {
    await fetch("https://api.line.me/v2/bot/chat/loading/start", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ chatId: uid, loadingSeconds: 60 }),
    });
  } catch (e) {
    console.log(
      JSON.stringify({
        event: "POST_ACK_LOADING_START_FAILED",
        lineUserIdPrefix: uid.slice(0, 8),
        message: String(e?.message || e).slice(0, 120),
      }),
    );
  }
}
import { sendScanResultPushWith429Retry } from "../../utils/linePush429Retry.util.js";
import {
  isLine429Error,
  notifyLineUserTextAfterAdminAction,
} from "../../utils/lineNotify429Retry.util.js";
import { invokeLinePushMessage } from "../../utils/lineClientTransport.util.js";
import { getStaticVoiceNote } from "../voiceNote/scanVoiceNote.service.js";
import { updateOutboundMessage } from "../../stores/scanV2/outboundMessages.db.js";
import { getScanJobById, updateScanJob } from "../../stores/scanV2/scanJobs.db.js";
import { decrementUserPaidRemainingScans } from "../../stores/paymentAccess.db.js";
import {
  OUTBOUND_BACKOFF_MS,
  OUTBOUND_MAX_ATTEMPTS,
} from "../../stores/scanV2/outboundPriority.js";
import {
  incrementLine429CanaryCounter,
  setDeliveryRateBackoffMs,
  sleepIfRateHint,
  clearDedupeKey,
  tryDedupeOnce,
} from "../../redis/scanV2Redis.js";
import { scanInFlightKeyForUser } from "./webhookImageIngestion.service.js";
import { supabase } from "../../config/supabase.js";
import {
  countScanResultsTodayForAppUser,
  getLocalDateKey,
} from "../../stores/paymentAccess.db.js";
import { computePaidActive } from "../scanOfferAccess.resolver.js";
import { loadActiveScanOffer } from "../scanOffer.loader.js";
import { getDefaultPackage } from "../scanOffer.packages.js";
import {
  scanV2TraceTs,
  lineUserIdPrefix8,
  idPrefix8,
  workerIdPrefix16,
} from "../../utils/scanV2Trace.util.js";
import {
  buildScanResultOutboundTrace,
  FinalDeliveryErrorCode,
} from "../../utils/scanV2/finalDeliveryTelemetry.util.js";
import {
  buildLineStickerMessage,
  lineStickerPaymentApprovedBlessingMessage,
} from "../../utils/lineStickerMessage.util.js";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {object} msg
 * @param {object} [traceCtx]
 */
function outboundDeliveryBase(msg, traceCtx = {}) {
  const attempt = traceCtx.attempt ?? msg.attempt_count ?? null;
  return {
    path: "worker-delivery",
    workerIdPrefix: traceCtx.workerId
      ? workerIdPrefix16(traceCtx.workerId)
      : null,
    outboundIdPrefix: idPrefix8(msg.id),
    lineUserIdPrefix: lineUserIdPrefix8(msg.line_user_id),
    kind: msg.kind ?? null,
    attempt,
    timestamp: scanV2TraceTs(),
  };
}

/**
 * @param {*} client LINE SDK client
 * @param {object} msg outbound_messages row
 * @param {{ workerId?: string, attempt?: number }} [traceCtx]
 * @returns {Promise<{ sent: boolean, is429?: boolean, errorCode?: string, errorMessage?: string }>}
 */
export async function deliverOutboundMessage(client, msg, traceCtx = {}) {
  const id = msg.id;
  const lineUserId = msg.line_user_id;
  const kind = msg.kind;
  const payload =
    msg.payload_json && typeof msg.payload_json === "object"
      ? msg.payload_json
      : {};
  const base = () => outboundDeliveryBase(msg, traceCtx);

  await sleepIfRateHint(sleep, lineUserId);

  const scanResultTrace =
    kind === "scan_result"
      ? buildScanResultOutboundTrace(msg, payload)
      : {};
  console.log(
    JSON.stringify({
      event: "OUTBOUND_SEND_START",
      ...base(),
      ...scanResultTrace,
    }),
  );

  try {
    if (kind === "pre_scan_ack") {
      const text = String(payload.text || "").trim();
      if (!text) {
        return {
          sent: false,
          errorCode: "empty_payload",
          errorMessage: "pre_scan_ack missing text",
        };
      }
      // เตือนหลายรูป → เสียงอาจารย์ (static cached) แทนข้อความ; พลาด → ข้อความเดิม
      let sentAsVoice = false;
      const staticName = String(payload.voiceStatic || "").trim();
      if (staticName) {
        try {
          const v = await getStaticVoiceNote(staticName);
          if (v?.url && v.durationMs >= 500) {
            await client.pushMessage(lineUserId, {
              type: "audio",
              originalContentUrl: v.url,
              duration: Math.min(v.durationMs, 60000),
            });
            sentAsVoice = true;
          }
        } catch {
          /* fall back to text */
        }
      }
      if (!sentAsVoice) await pushText(client, lineUserId, text);
      await markSent(id);
      // Re-arm LINE's typing "•••" AFTER the ack bubble (sending the ack cleared
      // the webhook-time one) so the customer sees the bot working while the
      // scan/report generates (~20-30s). Auto-clears when scan_result is sent.
      void startPostAckLoadingAnimation(lineUserId);
      console.log(
        JSON.stringify({
          event: "OUTBOUND_SEND_SUCCESS",
          ...base(),
        }),
      );
      return { sent: true };
    }

    if (kind === "scan_result") {
      if (payload.error) {
        const t = String(payload.text || "").trim() || "รูปนี้อ่านไม่ผ่านครับ ส่งใหม่อีกทีนะ";
        await pushText(client, lineUserId, t);
        await markSent(id);
        releaseScanGate(lineUserId);
        if (payload.rejectReason === "object_validation_failed") {
          console.log(
            JSON.stringify({
              event: "UNSUPPORTED_OBJECT_REPLY_SENT",
              path: "worker_delivery_push",
              lineUserIdPrefix: lineUserIdPrefix8(lineUserId),
              objectCheckResult: payload.objectCheckResult ?? null,
              outboundIdPrefix: idPrefix8(id),
            }),
          );
        }
        console.log(
          JSON.stringify({
            event: "OUTBOUND_SEND_SUCCESS",
            ...base(),
            kind: "scan_result_error_text",
          }),
        );
        return { sent: true };
      }

      const deliveryStrategy =
        payload.deliveryStrategy != null
          ? String(payload.deliveryStrategy)
          : "legacy_full";
      const lineSummary = payload.lineSummary ?? null;
      console.log(
        JSON.stringify({
          event: "OUTBOUND_SCAN_RESULT_LINE_PAYLOAD",
          ...base(),
          ...buildScanResultOutboundTrace(msg, payload),
          deliveryStrategy,
          summaryLinkMode: deliveryStrategy === "summary_link",
          textChars: String(payload.text || "").length,
          hasFlex: Boolean(payload.flex && typeof payload.flex === "object"),
          hasReportUrl: Boolean(String(payload.reportUrl || "").trim()),
          hasLegacyReportPayload: Boolean(payload.reportPayload),
          lineSummaryPresent: Boolean(lineSummary),
        }),
      );

      const flex = payload.flex ?? null;
      const text = String(payload.text || "");
      // เสียงอาจารย์ (ถ้า worker-scan สร้างไว้) — แนบใน push เดียวกับ report
      // (LINE นับ 1 push หลาย message objects = 1 ข้อความ ไม่เปลืองโควต้า)
      const voice =
        payload.voice && typeof payload.voice === "object" ? payload.voice : null;
      const voiceUrl = String(voice?.url || "").trim();
      const voiceDurationMs = Math.floor(Number(voice?.durationMs) || 0);
      const audioMessage =
        voiceUrl.startsWith("https://") && voiceDurationMs >= 500
          ? {
              type: "audio",
              originalContentUrl: voiceUrl,
              duration: Math.min(voiceDurationMs, 60000),
            }
          : null;
      const primaryMessage = audioMessage
        ? flex
          ? [flex, audioMessage]
          : [{ type: "text", text: text.slice(0, 4900) }, audioMessage]
        : flex;
      let delivery = await sendScanResultPushWith429Retry({
        client,
        userId: lineUserId,
        flexMessage: primaryMessage,
        text,
        logPrefix: "[SCAN_V2_DELIVERY]",
      });
      // เสียงห้ามทำให้ report ล่ม: push พร้อมเสียงไม่ผ่าน (ไม่ใช่ 429) → ส่งซ้ำแบบไม่มีเสียง
      if (!delivery.sent && !delivery.is429 && audioMessage) {
        console.warn(
          JSON.stringify({
            event: "SCAN_VOICE_ATTACH_RETRY_WITHOUT_AUDIO",
            ...base(),
            finalMessage: delivery.finalMessage,
          }),
        );
        delivery = await sendScanResultPushWith429Retry({
          client,
          userId: lineUserId,
          flexMessage: flex,
          text,
          logPrefix: "[SCAN_V2_DELIVERY_NO_VOICE]",
        });
      }

      if (delivery.sent) {
        await markSent(id);
        releaseScanGate(lineUserId);
        await handleScanResultPostDelivery(msg, payload);
        // บอกสิทธิ์คงเหลือทันทีหลัง report ถึงมือ (หลัง decrement แล้ว) — เฉพาะ
        // report สแกนใหม่จริง (ข้าม "เคยสแกนแล้ว" dedupHit) และข้อความสิทธิ์
        // เนื้อหาเดิมไม่ยิงซ้ำภายใน 30 นาที
        try {
          if (!payload.dedupHit) {
            const quotaNotice = await buildRemainingQuotaNoticeText(lineUserId);
            const noticeText =
              typeof quotaNotice === "string" ? quotaNotice : quotaNotice?.text;
            const noticeQuickReply =
              quotaNotice && typeof quotaNotice === "object" ? quotaNotice.quickReply : null;
            if (noticeText) {
              let h = 0;
              for (let i = 0; i < noticeText.length; i++) {
                h = (h * 31 + noticeText.charCodeAt(i)) >>> 0;
              }
              const firstThisText = await tryDedupeOnce(
                `scan_v2:quota_notice:${lineUserId}:${h}`,
                1800,
              );
              if (firstThisText) await pushText(client, lineUserId, noticeText, noticeQuickReply);
            }
          }
        } catch {
          /* notice is best-effort */
        }
        console.log(
          JSON.stringify({
            event: "OUTBOUND_SEND_SUCCESS",
            ...base(),
            ...buildScanResultOutboundTrace(msg, payload),
            method: delivery.method,
            deliveryStrategy:
              payload.deliveryStrategy != null
                ? String(payload.deliveryStrategy)
                : "legacy_full",
            summaryLinkDelivered: deliveryStrategy === "summary_link",
          }),
        );
        return { sent: true };
      }

      if (delivery.is429) {
        console.warn(
          JSON.stringify({
            event: "LINE_RATE_LIMIT_HIT",
            path: "worker-delivery",
            errorCode: FinalDeliveryErrorCode.LINE_RATE_LIMITED,
            outboundIdPrefix: String(id).slice(0, 8),
            kind: "scan_result",
            ...buildScanResultOutboundTrace(msg, payload),
          }),
        );
        return { sent: false, is429: true, errorCode: "line_429" };
      }

      return {
        sent: false,
        errorCode: "line_send_failed",
        errorMessage: delivery.finalMessage || "push_failed",
      };
    }

    if (
      kind === "approve_notify" ||
      kind === "reject_notify" ||
      kind === "pending_intro"
    ) {
      const text = String(payload.text || "").trim();
      if (!text) {
        return {
          sent: false,
          errorCode: "empty_payload",
          errorMessage: `${kind} missing text`,
        };
      }
      const replyToken =
        kind === "approve_notify" && payload.replyToken
          ? String(payload.replyToken).trim()
          : null;
      const tag =
        kind === "approve_notify"
          ? "OUTBOUND_APPROVE_NOTIFY"
          : kind === "reject_notify"
            ? "OUTBOUND_REJECT_NOTIFY"
            : "OUTBOUND_PENDING_INTRO";
      /** @type {{ type: "sticker", packageId: string, stickerId: string } | null} */
      let approveSticker = null;
      if (kind === "approve_notify") {
        const st = payload.stickerAfterText;
        approveSticker =
          st &&
          typeof st === "object" &&
          String(st.packageId ?? "").trim() &&
          String(st.stickerId ?? "").trim()
            ? buildLineStickerMessage({
                packageId: String(st.packageId),
                stickerId: String(st.stickerId),
              })
            : lineStickerPaymentApprovedBlessingMessage();
      }
      const r = await notifyLineUserTextAfterAdminAction({
        client,
        lineUserId,
        text,
        replyToken: replyToken || null,
        eventTag: tag,
        logPrefix: "[OUTBOUND_ADMIN_TEXT]",
        stickerMessage: approveSticker,
      });
      if (r.userNotified) {
        await markSent(id);
        console.log(
          JSON.stringify({
            event: "OUTBOUND_SEND_SUCCESS",
            ...base(),
            channel: r.channel,
            attempts: r.attempts,
          }),
        );
        return { sent: true };
      }
      if (r.is429) {
        console.warn(
          JSON.stringify({
            event: "LINE_RATE_LIMIT_HIT",
            outboundIdPrefix: String(id).slice(0, 8),
            kind,
          }),
        );
        return {
          sent: false,
          is429: true,
          errorCode: "line_429",
        };
      }
      return {
        sent: false,
        errorCode: r.notifyError || "line_send_failed",
        errorMessage: r.finalMessage || "notify_failed",
      };
    }

    if (kind === "payment_qr") {
      const imageUrl = String(payload.imageUrl || "").trim();
      const text = String(payload.text || "").trim();
      try {
        if (imageUrl) {
          await invokeLinePushMessage(
            client,
            "outbound.payment_qr.image",
            lineUserId,
            {
              type: "image",
              originalContentUrl: imageUrl,
              previewImageUrl: imageUrl,
            },
          );
        }
        if (text) {
          await invokeLinePushMessage(
            client,
            "outbound.payment_qr.text",
            lineUserId,
            { type: "text", text: text.slice(0, 4900) },
          );
        }
        if (!imageUrl && !text) {
          return {
            sent: false,
            errorCode: "empty_payload",
            errorMessage: "payment_qr missing text and imageUrl",
          };
        }
        await markSent(id);
        console.log(
          JSON.stringify({
            event: "OUTBOUND_SEND_SUCCESS",
            ...base(),
            hasImage: Boolean(imageUrl),
            hasText: Boolean(text),
          }),
        );
        return { sent: true };
      } catch (err) {
        if (isLine429Error(err)) {
          console.warn(
            JSON.stringify({
              event: "LINE_RATE_LIMIT_HIT",
              outboundIdPrefix: String(id).slice(0, 8),
              kind: "payment_qr",
            }),
          );
          return { sent: false, is429: true, errorCode: "line_429" };
        }
        return {
          sent: false,
          errorCode: "line_send_failed",
          errorMessage: String(err?.message || err),
        };
      }
    }

    const fallback = String(payload.text || "").trim();
    if (fallback) {
      await pushText(client, lineUserId, fallback);
      await markSent(id);
      console.log(
        JSON.stringify({
          event: "OUTBOUND_SEND_SUCCESS",
          ...base(),
          note: "generic_text",
        }),
      );
      return { sent: true };
    }

    return { sent: false, errorCode: "unknown_kind", errorMessage: String(kind) };
  } catch (err) {
    const is429 = isLine429Error(err);
    if (is429) {
      console.warn(
        JSON.stringify({
          event: "LINE_RATE_LIMIT_HIT",
          outboundIdPrefix: String(id).slice(0, 8),
          kind,
          thrown: true,
        }),
      );
      return { sent: false, is429: true, errorCode: "line_429" };
    }
    return {
      sent: false,
      errorCode: "unexpected",
      errorMessage: String(err?.message || err),
    };
  }
}

/**
 * Re-delivered duplicate scan (SHA / perceptual hash match): do not consume paid quota.
 * @param {object} [payload] outbound scan_result payload_json
 * @returns {boolean}
 */
export function shouldSkipPaidQuotaDecrementAfterDelivery(payload) {
  return payload?.skipQuotaDecrement === true;
}

/**
 * @param {string} id
 * @param {object} msg full row
 * @param {object} payload
 */
async function handleScanResultPostDelivery(msg, payload) {
  const jobId = msg.related_job_id;
  if (!jobId || payload.error) return;

  const job = await getScanJobById(jobId);
  if (!job) return;

  await updateScanJob(jobId, {
    status: "delivered",
    updated_at: new Date().toISOString(),
  });

  if (shouldSkipPaidQuotaDecrementAfterDelivery(payload)) {
    console.log(
      JSON.stringify({
        event: "QUOTA_DECREMENT_SKIPPED_DUPLICATE",
        jobIdPrefix: String(jobId).slice(0, 8),
        dedupHit: Boolean(payload?.dedupHit),
        dedupType: payload?.dedupType ?? null,
      }),
    );
    return;
  }

  if (job.access_source === "paid" && job.app_user_id) {
    try {
      await decrementUserPaidRemainingScans(job.app_user_id);
      console.log(
        JSON.stringify({
          event: "QUOTA_DECREMENT_AFTER_DELIVERY_OK",
          jobIdPrefix: String(jobId).slice(0, 8),
          appUserIdPrefix: String(job.app_user_id).slice(0, 8),
        }),
      );
    } catch (e) {
      console.error(
        JSON.stringify({
          event: "QUOTA_DECREMENT_AFTER_DELIVERY_FAILED",
          jobIdPrefix: String(jobId).slice(0, 8),
          message: e?.message,
        }),
      );
    }
  }

}

/** กติกา 1 ชิ้นต่อ 1 รูป: reopen the image gate once the report reached (or terminally failed to reach) the customer. */
function releaseScanGate(lineUserId) {
  clearDedupeKey(scanInFlightKeyForUser(lineUserId)).catch(() => {});
}

/** Report couldn't be delivered at all (LINE down/lost) — tell the customer to resend. */
const REPORT_LOST_RESEND_TEXT =
  "ผลอ่านพลังส่งเข้าแชทไม่ผ่านครับ ส่งรูปเดิมมาใหม่อีกครั้ง เดี๋ยวอาจารย์ดูให้ทันที";

/**
 * บอกสิทธิ์คงเหลือทันทีหลัง report ถึงมือ — และถ้าเพิ่งใช้ครั้งสุดท้ายของวัน
 * บอกตรง ๆ ว่าหมดแล้ว พรุ่งนี้มาต่อ (หรือเปิดแพ็กถ้าอยากดูต่อเลย).
 * Runs AFTER handleScanResultPostDelivery so the paid decrement is reflected.
 * @param {string} lineUserId
 * @returns {Promise<string|null>}
 */
/** ปุ่มลัดใต้ข้อความหมดโควตา: เปิด LIFF หน้าเลือกแพ็ก (เมื่อผูก LIFF_ID) + ปุ่มพิมพ์ จ่าย X */
function buildPayLiffQuickReply(sortedPkgs) {
  const items = [];
  const liffId = String(process.env.LIFF_ID || "").trim();
  if (liffId) {
    items.push({
      type: "action",
      action: {
        type: "uri",
        label: "💳 เลือกแพ็กจ่ายเลย",
        uri: `https://liff.line.me/${liffId}?view=pay`,
      },
    });
  }
  for (const p of sortedPkgs.slice(0, 3)) {
    items.push({
      type: "action",
      action: { type: "message", label: `จ่าย ${p.priceThb}`, text: `จ่าย ${p.priceThb}` },
    });
  }
  return items.length ? { items } : null;
}

/** สั้น ๆ สุ่มตาม (user, จำนวนที่เหลือ) — เลขเดิมได้ประโยคเดิม ให้ dedupe 30 นาทีทำงาน */
function pickRemainingText(variants, seedStr) {
  let h = 0;
  const s = String(seedStr || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return variants[h % variants.length];
}

async function buildRemainingQuotaNoticeText(lineUserId) {
  try {
    const { data: u } = await supabase
      .from("app_users")
      .select("id,paid_until,paid_remaining_scans,free_scan_daily_offset,free_scan_offset_date")
      .eq("line_user_id", String(lineUserId || "").trim())
      .maybeSingle();
    if (!u?.id) return null;
    const now = new Date();
    const paidRemaining = Number(u.paid_remaining_scans) || 0;
    if (computePaidActive(u.paid_until, paidRemaining, now)) {
      if (paidRemaining >= 900000) return null; // แพ็กไม่จำกัด — ไม่ต้องนับเหลือให้ฟัง
      return pickRemainingText(
        [
          `เหลืออีก ${paidRemaining} ครั้ง`,
          `สแกนได้อีก ${paidRemaining} ครั้ง`,
          `เหลือ ${paidRemaining} ครั้งนะ`,
          `ยังเหลืออีก ${paidRemaining} ครั้ง ส่งมาต่อได้เลย`,
        ],
        `${lineUserId}:${paidRemaining}`,
      );
    }
    const offer = loadActiveScanOffer(now);
    const freeQuota = Number(offer?.freeQuotaPerDay) || 2;
    let used = await countScanResultsTodayForAppUser(String(u.id), now).catch(() => 0);
    const offsetDate = u.free_scan_offset_date
      ? String(u.free_scan_offset_date).slice(0, 10)
      : null;
    const offsetN = Number(u.free_scan_daily_offset) || 0;
    if (offsetDate && offsetDate === getLocalDateKey(now) && offsetN > 0) {
      used = Math.max(0, used - offsetN);
    }
    const left = Math.max(0, freeQuota - used);
    if (left > 0) {
      return pickRemainingText(
        [
          `วันนี้ฟรีเหลืออีก ${left} ครั้ง`,
          `ฟรีวันนี้ยังเหลือ ${left} ครั้ง`,
          `สแกนฟรีได้อีก ${left} ครั้งวันนี้`,
          `เหลือฟรีอีก ${left} ครั้ง ส่งมาได้เลย`,
        ],
        `${lineUserId}:free:${left}`,
      );
    }
    const pkgs = (offer?.packages || []).filter((p) => p.active);
    if (!pkgs.length) {
      return {
        text: `สิทธิ์สแกนวันนี้ครบแล้ว พรุ่งนี้หลังเที่ยงคืนมีฟรีให้อีก ${freeQuota} ครั้ง`,
        quickReply: null,
      };
    }
    const sortedPkgs = [...pkgs].sort((a, b) => a.priceThb - b.priceThb);
    const menuLines = sortedPkgs.map((p) =>
      Number(p.scanCount) >= 999999
        ? `• ${p.priceThb} บาท — สแกนไม่จำกัด ${Math.round(p.windowHours / 24)} วัน (รายเดือน)`
        : `• ${p.priceThb} บาท — สแกน ${p.scanCount} ครั้ง${p.windowHours >= 48 ? ` / ${Math.round(p.windowHours / 24)} วัน` : ""}`,
    );
    return {
      text: [
        `สิทธิ์สแกนวันนี้ครบแล้ว พรุ่งนี้หลังเที่ยงคืนมีฟรีให้อีก ${freeQuota} ครั้ง`,
        "ถ้าอยากดูต่อวันนี้เลย เปิดสิทธิ์เพิ่มได้ครับ",
        ...menuLines,
      ].join("\n"),
      quickReply: buildPayLiffQuickReply(sortedPkgs),
    };
  } catch {
    return null;
  }
}

async function markSent(id) {
  await updateOutboundMessage(id, {
    status: "sent",
    sent_at: new Date().toISOString(),
    last_error_code: null,
    last_error_message: null,
    next_retry_at: null,
    updated_at: new Date().toISOString(),
  });
}

/** Terminal scan_result failure: reopen the gate + best-effort tell the customer to resend. */
async function handleScanResultTerminalFailure(msg, client) {
  if (msg.kind !== "scan_result") return;
  releaseScanGate(msg.line_user_id);
  if (!client) return;
  try {
    await pushText(client, msg.line_user_id, REPORT_LOST_RESEND_TEXT);
    console.log(
      JSON.stringify({
        event: "SCAN_RESULT_LOST_RESEND_NOTICE_SENT",
        lineUserIdPrefix: lineUserIdPrefix8(msg.line_user_id),
        outboundIdPrefix: idPrefix8(msg.id),
      }),
    );
  } catch {
    /* LINE ยังล่มอยู่ — เกตเปิดแล้ว ลูกค้าส่งใหม่ได้เมื่อระบบกลับมา */
  }
}

/**
 * @param {string} id
 * @param {object} msg
 * @param {{ sent: boolean, is429?: boolean, errorCode?: string, errorMessage?: string }} result
 * @param {{ workerId?: string, attempt?: number }} [traceCtx]
 * @param {object} [client] LINE client for terminal-failure customer notice
 */
export async function finalizeOutboundAttempt(id, msg, result, traceCtx = {}, client = null) {
  const kind = msg.kind;
  const max = OUTBOUND_MAX_ATTEMPTS[kind] ?? 5;
  const base = outboundDeliveryBase(msg, traceCtx);
  const payload =
    msg.payload_json && typeof msg.payload_json === "object"
      ? msg.payload_json
      : {};
  const scanTrace =
    kind === "scan_result"
      ? buildScanResultOutboundTrace(msg, payload)
      : {};

  if (result.sent) return;

  if (result.is429) {
    await incrementLine429CanaryCounter();
    const nextAttempt = msg.attempt_count || 0;
    if (nextAttempt >= max) {
      await updateOutboundMessage(id, {
        status: "dead",
        last_error_code: "line_429",
        last_error_message: "max_attempts",
        updated_at: new Date().toISOString(),
      });
      console.error(
        JSON.stringify({
          event: "OUTBOUND_SEND_FAIL",
          ...base,
          ...scanTrace,
          errorCode: FinalDeliveryErrorCode.LINE_RATE_LIMITED,
          statusCode: 429,
          attempt: nextAttempt,
          reason: "max_429",
          errorMessage: "max_attempts",
        }),
      );
      await handleScanResultTerminalFailure(msg, client);
      return;
    }

    const backoff =
      OUTBOUND_BACKOFF_MS[Math.min(nextAttempt - 1, OUTBOUND_BACKOFF_MS.length - 1)] ??
      40000;
    await setDeliveryRateBackoffMs(msg.line_user_id, backoff, 120);
    const next = new Date(Date.now() + backoff).toISOString();
    await updateOutboundMessage(id, {
      status: "retry_wait",
      next_retry_at: next,
      last_error_code: "line_429",
      last_error_message: "rate_limit",
      updated_at: new Date().toISOString(),
    });
    console.warn(
      JSON.stringify({
        event: "OUTBOUND_SEND_RETRY",
        ...base,
        attempt: nextAttempt + 1,
        backoffMs: backoff,
        nextRetryAt: next,
        reason: "line_429",
      }),
    );
    return;
  }

  await updateOutboundMessage(id, {
    status: "failed",
    last_error_code: result.errorCode || "send_failed",
    last_error_message: String(result.errorMessage || "").slice(0, 2000),
    updated_at: new Date().toISOString(),
  });
  console.error(
    JSON.stringify({
      event: "OUTBOUND_SEND_FAIL",
      ...base,
      ...scanTrace,
      errorCode:
        result.errorCode === "line_429"
          ? FinalDeliveryErrorCode.LINE_RATE_LIMITED
          : result.errorCode === "line_send_failed"
            ? FinalDeliveryErrorCode.LINE_TRANSPORT_FAILED
            : result.errorCode || "send_failed",
      statusCode: result.is429 ? 429 : null,
      reason: result.errorCode || "send_failed",
      errorMessage: String(result.errorMessage || "").slice(0, 500),
    }),
  );
  await handleScanResultTerminalFailure(msg, client);
}
