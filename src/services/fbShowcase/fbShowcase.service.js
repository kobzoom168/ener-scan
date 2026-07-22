/**
 * Auto post Facebook "อวดพระขึ้นเพจ" (กบ 22 ก.ค. 2026)
 *
 * flow: สแกนเสร็จคะแนน ≥8 → อาจารย์ถามในแชทขออนุญาตอวดชิ้นนี้ในเพจ
 * → ลูกค้ากดยินดี → เข้าคิว fb_showcase_queue → sweep โพสต์วันละ 2 รอบ (11:00/19:00)
 * = การ์ดอวดพระ (/r/:token/card.png — ข้อมูลวัตถุล้วน ไม่มีข้อมูลลูกค้า) + แคปชัน AI
 * → คิวว่าง = หยิบชิ้นจากคลังบัญชีกบ (FB_LIBRARY_LINE_USER_ID) มาโพสต์แทน ไม่ให้เพจเงียบ
 *
 * กติกา: ห้ามโพสต์ชิ้นลูกค้าโดยไม่มี consent เด็ดขาด · แคปชันห้าม "—" / " " /
 * คำการันตี · ทุกอย่าง fail-safe — พังตรงไหนต้องไม่กระทบ flow แชท/รายงาน
 */
import { supabase } from "../../config/supabase.js";
import {
  getValue,
  setValueWithTtl,
  tryDedupeOnce,
} from "../../redis/scanV2Redis.js";
import { insertOutboundMessage } from "../../stores/scanV2/outboundMessages.db.js";
import { OUTBOUND_PRIORITY } from "../../stores/scanV2/outboundPriority.js";
import { listScanResultsV2PayloadRowsForLineUser } from "../../stores/scanV2/scanResultsV2.db.js";
import { buildPublicReportUrl } from "../reports/reportLink.service.js";
import {
  isFbPageConfigured,
  postPagePhotoByUrl,
  getPostPermalink,
} from "../../integrations/facebook/facebookPage.api.js";
import {
  getGeminiFlashModel,
  generateTextWithTimeout,
} from "../../integrations/gemini/geminiFlash.api.js";
import { env } from "../../config/env.js";
import { sendTelegramText } from "../telegramNotify.service.js";

const MIN_SCORE = (() => {
  const n = Number(process.env.FB_CONSENT_MIN_SCORE);
  return Number.isFinite(n) && n > 0 && n <= 10 ? n : 8;
})();
const POST_HOURS_BKK = (() => {
  const raw = String(process.env.FB_AUTOPOST_HOURS ?? "11,19").trim();
  const hours = raw
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 23);
  return new Set(hours.length ? hours : [11, 19]);
})();
/** คลังชิ้นของกบ (เจ้าของระบบ) — แหล่ง fallback ที่โพสต์ได้โดยไม่ต้องขอ consent */
const LIBRARY_LINE_USER_ID = String(
  process.env.FB_LIBRARY_LINE_USER_ID || "Ufe02fffb43200f2a32eabb919130ed9b",
).trim();
const OA_LINK = String(process.env.FB_CAPTION_OA_LINK || "https://lin.ee/6YZeFZ1").trim();

const PENDING_KEY_PREFIX = "scan_v2:fb_consent_pending:";
const ASKED_KEY_PREFIX = "scan_v2:fb_consent_asked:";
const USER_COOLDOWN_KEY_PREFIX = "scan_v2:fb_consent_cooldown:";
const DECLINED_KEY_PREFIX = "scan_v2:fb_consent_declined:";
const PENDING_TTL_SEC = 48 * 3600;
const ASKED_TTL_SEC = 60 * 86400;
const USER_COOLDOWN_TTL_SEC = 3 * 86400;

function consentAskEnabled() {
  return (
    String(process.env.FB_CONSENT_ASK_ENABLED ?? "true").trim().toLowerCase() !== "false"
  );
}
function autoPostEnabled() {
  return (
    String(process.env.FB_AUTOPOST_ENABLED ?? "true").trim().toLowerCase() !== "false"
  );
}

function bangkokHour(now) {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      hour12: false,
    }).format(now),
  );
}
function bangkokDateKey(now) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** ดึงข้อมูลชิ้นจาก report payload (โครงเดียวกับ extractPickPieces ใน liff) */
export function extractShowcasePiece(reportPayload) {
  const p = reportPayload;
  if (!p || typeof p !== "object") return null;
  const a = p.amuletV1;
  if (!a || typeof a !== "object" || Array.isArray(a)) return null; // การ์ดมีเฉพาะเลนพระ
  const energyScore = Number(p.summary?.energyScore);
  if (!Number.isFinite(energyScore)) return null;
  const token = String(p.publicToken || "").trim();
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(token)) return null;
  const objectImageUrl = String(p.objectImageUrl || p.object?.objectImageUrl || "").trim();
  if (!/^https:\/\//i.test(objectImageUrl)) return null; // การ์ดต้องมีรูปวัตถุ
  const name =
    String(a.flexSurface?.heroNamingLine || p.flexSurface?.heroNamingLine || "").trim() ||
    String(a.flexSurface?.headline || "").trim() ||
    "พระ/เทวรูป/เครื่องราง";
  const cats = a.powerCategories || {};
  let peak = null;
  for (const k of Object.keys(cats)) {
    const sc = Number(cats[k]?.score);
    const label = String(cats[k]?.labelThai || "").trim();
    if (Number.isFinite(sc) && label && (!peak || sc > peak.score)) peak = { label, score: sc };
  }
  return { token, name, energyScore, peakLabel: peak ? peak.label : null };
}

/* ────────────────────── 1) ถามขออนุญาตหลังส่ง report ────────────────────── */

/**
 * payload แนบใน outbound อาจไม่มี reportPayload (โหมด summary_link แนบแค่ลิงก์)
 * → โหลด report ตัวเต็มจาก DB ด้วย publicToken แทน
 */
async function resolveShowcasePiece(reportPayload, publicToken) {
  let piece = extractShowcasePiece(reportPayload);
  const token = String(publicToken || "").trim();
  if (!piece && token) {
    try {
      const { getScanResultPayloadByPublicToken } = await import(
        "../../stores/scanV2/scanResultsV2.db.js"
      );
      piece = extractShowcasePiece(await getScanResultPayloadByPublicToken(token));
    } catch {
      piece = null;
    }
  }
  return piece;
}

/**
 * เรียกจาก deliverOutbound หลัง report ถึงมือลูกค้า — fire-and-forget (ห้าม throw)
 * @param {{ lineUserId: string, reportPayload: object }} p
 */
export async function maybeEnqueueFbConsentAsk({ lineUserId, reportPayload, publicToken }) {
  try {
    if (!consentAskEnabled() || !isFbPageConfigured()) return { skipped: "disabled" };
    const uid = String(lineUserId || "").trim();
    if (!uid || uid === LIBRARY_LINE_USER_ID) return { skipped: "library_user" };
    const piece = await resolveShowcasePiece(reportPayload, publicToken);
    if (!piece || piece.energyScore < MIN_SCORE) return { skipped: "not_eligible" };

    const declined = await getValue(`${DECLINED_KEY_PREFIX}${piece.token}`).catch(() => null);
    if (declined) return { skipped: "declined_before" };
    // ถามชิ้นละครั้งเดียว + เว้นระยะต่อคน 3 วัน กันถามถี่จนน่ารำคาญ
    const firstForPiece = await tryDedupeOnce(`${ASKED_KEY_PREFIX}${piece.token}`, ASKED_TTL_SEC);
    if (!firstForPiece) return { skipped: "asked_before" };
    const firstForUser = await tryDedupeOnce(
      `${USER_COOLDOWN_KEY_PREFIX}${uid}`,
      USER_COOLDOWN_TTL_SEC,
    );
    if (!firstForUser) return { skipped: "user_cooldown" };

    const text =
      "ชิ้นนี้พลังสวยมากครับ อาจารย์ขออนุญาตนำการ์ดผลชิ้นนี้ไปอวดในเพจ Ener หน่อยได้ไหมครับ ลงเฉพาะภาพวัตถุกับผลอ่าน ไม่มีข้อมูลของคุณอยู่บนการ์ดแน่นอน";
    await insertOutboundMessage({
      line_user_id: uid,
      kind: "fb_consent_ask",
      priority: OUTBOUND_PRIORITY.fb_consent_ask ?? 85,
      related_job_id: null,
      payload_json: {
        text,
        quickReply: {
          items: [
            {
              type: "action",
              action: { type: "message", label: "ยินดีครับ อวดได้เลย", text: "ยินดีครับ อวดได้เลย" },
            },
            {
              type: "action",
              action: { type: "message", label: "ขอเก็บส่วนตัวครับ", text: "ขอเก็บส่วนตัวครับ" },
            },
          ],
        },
      },
      status: "queued",
    });
    await setValueWithTtl(
      `${PENDING_KEY_PREFIX}${uid}`,
      JSON.stringify({ token: piece.token, name: piece.name }),
      PENDING_TTL_SEC,
    );
    console.log(
      JSON.stringify({
        event: "FB_CONSENT_ASK_ENQUEUED",
        lineUserIdPrefix: uid.slice(0, 10),
        tokenPrefix: piece.token.slice(0, 10),
        energyScore: piece.energyScore,
      }),
    );
    return { asked: true };
  } catch (e) {
    console.log(
      JSON.stringify({
        event: "FB_CONSENT_ASK_ERROR",
        message: String(e?.message || e).slice(0, 160),
      }),
    );
    return { error: true };
  }
}

/* ────────────────────── 2) ดักคำตอบลูกค้าใน webhook ────────────────────── */

const ACCEPT_RE = /ยินดี|อวดได้|ได้เลย|จัดเลย|โอเค|ตามสบาย/;
const DECLINE_RE = /ไม่สะดวก|เก็บส่วนตัว|ไม่อวด|ขอไม่|ไม่ดีกว่า|ไม่เอา/;

/**
 * เรียกจาก webhook ก่อนเข้าสมองแชท — คืน null ถ้าไม่ใช่คำตอบเรื่องนี้ (ปล่อยไหลต่อ)
 * @param {{ lineUserId: string, text: string }} p
 * @returns {Promise<{ reply: string } | null>}
 */
export async function handleFbConsentReplyText({ lineUserId, text }) {
  const uid = String(lineUserId || "").trim();
  const t = String(text || "").trim();
  if (!uid || !t || t.length > 60) return null;
  const rawPending = await getValue(`${PENDING_KEY_PREFIX}${uid}`).catch(() => null);
  if (!rawPending) return null;
  let pending;
  try {
    pending = JSON.parse(String(rawPending));
  } catch {
    return null;
  }
  const token = String(pending?.token || "").trim();
  if (!token) return null;

  const accepted = ACCEPT_RE.test(t);
  const declined = !accepted && DECLINE_RE.test(t);
  if (!accepted && !declined) return null; // ข้อความอื่น — คง pending ไว้ ปล่อยไปสมองแชท

  // เคลียร์ pending ทั้งสองทาง (เขียนทับ TTL สั้น — pattern เดียว clearDailyPickOptout)
  await setValueWithTtl(`${PENDING_KEY_PREFIX}${uid}`, "", 5).catch(() => {});

  if (declined) {
    await setValueWithTtl(`${DECLINED_KEY_PREFIX}${token}`, "1", 180 * 86400).catch(() => {});
    console.log(
      JSON.stringify({ event: "FB_CONSENT_DECLINED", tokenPrefix: token.slice(0, 10) }),
    );
    return { reply: "ได้ครับ ชิ้นนี้เก็บไว้ดูส่วนตัว ไม่ลงเพจแน่นอนครับ" };
  }

  try {
    const { error } = await supabase.from("fb_showcase_queue").insert({
      line_user_id: uid,
      public_token: token,
      source: "customer",
      status: "queued",
    });
    // ชิ้นซ้ำ (unique token) = เคยเข้าคิวแล้ว — ถือว่าสำเร็จ ตอบเหมือนกัน
    if (error && !/duplicate|unique/i.test(String(error.message || ""))) throw error;
  } catch (e) {
    console.log(
      JSON.stringify({
        event: "FB_CONSENT_QUEUE_INSERT_ERROR",
        message: String(e?.message || e).slice(0, 160),
      }),
    );
    return { reply: "ขอบคุณครับ เดี๋ยวอาจารย์จัดลงเพจให้สวย ๆ เลยครับ" };
  }
  console.log(JSON.stringify({ event: "FB_CONSENT_ACCEPTED", tokenPrefix: token.slice(0, 10) }));
  return { reply: "ขอบคุณครับ เดี๋ยวอาจารย์จัดลงเพจให้สวย ๆ เลยครับ" };
}

/* ────────────────────── 3) แคปชัน ────────────────────── */

/** กติกาภาษาเดียวกับแชท: ห้าม em dash / เครื่องหมายคำพูด / การันตีผล */
export function sanitizeFbCaption(s) {
  return String(s || "")
    .replace(/[—–]/g, " ")
    .replace(/[“”"]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function captionFooter() {
  return [
    "",
    `อยากรู้พลังของชิ้นที่บ้าน ส่งรูปให้อาจารย์ดูได้ ฟรีวันละ 1 ชิ้น ${OA_LINK}`,
    "",
    "ผลอ่านเป็นการวิเคราะห์ตามแนวทางของ Ener ไม่ใช่คำทำนาย และไม่ได้ตัดสินแท้หรือเก๊",
    "#พระเครื่อง #เครื่องราง #สายมู #EnerScan",
  ].join("\n");
}

function fallbackCaptionBody(piece) {
  const peak = piece.peakLabel ? ` เด่นด้าน${piece.peakLabel}` : "";
  return `เปิดคลังวันนี้ ${piece.name} อ่านพลังได้ ${piece.energyScore.toFixed(1)} เต็ม 10${peak} ครับ`;
}

const CAPTION_SYSTEM = `คุณคือแอดมินเพจ Ener เพจอ่านพลังงานพระเครื่องและเครื่องราง เขียนแคปชันโพสต์อวดชิ้นเด่นประจำวัน
กติกา:
- ภาษาไทย 2-3 ประโยคสั้น โทนอาจารย์ชายวัย 41 สุขุม ภูมิใจนำเสนอ ไม่โอ้อวดเกินจริง ไม่ขายตรง
- ต้องอิงข้อมูลที่ให้เท่านั้น ห้ามมโนตัวเลขหรือสรรพคุณเพิ่ม ห้ามการันตีโชคลาภหรือผลใด ๆ
- ห้ามใช้เครื่องหมาย — หรือ " " ห้ามอีโมจิเกิน 1 ตัว
- ห้ามพูดถึงเจ้าของชิ้นหรือลูกค้า (พูดถึงตัวชิ้นอย่างเดียว)
ตอบเป็นเนื้อแคปชันล้วน ไม่ต้องมีแฮชแท็กหรือลิงก์ (ระบบเติมเอง)`;

async function buildCaption(piece) {
  let body = "";
  try {
    const model = getGeminiFlashModel({
      systemInstruction: CAPTION_SYSTEM,
      temperature: 0.7,
      timeoutMs: 20000,
      maxTokens: 500,
      modelOverride: env.LLM_CONSULT_MODEL_FREE,
      cacheSystemPrompt: true,
      disableReasoning: true,
    });
    if (model) {
      const raw = await generateTextWithTimeout(
        model,
        JSON.stringify({
          name: piece.name,
          energyScore: piece.energyScore,
          peakLabel: piece.peakLabel,
        }),
        20000,
      );
      body = sanitizeFbCaption(raw).slice(0, 600);
    }
  } catch {
    body = "";
  }
  if (!body || body.length < 20) body = fallbackCaptionBody(piece);
  return `${body}\n${captionFooter()}`;
}

/* ────────────────────── 4) sweep โพสต์ตามรอบ ────────────────────── */

async function pickNextQueuedRow() {
  const { data, error } = await supabase
    .from("fb_showcase_queue")
    .select("id, line_user_id, public_token, source, status")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/** คิวว่าง → หยิบชิ้นคะแนนสูงสุดจากคลังกบที่ยังไม่เคยโพสต์ เข้าคิวเป็น source library */
async function enqueueFromLibrary() {
  if (!LIBRARY_LINE_USER_ID) return null;
  const rows = await listScanResultsV2PayloadRowsForLineUser(LIBRARY_LINE_USER_ID, 150);
  if (!rows?.length) return null;
  const { data: usedRows, error: usedErr } = await supabase
    .from("fb_showcase_queue")
    .select("public_token")
    .limit(1000);
  if (usedErr) throw usedErr;
  const used = new Set((usedRows || []).map((r) => String(r.public_token)));
  let best = null;
  for (const r of rows) {
    const piece = extractShowcasePiece(r?.report_payload_json);
    if (!piece || used.has(piece.token)) continue;
    if (!best || piece.energyScore > best.energyScore) best = piece;
  }
  if (!best) return null;
  const { data, error } = await supabase
    .from("fb_showcase_queue")
    .insert({
      line_user_id: LIBRARY_LINE_USER_ID,
      public_token: best.token,
      source: "library",
      status: "queued",
    })
    .select("id, line_user_id, public_token, source, status")
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function loadPieceByToken(token) {
  const { getScanResultPayloadByPublicToken } = await import(
    "../../stores/scanV2/scanResultsV2.db.js"
  );
  const payload = await getScanResultPayloadByPublicToken(token);
  return extractShowcasePiece(payload);
}

/** โพสต์ 1 แถวจากคิว (ใช้ร่วมกันทั้ง sweep ตามรอบ และโหมดโพสต์ทันทีตอนสแกน) */
async function postShowcaseRow(row) {
  const piece = await loadPieceByToken(row.public_token);
  if (!piece) {
    await supabase
      .from("fb_showcase_queue")
      .update({ status: "skipped", error_message: "payload not eligible anymore" })
      .eq("id", row.id);
    return { posted: 0, reason: "stale_row" };
  }

  const caption = await buildCaption(piece);
  const cardUrl = `${buildPublicReportUrl(piece.token)}/card.png`;
  const res = await postPagePhotoByUrl(cardUrl, caption, {
    published:
      String(process.env.FB_AUTOPOST_UNPUBLISHED ?? "false").trim().toLowerCase() !== "true",
  });

  if (!res.ok) {
    await supabase
      .from("fb_showcase_queue")
      .update({ status: "failed", error_message: String(res.error || "").slice(0, 300) })
      .eq("id", row.id);
    console.log(
      JSON.stringify({ event: "FB_AUTOPOST_FAILED", error: String(res.error || "").slice(0, 200) }),
    );
    await sendTelegramText(
      `โพสต์เพจไม่สำเร็จ (${piece.name})\n${String(res.error || "").slice(0, 300)}`,
    ).catch(() => {});
    return { posted: 0, reason: "fb_error" };
  }

  await supabase
    .from("fb_showcase_queue")
    .update({
      status: "posted",
      caption,
      fb_post_id: res.postId || null,
      posted_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  console.log(
    JSON.stringify({
      event: "FB_AUTOPOST_POSTED",
      tokenPrefix: piece.token.slice(0, 10),
      source: row.source,
      fbPostId: res.postId || null,
    }),
  );
  const permalink = res.postId ? await getPostPermalink(res.postId) : "";
  await sendTelegramText(
    `โพสต์ขึ้นเพจ Ener แล้ว (${row.source === "library" ? "คลังกบ" : "ลูกค้ายินดี"})\n${piece.name} · ${piece.energyScore.toFixed(1)}/10${permalink ? `\n${permalink}` : ""}`,
  ).catch(() => {});
  return { posted: 1 };
}

/**
 * โหมดทดสอบ (กบ 22 ก.ค.): สแกนชิ้นจากบัญชีเจ้าของระบบ → โพสต์ขึ้นเพจทันที ไม่รอรอบ
 * เปิดด้วย FB_AUTOPOST_ON_SCAN=true (default ปิด — ตั้งใจใช้เฉพาะ staging)
 * จำกัดเฉพาะ FB_LIBRARY_LINE_USER_ID เท่านั้น ชิ้นลูกค้าไม่เข้าเงื่อนไขนี้เด็ดขาด
 * @param {{ lineUserId: string, reportPayload: object }} p
 */
export async function maybeAutoPostOnScan({ lineUserId, reportPayload, publicToken }) {
  try {
    if (
      String(process.env.FB_AUTOPOST_ON_SCAN ?? "false").trim().toLowerCase() !== "true"
    ) {
      return { skipped: "disabled" };
    }
    if (!isFbPageConfigured()) return { skipped: "not_configured" };
    const uid = String(lineUserId || "").trim();
    const skip = (reason) => {
      console.log(
        JSON.stringify({
          event: "FB_AUTOPOST_ON_SCAN_SKIPPED",
          reason,
          lineUserIdPrefix: uid.slice(0, 10),
          tokenPrefix: String(publicToken || "").slice(0, 12),
        }),
      );
      return { skipped: reason };
    };
    if (!uid || uid !== LIBRARY_LINE_USER_ID) return skip("not_library_user");
    const piece = await resolveShowcasePiece(reportPayload, publicToken);
    if (!piece) return skip("not_eligible");

    const { data: row, error } = await supabase
      .from("fb_showcase_queue")
      .insert({
        line_user_id: uid,
        public_token: piece.token,
        source: "library",
        status: "queued",
      })
      .select("id, line_user_id, public_token, source, status")
      .maybeSingle();
    if (error) {
      if (/duplicate|unique/i.test(String(error.message || ""))) {
        return { skipped: "already_queued" };
      }
      throw error;
    }
    return await postShowcaseRow(row);
  } catch (e) {
    console.log(
      JSON.stringify({
        event: "FB_AUTOPOST_ON_SCAN_ERROR",
        message: String(e?.message || e).slice(0, 200),
      }),
    );
    return { error: true };
  }
}

/**
 * เรียกทุกนาทีจาก maintenanceWorker — โพสต์จริงเฉพาะชั่วโมงใน FB_AUTOPOST_HOURS
 * (default 11,19) รอบละ 1 โพสต์ ต่อวันไม่เกินจำนวนรอบ
 * @param {Date} [now]
 */
export async function runFbShowcaseAutoPostSweep(now = new Date()) {
  if (!autoPostEnabled() || !isFbPageConfigured()) return { skipped: "disabled" };
  const hour = bangkokHour(now);
  if (!POST_HOURS_BKK.has(hour)) return { skipped: "not_post_hour" };
  const slotKey = `scan_v2:fb_autopost_done:${bangkokDateKey(now)}:${hour}`;
  const first = await tryDedupeOnce(slotKey, 20 * 3600);
  if (!first) return { skipped: "slot_done" };

  try {
    let row = await pickNextQueuedRow();
    if (!row) row = await enqueueFromLibrary();
    if (!row) {
      console.log(JSON.stringify({ event: "FB_AUTOPOST_QUEUE_EMPTY" }));
      return { posted: 0, reason: "queue_empty" };
    }
    return await postShowcaseRow(row);
  } catch (e) {
    console.log(
      JSON.stringify({
        event: "FB_AUTOPOST_SWEEP_ERROR",
        message: String(e?.message || e).slice(0, 200),
      }),
    );
    return { error: true };
  }
}
