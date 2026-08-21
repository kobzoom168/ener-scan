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

// เกตถามขออนุญาต = เกรด A ขึ้นไป (คะแนน ≥7.5) — กบ 24 ก.ค. "เจอ A ถาม แล้วโพสต์ทันที"
const MIN_SCORE = (() => {
  const n = Number(process.env.FB_CONSENT_MIN_SCORE);
  return Number.isFinite(n) && n > 0 && n <= 10 ? n : 7.5;
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

// กบ 24 ก.ค.: ยกเลิกการขออนุญาตรูปลูกค้าลงเพจ — โพสต์เฉพาะคลังกบเท่านั้น (default ปิด)
function consentAskEnabled() {
  return (
    String(process.env.FB_CONSENT_ASK_ENABLED ?? "false").trim().toLowerCase() === "true"
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

    // 5 แบบไม่ซ้ำ สั้น ไม่อวย (กบ 24 ก.ค.) — สุ่มด้วย hash ของ token ให้คงที่ต่อชิ้น
    const text = pickConsentAskText(piece.token);
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
              action: { type: "message", label: "อวดได้", text: "อวดได้" },
            },
            {
              type: "action",
              action: { type: "message", label: "ขอเก็บส่วนตัว", text: "ขอเก็บส่วนตัว" },
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

/** ข้อความขออนุญาต 5 แบบ สั้น ไม่อวย (กบ 24 ก.ค.) — เลือกตาม hash token คงที่ต่อชิ้น */
const CONSENT_ASK_TEXTS = [
  "ชิ้นนี้ออกมาสวย อาจารย์ขอลงเพจ Ener ได้ไหม ลงแค่ภาพกับผลอ่าน",
  "ขออนุญาตนำชิ้นนี้ลงเพจหน่อย ไม่มีข้อมูลส่วนตัวของคุณ",
  "ชิ้นนี้น่าสนใจ อาจารย์ขอเอาลงเพจ Ener ได้ไหม",
  "ขอลงชิ้นนี้ในเพจได้ไหม ลงเฉพาะภาพวัตถุกับผลอ่าน",
  "ชิ้นนี้อยากเก็บไว้ลงเพจหน่อย อนุญาตไหม",
];
function pickConsentAskText(token) {
  let h = 0;
  const s = String(token || "");
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return CONSENT_ASK_TEXTS[h % CONSENT_ASK_TEXTS.length];
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
    return { reply: "ได้ ชิ้นนี้เก็บไว้ดูส่วนตัว ไม่ลงเพจแน่นอน" };
  }

  try {
    const { data: row, error } = await supabase
      .from("fb_showcase_queue")
      .insert({
        line_user_id: uid,
        public_token: token,
        source: "customer",
        status: "queued",
      })
      .select("id, line_user_id, public_token, source, status")
      .maybeSingle();
    // ชิ้นซ้ำ (unique token) = เคยเข้าคิวแล้ว — ถือว่าสำเร็จ ตอบเหมือนกัน
    if (error && !/duplicate|unique/i.test(String(error.message || ""))) throw error;
    // ลูกค้ากดยินดี = โพสต์ทันที ไม่รอรอบ 11:00/19:00 (กบ 24 ก.ค.) — background ไม่หน่วงตอบแชท
    // คลังกบยังโพสต์ตามรอบเหมือนเดิม · ชิ้นซ้ำ (row null) ข้าม
    if (row?.id && row.status === "queued") {
      void postShowcaseRow(row).catch((e) =>
        console.log(
          JSON.stringify({
            event: "FB_CONSENT_INSTANT_POST_ERROR",
            message: String(e?.message || e).slice(0, 160),
          }),
        ),
      );
    }
  } catch (e) {
    console.log(
      JSON.stringify({
        event: "FB_CONSENT_QUEUE_INSERT_ERROR",
        message: String(e?.message || e).slice(0, 160),
      }),
    );
    return { reply: "รับทราบ จะจัดลงเพจ" };
  }
  console.log(JSON.stringify({ event: "FB_CONSENT_ACCEPTED", tokenPrefix: token.slice(0, 10) }));
  return { reply: "รับทราบ จะจัดลงเพจ" };
}

/* ────────────────────── 3) แคปชัน ────────────────────── */

/** กติกาภาษาเดียวกับแชท: ห้าม em dash / เครื่องหมายคำพูด / การันตีผล */
export function sanitizeFbCaption(s) {
  return String(s || "")
    .replace(/[—–]/g, " ")
    .replace(/[“”"]/g, "")
    // ตาข่ายท้ายสุด (กบ 29 ก.ค.): ห้ามเรียกวัตถุตามประเภท — บังคับเป็น "ชิ้นนี้"
    .replace(/(?:พระเครื่อง|พระบูชา|พระ|หิน|กำไล|เครื่องราง)(?:องค์|ก้อน|เส้น|วง|ชิ้น)(?:นี้|เด่น)/g, "ชิ้นนี้")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** แฮชแท็กตามสายพลังเด่น (จับจากคำในป้ายด้านเด่น) — ดันทางที่ชิ้นนั้นเด่น */
function hashtagsForPeak(peakLabel) {
  const s = String(peakLabel || "");
  // ห้ามแท็กระบุประเภทวัตถุ (กบ 29 ก.ค. — ไม่บอกว่าเป็นพระ/หิน)
  const base = ["#วัตถุมงคล", "#สายมู"];
  let tags = [];
  if (/คุ้มครอง|ปกป้อง|แคล้ว/.test(s)) tags = ["#คุ้มครอง", "#แคล้วคลาด", "#เดินทางปลอดภัย"];
  else if (/เมตตา|เอ็นดู|เสน่ห์/.test(s)) tags = ["#เมตตามหานิยม", "#เสน่ห์", "#คนเอ็นดู"];
  else if (/บารมี|อำนาจ/.test(s)) tags = ["#บารมี", "#อำนาจวาสนา", "#ผู้ใหญ่เมตตา"];
  else if (/โชคลาภ|ทรัพย์|เงิน|ค้าขาย/.test(s)) tags = ["#โชคลาภ", "#ค้าขายร่ำรวย", "#เปิดทรัพย์"];
  else if (/หนุนดวง|ตั้งหลัก|วาสนา/.test(s)) tags = ["#หนุนดวง", "#เสริมดวง", "#ตั้งหลักชีวิต"];
  else tags = ["#ของดีบอกต่อ"];
  return [...tags, ...base].join(" ");
}

/** ท้ายแคปชันโซเชียล (ไม่มีลิงก์ — กบ 24 ก.ค. พร้อมก็อปลง FB/TikTok) */
function captionSocialFooter(peakLabel) {
  return ["", hashtagsAndDisclaimer(peakLabel)].join("\n");
}
function hashtagsAndDisclaimer(peakLabel) {
  return `${hashtagsForPeak(peakLabel)}\n\nอ่านพลังตามแนวทาง Ener ไม่ใช่คำทำนาย`;
}

/** ท้ายแคปชัน "แบบมีลิงก์" (โหมด facebook opt-in) */
function captionFooter(peakLabel) {
  return [
    "",
    `อยากรู้พลังของชิ้นที่บ้าน ทักอาจารย์ได้ ${OA_LINK}`,
    "",
    hashtagsAndDisclaimer(peakLabel),
  ].join("\n");
}

function fallbackCaptionBody(piece) {
  const peak = piece.peakLabel ? ` เด่นด้าน${piece.peakLabel}` : "";
  return `เปิดคลังวันนี้ ${piece.name} อ่านพลังได้ ${piece.energyScore.toFixed(1)} เต็ม 10${peak}`;
}

const CAPTION_SYSTEM = `คุณคือแอดมินเพจ Ener เขียนแคปชันโพสต์โซเชียล (Facebook/TikTok) โชว์พลังของวัตถุมงคลชิ้นเด่น ให้คนเลื่อนผ่านแล้วอยากหยุดดู /* tone-exempt: llm_prompt */
กติกา:
- ภาษาไทย 2-3 บรรทัดสั้น เปิดด้วยประโยคที่สะดุด ชวนสนใจ (hook) แล้วขยายด้วยพลังด้านที่เด่นสุดของชิ้นนี้ (ให้ข้อมูล peakLabel นำ) เช่นถ้าเด่นโชคลาภก็พูดมุมเปิดทางการเงิน/ค้าขาย ถ้าเด่นคุ้มครองก็มุมแคล้วคลาดปลอดภัย — ดันทางที่เด่น
- โทนสุขุมแบบอาจารย์ ไม่อวยเว่อร์ ไม่การันตีผล ไม่ขายตรง แต่เขียนให้มีชีวิตชวนอ่าน ไม่แข็งทื่อ
- อิงข้อมูลที่ให้เท่านั้น ห้ามมโนตัวเลข/สรรพคุณ · พูดคะแนนได้ (เต็ม 10)
- 🚫 ห้ามบอกประเภทวัตถุทุกกรณี (กบ 29 ก.ค.): ห้ามใช้คำว่า พระ หิน กำไล เครื่องราง หรือชนิด/รุ่น/พิมพ์เฉพาะ (สมเด็จ นางพญา ปิดตา หลวงปู่ทวด ไอ้ไข่ ฯลฯ) ห้ามระบุเนื้อ/วัด/เกจิ — เรียกวัตถุว่า **ชิ้นนี้** เท่านั้น
- ห้ามใช้ — หรือ " " · อีโมจิได้ไม่เกิน 1 ตัว
- ห้ามพูดถึงเจ้าของ/ลูกค้า พูดถึงตัวชิ้นอย่างเดียว
ตอบเป็นเนื้อแคปชันล้วน ไม่ต้องมีแฮชแท็กหรือลิงก์ (ระบบเติมเอง)`;

export async function buildCaption(piece) {
  let body = "";
  try {
    const model = getGeminiFlashModel({
    callSite: "fbCaption",
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
  const peak = piece.peakLabel || piece.name;
  return {
    // social: พร้อมก็อปลง FB/TikTok ไม่มีลิงก์ (default)
    social: `${body}\n${captionSocialFooter(peak)}`,
    // full: มีลิงก์ในตัว (โหมด facebook opt-in)
    full: `${body}\n${captionFooter(peak)}`,
  };
}

/**
 * ทุกสแกน → ส่งการ์ด + แคปชันพลังงานเข้า Telegram กบทันที (กบ 24 ก.ค.)
 * รองรับทั้งเลนพระ+กำไล (การ์ด photo-card รองรับแล้ว) · dedupe ต่อ token กันส่งซ้ำ
 * fire-and-forget — ห้าม throw
 * @param {{ lineUserId: string, reportPayload: object, publicToken: string }} p
 */
export async function maybeSendScanCardToTelegram({ reportPayload, publicToken }) {
  try {
    if (
      String(process.env.SCAN_TO_TELEGRAM_ENABLED ?? "true").trim().toLowerCase() === "false"
    ) {
      return { skipped: "disabled" };
    }
    const token = String(publicToken || "").trim();
    if (!token) return { skipped: "no_token" };

    // ดึงข้อมูลการ์ด (รองรับ 2 เลน) — payload อาจไม่มากับ msg (summary_link) → โหลดจาก DB
    const { deriveShowcaseCardData } = await import("./showcasePhotoCard.service.js");
    let data = deriveShowcaseCardData(reportPayload);
    if (!data) {
      const { getScanResultPayloadByPublicToken } = await import(
        "../../stores/scanV2/scanResultsV2.db.js"
      );
      data = deriveShowcaseCardData(await getScanResultPayloadByPublicToken(token));
    }
    if (!data) return { skipped: "not_eligible" };

    // ส่งครั้งเดียวต่อ token
    const first = await tryDedupeOnce(`scan_v2:scan_to_tg:${token}`, 45 * 86400);
    if (!first) return { skipped: "already_sent" };

    const piece = {
      token,
      name: data.name,
      energyScore: data.energyScore,
      peakLabel: data.skills?.[0]?.labelFull || data.name,
    };
    const caption = await buildCaption(piece);
    const cardUrl = `${buildPublicReportUrl(token)}/photo-card.png`;
    const { sendTelegramPhoto, sendTelegramText } = await import("../telegramNotify.service.js");
    const res = await sendTelegramPhoto(
      cardUrl,
      `การ์ดพร้อมโพสต์ · ${piece.name} ${piece.energyScore.toFixed(1)}/10`,
    );
    if (!res.ok) {
      console.log(JSON.stringify({ event: "SCAN_TO_TG_PHOTO_FAILED", reason: res.reason }));
      return { sent: false };
    }
    await sendTelegramText(caption.social).catch(() => {});
    console.log(
      JSON.stringify({ event: "SCAN_TO_TG_SENT", tokenPrefix: token.slice(0, 10), lane: data.lane }),
    );
    return { sent: true };
  } catch (e) {
    console.log(
      JSON.stringify({ event: "SCAN_TO_TG_ERROR", message: String(e?.message || e).slice(0, 160) }),
    );
    return { error: true };
  }
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

/** โหมดส่ง: telegram (กบโพสต์เอง — default 24 ก.ค.) | facebook (โพสต์เพจตรง) */
function showcaseDelivery() {
  return String(process.env.FB_SHOWCASE_DELIVERY || "telegram").trim().toLowerCase();
}

/** โพสต์/ส่ง 1 แถวจากคิว (ใช้ร่วมกันทั้ง sweep ตามรอบ และโหมดทันทีตอนสแกน) */
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
  const cardUrl = `${buildPublicReportUrl(piece.token)}/photo-card.png`;

  // โหมด telegram (กบ 24 ก.ค.): ส่งรูปการ์ด (แยก) + แคปชันพร้อมก็อป (แยก) ให้กบก็อปลง FB/TikTok
  if (showcaseDelivery() === "telegram") {
    const { sendTelegramPhoto, sendTelegramText } = await import("../telegramNotify.service.js");
    // ก้อน 1: รูปการ์ด (caption สั้นบอกว่าคือชิ้นอะไร) — เซฟรูปไปแนบโพสต์
    const res = await sendTelegramPhoto(
      cardUrl,
      `การ์ดพร้อมโพสต์ · ${piece.name} ${piece.energyScore.toFixed(1)}/10`,
    );
    if (!res.ok) {
      await supabase
        .from("fb_showcase_queue")
        .update({ status: "failed", error_message: `telegram: ${res.reason || ""}`.slice(0, 300) })
        .eq("id", row.id);
      console.log(JSON.stringify({ event: "FB_SHOWCASE_TELEGRAM_FAILED", reason: res.reason }));
      return { posted: 0, reason: "telegram_error" };
    }
    // ก้อน 2: แคปชันล้วน (ไม่มีลิงก์) ส่งแยกเป็นข้อความเดียว กดค้างก็อปได้ทั้งก้อน
    await sendTelegramText(caption.social).catch(() => {});
    await supabase
      .from("fb_showcase_queue")
      .update({ status: "posted", caption: caption.social, posted_at: new Date().toISOString() })
      .eq("id", row.id);
    console.log(
      JSON.stringify({
        event: "FB_SHOWCASE_SENT_TELEGRAM",
        tokenPrefix: piece.token.slice(0, 10),
        source: row.source,
      }),
    );
    return { posted: 1, via: "telegram" };
  }

  // โหมด facebook: โพสต์ขึ้นเพจตรง (เก็บไว้ ใช้เมื่อ FB_SHOWCASE_DELIVERY=facebook)
  const res = await postPagePhotoByUrl(cardUrl, caption.full, {
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
  const permalink = res.postId ? await getPostPermalink(res.postId) : "";
  await sendTelegramText(
    `โพสต์ขึ้นเพจ Ener แล้ว (${row.source === "library" ? "คลังกบ" : "ลูกค้ายินดี"})\n${piece.name} · ${piece.energyScore.toFixed(1)}/10${permalink ? `\n${permalink}` : ""}`, /* tone-exempt: admin_telegram */
  ).catch(() => {});
  return { posted: 1, via: "facebook" };
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
  if (!autoPostEnabled()) return { skipped: "disabled" };
  // โหมด facebook ต้องมี token เพจ · โหมด telegram ไม่ต้อง (กบ 24 ก.ค.)
  if (showcaseDelivery() === "facebook" && !isFbPageConfigured()) {
    return { skipped: "fb_not_configured" };
  }
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
