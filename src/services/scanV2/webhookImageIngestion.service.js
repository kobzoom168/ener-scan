import { ensureUserByLineUserId } from "../../stores/users.db.js";
import { env } from "../../config/env.js";
import { uploadScanImageToStorage } from "../../storage/scanUploadStorage.js";
import {
  getScanUploadByLineMessageId,
  insertScanUpload,
} from "../../stores/scanV2/scanUploads.db.js";
import {
  insertScanJob,
  findPendingDebounceJobForUser,
  appendExtraUploadToScanJob,
} from "../../stores/scanV2/scanJobs.db.js";
import { insertOutboundMessage } from "../../stores/scanV2/outboundMessages.db.js";
import {
  OUTBOUND_PRIORITY,
} from "../../stores/scanV2/outboundPriority.js";
import { mapAccessDecisionToSource } from "./mapAccessSource.js";
import { tryDedupeOnce, clearDedupeKey, incrementCounterWithTtl } from "../../redis/scanV2Redis.js";
import {
  scanV2TraceTs,
  lineUserIdPrefix8,
  idPrefix8,
} from "../../utils/scanV2Trace.util.js";

/** ข้อความรับรูป: สั้น ๆ ภาษาพูด 10 แบบ สุ่มตาม message id (กบ Jul 2026: "รับแล้วรอแปป") */
const PRE_SCAN_ACK_VARIANTS = [
  "รับแล้ว รอแปปนะ",
  "รอแปป เดี๋ยวดูให้",
  "แปปนึงนะ",
  "ได้ละ ขอดูแปปนึง",
  "รับแล้วนะ แปปเดียว",
  "มาละ รอแปปนึง",
  "ขอเพ่งดูแปปนะ",
  "กำลังดูให้ รอแปป",
  "อึดใจเดียวนะ",
  "เดี๋ยวดูให้ รอแปปนึง",
];

function pickPreScanAckText(seedStr) {
  let h = 0;
  const s = String(seedStr || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PRE_SCAN_ACK_VARIANTS[h % PRE_SCAN_ACK_VARIANTS.length];
}

/** กติกา 1 ชิ้นต่อ 1 รูป: extra images while a scan is in flight are held (no scan, no quota). */
const MULTI_IMAGE_WAIT_TEXT =
  "อาจารย์ขอดูทีละ 1 รูปนะ\nรูปแรกกำลังเพ่งอยู่ เดี๋ยวผลออกแล้วค่อยส่งชิ้นถัดไป\nถ้าชิ้นเดียวกันหลายมุม เลือกมุมที่ชัดสุดรูปเดียวพอ";

/** ครั้งที่ 2+ ภายใน 6 ชม. → ดุ. */
const MULTI_IMAGE_WAIT_TEXT_STERN =
  "อาจารย์บอกแล้วนะ ให้ส่งทีละ 1 รูป\nส่งพร้อมกันหลายรูปแบบนี้อาจารย์ไม่ดูให้ รอผลชิ้นแรกเสร็จก่อน แล้วค่อยส่งชิ้นถัดไปทีละรูป";

/** รูปตามมาในหน้าต่างหน่วง: แนบเข้าชุดเดียวกัน อาจารย์ดูจากรูปแรกเป็นหลัก */
const DEBOUNCE_ATTACHED_TEXT =
  "ได้รับเพิ่มอีกรูปนะครับ 🙏 อาจารย์ขอดูจากรูปแรกเป็นหลัก 1 ชิ้นต่อ 1 รูป\nถ้าเป็นคนละชิ้น รอผลชิ้นแรกออกก่อน แล้วค่อยส่งชิ้นถัดไปนะครับ";

/** Cap of extra photos absorbed into one debounce window. */
const DEBOUNCE_MAX_EXTRAS = 4;

/** In-flight gate key (delivery worker clears it when the report lands; TTL is the safety net). */
export function scanInFlightKeyForUser(lineUserId) {
  return `scan_v2:inflight:${String(lineUserId || "").trim()}`;
}

/**
 * Webhook-side ingestion: storage + scan_uploads + scan_jobs + pre_scan_ack outbound.
 * @param {object} opts
 * @param {string} opts.userId LINE user id
 * @param {string} opts.lineMessageId
 * @param {Buffer} opts.imageBuffer
 * @param {string} opts.birthdateSnapshot
 * @param {object} opts.accessDecision result of checkScanAccess
 * @param {number|null|undefined} [opts.flowVersion]
 * @returns {Promise<{ ok: boolean, duplicate?: boolean, jobId?: string|null, uploadId?: string|null, outboundId?: string|null, error?: string, errorMessage?: string|null }>}
 */
export async function ingestScanImageAsyncV2({
  userId,
  lineMessageId,
  imageBuffer,
  birthdateSnapshot,
  accessDecision,
  flowVersion = null,
}) {
  const lineUserId = String(userId || "").trim();
  const mid = String(lineMessageId || "").trim();
  const base = () => ({
    path: "web",
    lineUserIdPrefix: lineUserIdPrefix8(lineUserId),
    messageId: mid || null,
    flowVersion: flowVersion ?? null,
    timestamp: scanV2TraceTs(),
  });

  if (!lineUserId || !mid || !imageBuffer?.length) {
    console.error(
      JSON.stringify({
        event: "SCAN_V2_INGEST_FAIL",
        ...base(),
        reason: "missing_fields",
        errorMessage: null,
      }),
    );
    return { ok: false, error: "missing_fields", errorMessage: null };
  }

  const accessSource = mapAccessDecisionToSource(accessDecision);
  if (!accessSource) {
    console.error(
      JSON.stringify({
        event: "SCAN_V2_INGEST_FAIL",
        ...base(),
        reason: "access_denied",
        errorMessage: null,
      }),
    );
    return { ok: false, error: "access_denied", errorMessage: null };
  }

  const existing = await getScanUploadByLineMessageId(mid);
  if (existing?.id) {
    console.log(
      JSON.stringify({
        event: "SCAN_UPLOAD_DEDUPE",
        ...base(),
        uploadIdPrefix: idPrefix8(existing.id),
      }),
    );
    return {
      ok: true,
      duplicate: true,
      uploadId: existing.id,
      jobId: null,
      outboundId: null,
    };
  }

  // Redis dedupe is keyed strictly by LINE message id (one inbound image event).
  // Do not use user-only or coarse keys — that would collapse unrelated events.
  const dedupeRedisKey = `scan_v2:ingest:line_message_id:${mid}`;
  const dedupeFirst = await tryDedupeOnce(dedupeRedisKey, 90);
  if (!dedupeFirst) {
    const raced = await getScanUploadByLineMessageId(mid);
    if (raced?.id) {
      console.log(
        JSON.stringify({
          event: "SCAN_UPLOAD_DEDUPE_REDIS",
          dedupeKeySuffix: "line_message_id",
          ...base(),
          uploadIdPrefix: idPrefix8(raced.id),
        }),
      );
      return {
        ok: true,
        duplicate: true,
        uploadId: raced.id,
        jobId: null,
        outboundId: null,
      };
    }
  }

  // 1 ชิ้นต่อ 1 รูป: hold any image arriving while a scan is still in flight
  // for this user (albums / multi-angle bursts). First photo scans; the rest
  // get ONE polite notice, consume nothing, and the gate reopens when the
  // report is delivered (worker clears the key; TTL 180s = safety net).
  const inflightKey = scanInFlightKeyForUser(lineUserId);
  const inflightFirst = await tryDedupeOnce(inflightKey, 180);
  if (!inflightFirst) {
    // Debounce window still open? → attach this photo to the SAME job
    // (one report; อาจารย์ดูรูปแรกเป็นหลัก) instead of dropping it.
    try {
      const pendingJob = await findPendingDebounceJobForUser(lineUserId);
      const extras = Array.isArray(pendingJob?.extra_upload_ids)
        ? pendingJob.extra_upload_ids
        : [];
      if (pendingJob?.id && extras.length < DEBOUNCE_MAX_EXTRAS) {
        const appUserA = await ensureUserByLineUserId(lineUserId);
        const storedA = await uploadScanImageToStorage({
          lineUserId,
          lineMessageId: mid,
          buffer: imageBuffer,
          mimeType: "image/jpeg",
        });
        const upA = await insertScanUpload({
          line_user_id: lineUserId,
          app_user_id: String(appUserA.id),
          line_message_id: mid,
          storage_bucket: storedA.bucket,
          storage_path: storedA.path,
          mime_type: storedA.mimeType,
          size_bytes: storedA.sizeBytes,
          sha256: storedA.sha256,
          original_expires_at: new Date(
            Date.now() + env.STORAGE_RETENTION_ORIGINAL_DAYS_FREE * 86_400_000,
          ).toISOString(),
          storage_tier: "free",
        });
        if (upA?.id) {
          await appendExtraUploadToScanJob(pendingJob.id, upA.id, extras);
          const attachNoticeFirst = await tryDedupeOnce(
            `scan_v2:debounce_notice:${lineUserId}`,
            120,
          );
          if (attachNoticeFirst) {
            await insertOutboundMessage({
              line_user_id: lineUserId,
              kind: "pre_scan_ack",
              priority: OUTBOUND_PRIORITY.pre_scan_ack,
              related_job_id: pendingJob.id,
              payload_json: { text: DEBOUNCE_ATTACHED_TEXT },
              status: "queued",
            });
          }
          console.log(
            JSON.stringify({
              event: "SCAN_V2_INGEST_ATTACHED_DEBOUNCE",
              ...base(),
              jobIdPrefix: idPrefix8(pendingJob.id),
              extrasCount: extras.length + 1,
            }),
          );
          return {
            ok: true,
            duplicate: true,
            heldInFlight: true,
            uploadId: upA.id,
            jobId: pendingJob.id,
            outboundId: null,
          };
        }
      }
    } catch (attachErr) {
      console.error(
        JSON.stringify({
          event: "SCAN_V2_INGEST_ATTACH_FAIL",
          ...base(),
          errorMessage: String(attachErr?.message || attachErr).slice(0, 160),
        }),
      );
    }
    const noticeFirst = await tryDedupeOnce(
      `scan_v2:inflight_notice:${lineUserId}`,
      120,
    );
    if (noticeFirst) {
      let strikes = 1;
      try {
        strikes = await incrementCounterWithTtl(`scan_v2:multi_img_strikes:${lineUserId}`, 21600);
      } catch {}
      try {
        await insertOutboundMessage({
          line_user_id: lineUserId,
          kind: "pre_scan_ack",
          priority: OUTBOUND_PRIORITY.pre_scan_ack,
          payload_json: { text: strikes >= 2 ? MULTI_IMAGE_WAIT_TEXT_STERN : MULTI_IMAGE_WAIT_TEXT },
          status: "queued",
        });
      } catch (noticeErr) {
        console.error(
          JSON.stringify({
            event: "SCAN_V2_INFLIGHT_NOTICE_FAIL",
            ...base(),
            errorMessage: String(noticeErr?.message || noticeErr).slice(0, 160),
          }),
        );
      }
    }
    console.log(
      JSON.stringify({
        event: "SCAN_V2_INGEST_HELD_IN_FLIGHT",
        ...base(),
        noticed: noticeFirst,
      }),
    );
    return {
      ok: true,
      duplicate: true,
      heldInFlight: true,
      uploadId: null,
      jobId: null,
      outboundId: null,
    };
  }

  const appUser = await ensureUserByLineUserId(lineUserId);
  const appUserId = String(appUser.id);

  const stored = await uploadScanImageToStorage({
    lineUserId,
    lineMessageId: mid,
    buffer: imageBuffer,
    mimeType: "image/jpeg",
  });

  const originalExpiresAt = new Date(
    Date.now() + env.STORAGE_RETENTION_ORIGINAL_DAYS_FREE * 86_400_000,
  ).toISOString();

  const uploadRow = await insertScanUpload({
    line_user_id: lineUserId,
    app_user_id: appUserId,
    line_message_id: mid,
    storage_bucket: stored.bucket,
    storage_path: stored.path,
    mime_type: stored.mimeType,
    size_bytes: stored.sizeBytes,
    sha256: stored.sha256,
    original_expires_at: originalExpiresAt,
    storage_tier: "free",
  });

  if (!uploadRow?.id) {
    console.error(
      JSON.stringify({
        event: "SCAN_V2_INGEST_FAIL",
        ...base(),
        reason: "upload_insert_failed",
        errorMessage: null,
      }),
    );
    await clearDedupeKey(inflightKey);
    return { ok: false, error: "upload_insert_failed", errorMessage: null };
  }

  console.log(
    JSON.stringify({
      event: "SCAN_UPLOAD_STORED",
      ...base(),
      uploadIdPrefix: idPrefix8(uploadRow.id),
      sizeBytes: stored.sizeBytes,
    }),
  );

  const debounceSec = Number(env.SCAN_IMAGE_DEBOUNCE_SECONDS) || 0;
  const jobRow = await insertScanJob({
    line_user_id: lineUserId,
    app_user_id: appUserId,
    upload_id: uploadRow.id,
    birthdate_snapshot: String(birthdateSnapshot || "").trim() || null,
    access_source: accessSource,
    status: "queued",
    priority: 100,
    // 1 ชิ้นต่อ 1 รูป: hold the job briefly so burst photos attach here
    ...(debounceSec > 0
      ? { process_after: new Date(Date.now() + debounceSec * 1000).toISOString() }
      : {}),
  });

  if (!jobRow?.id) {
    console.error(
      JSON.stringify({
        event: "SCAN_V2_INGEST_FAIL",
        ...base(),
        reason: "job_insert_failed",
        errorMessage: null,
        uploadIdPrefix: idPrefix8(uploadRow.id),
      }),
    );
    await clearDedupeKey(inflightKey);
    return { ok: false, error: "job_insert_failed", errorMessage: null };
  }

  console.log(
    JSON.stringify({
      event: "SCAN_JOB_QUEUED",
      ...base(),
      uploadIdPrefix: idPrefix8(uploadRow.id),
      jobIdPrefix: idPrefix8(jobRow.id),
      accessSource,
    }),
  );

  const ackRow = await insertOutboundMessage({
    line_user_id: lineUserId,
    kind: "pre_scan_ack",
    priority: OUTBOUND_PRIORITY.pre_scan_ack,
    related_job_id: jobRow.id,
    payload_json: { text: pickPreScanAckText(mid) },
    status: "queued",
  });

  console.log(
    JSON.stringify({
      event: "PRE_SCAN_ACK_ENQUEUED",
      ...base(),
      jobIdPrefix: idPrefix8(jobRow.id),
      outboundIdPrefix: ackRow?.id ? idPrefix8(ackRow.id) : null,
    }),
  );

  return {
    ok: true,
    jobId: jobRow.id,
    uploadId: uploadRow.id,
    outboundId: ackRow?.id ?? null,
  };
}
