/**
 * Synergy "รายงานจัดชุดพลัง" (กบเคาะ 31 ก.ค. 2026 — สเปกเต็ม docs/ai/plans/ener-synergy-report.md)
 *
 * เฟส 1: หน้า /synergy/:token ผูกคลังลูกค้าจริง — แท่นจัดชุด + แถบวัน (วันนี้/พรุ่งนี้) +
 * ปุ่มภารกิจ 5 (วันทั่วไป/คุยงาน/เดินทาง/เสี่ยงโชค/นัดพบ) กดได้จริง (พรีคำนวณ 10 ชุดฝั่ง server
 * ส่งเป็น JSON — JS สลับ ไม่ยิง API เพิ่ม) + สาย 7 "เสน่หา" (derive จากเมตตา+ป้ายพลัง) +
 * แตะชิ้นเปิดการ์ด+ลิงก์รายงานเต็ม + แถบระดับ 3 ขั้น + ฉายาคลัง
 *
 * กติกาเหล็ก: deterministic (uid+วัน+ภารกิจ+คลังเดิม = ชุดเดิม — seed hash, LLM เนื้อความ
 * cache ต่อวันใน redis) · ห้าม "ชนกัน/ตีกัน" · เรียกพระ "องค์ที่ N" กำไล/หิน "ชิ้นที่ N" ·
 * ไม่มีเลขหน้าแรก · ความเชื่อ "เชื่อกันว่า"
 */
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { supabase } from "../../config/supabase.js";
import { env } from "../../config/env.js";
import {
  getValue,
  setValueWithTtl,
  setLargeValueWithTtl,
} from "../../redis/scanV2Redis.js";
import {
  getGeminiFlashModel,
  generateTextWithTimeout,
} from "../../integrations/gemini/geminiFlash.api.js";

const MAX_PIECES = 24;
const AXES = ["โชคลาภ", "เมตตา", "บารมี", "งานเฉพาะ", "หนุนดวง", "คุ้มครอง", "เสน่หา"];

/** ภารกิจ + น้ำหนักแกน (ตัวเลือกชุด) — deterministic ล้วน */
const MISSIONS = [
  { key: "daily", label: "วันทั่วไป", weights: { หนุนดวง: 3, สมดุล: 0, คุ้มครอง: 1.5, เมตตา: 1 } },
  { key: "work", label: "คุยงานสำคัญ", weights: { บารมี: 3, เมตตา: 2, หนุนดวง: 1 } },
  { key: "travel", label: "เดินทางไกล", weights: { คุ้มครอง: 3, หนุนดวง: 1.5 } },
  { key: "luck", label: "เสี่ยงโชค", weights: { โชคลาภ: 3, หนุนดวง: 1.5 } },
  { key: "date", label: "นัดพบคนสำคัญ", weights: { เสน่หา: 3, เมตตา: 2 } },
];

/** ไอคอนวาดมือ (src/brand/icons) — โหลดครั้งเดียว */
const ICON_FILES = {
  โชคลาภ: "luck.svg", เมตตา: "metta.svg", บารมี: "baramee.svg",
  งานเฉพาะ: "specialty.svg", หนุนดวง: "boost.svg", คุ้มครอง: "protect.svg", เสน่หา: "charm.svg",
};
let ICONS = null;
function icons() {
  if (ICONS) return ICONS;
  ICONS = {};
  for (const [ax, f] of Object.entries(ICON_FILES)) {
    try {
      ICONS[ax] = readFileSync(path.join(process.cwd(), "src", "brand", "icons", f), "utf8")
        .replace(/\s+/g, " ")
        .replace("<svg ", '<svg class="ic" aria-hidden="true" ')
        .trim();
    } catch {
      ICONS[ax] = "";
    }
  }
  return ICONS;
}

// ── token ต่อลูกค้า ──────────────────────────────────────────────

export async function getOrCreateSynergyToken(lineUserId) {
  const uid = String(lineUserId || "").trim();
  if (!uid) return null;
  const { data: u } = await supabase
    .from("app_users")
    .select("id,synergy_token")
    .eq("line_user_id", uid)
    .maybeSingle();
  if (!u) return null;
  if (u.synergy_token) return String(u.synergy_token);
  const token = `syn_${crypto.randomBytes(12).toString("hex")}`;
  const { error } = await supabase
    .from("app_users")
    .update({ synergy_token: token, updated_at: new Date().toISOString() })
    .eq("id", u.id);
  if (error) return null;
  return token;
}

export async function getLineUserIdBySynergyToken(token) {
  const t = String(token || "").trim();
  if (!/^syn_[a-f0-9]{24}$/.test(t)) return null;
  const { data: u } = await supabase
    .from("app_users")
    .select("line_user_id")
    .eq("synergy_token", t)
    .maybeSingle();
  return u?.line_user_id || null;
}

// ── โหลดคลัง + derive 7 สาย ─────────────────────────────────────

/** @returns {Promise<Array<object>>} ชิ้นไม่ซ้ำ ใหม่→เก่า พร้อม axes 7 สาย */
export async function loadVault(lineUserId) {
  const { deriveShowcaseCardData } = await import(
    "../fbShowcase/showcasePhotoCard.service.js"
  );
  const { data: rows, error } = await supabase
    .from("scan_results_v2")
    .select("report_payload_json, html_public_token, created_at")
    .eq("line_user_id", String(lineUserId))
    .order("created_at", { ascending: false })
    .limit(120);
  if (error) throw error;
  const seen = new Set();
  const pieces = [];
  for (const r of rows || []) {
    const d = deriveShowcaseCardData(r.report_payload_json);
    if (!d) continue;
    const key = `${d.name}|${d.energyScore}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const axes = Object.fromEntries(
      (d.axes || []).map((a) => [a.label || a.key, Number(a.score) || 0]),
    );
    // สายที่ 7 เสน่หา (กบ 31 ก.ค.): ฐานเมตตา + โบนัสป้ายพลังสายเสน่ห์ — deterministic ชิ้นเก่าใช้ได้
    const charmy = /เสน่หา|มหานิยม|เสน่ห์/.test(String(d.name || ""));
    axes["เสน่หา"] = Math.min(100, Math.round((axes["เมตตา"] || 0) * 0.88 + (charmy ? 14 : 0)));
    const peak = (d.axes || []).slice().sort((a, b) => b.score - a.score)[0];
    pieces.push({
      n: pieces.length + 1,
      lane: d.lane,
      unit: d.lane === "amulet" ? "องค์ที่" : "ชิ้นที่",
      name: d.name,
      score: d.energyScore,
      grade: d.displayGrade || "",
      img: d.objectImageUrl || "",
      token: String(r.html_public_token || ""),
      peakShort: peak?.label || peak?.key || "",
      axes,
    });
    if (pieces.length >= MAX_PIECES) break;
  }
  return pieces;
}

// ── เครื่องเลือกชุด (deterministic) ─────────────────────────────

function bangkokDateKey(now = new Date(), addDays = 0) {
  const d = new Date(now.getTime() + addDays * 86400e3);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}
function thaiDayName(dateKey) {
  return new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", weekday: "long" })
    .format(new Date(`${dateKey}T12:00:00+07:00`));
}
function seededFrac(str) {
  const h = crypto.createHash("md5").update(str).digest();
  return h.readUInt32BE(0) / 0xffffffff;
}

/** วันในสัปดาห์ → สายที่เชื่อกันว่าเด่น (ตารางตายตัว — ห้าม AI คิดเอง) */
const DAY_AXIS_BOOST = {
  "วันอาทิตย์": "บารมี", "วันจันทร์": "เมตตา", "วันอังคาร": "คุ้มครอง",
  "วันพุธ": "งานเฉพาะ", "วันพฤหัสบดี": "หนุนดวง", "วันศุกร์": "เสน่หา", "วันเสาร์": "โชคลาภ",
};
/** โทนสีเสริมประจำวัน (ตารางตายตัวตามความเชื่อไทยที่คนรู้จักทั่วไป) */
const DAY_COLOR = {
  "วันอาทิตย์": "โทนแดง", "วันจันทร์": "โทนเหลืองครีม", "วันอังคาร": "โทนชมพู",
  "วันพุธ": "โทนเขียว", "วันพฤหัสบดี": "โทนส้มแสด", "วันศุกร์": "โทนฟ้า", "วันเสาร์": "โทนม่วง",
};

function missionScore(piece, mission, dayAxis) {
  let s = 0;
  for (const [ax, w] of Object.entries(mission.weights)) {
    s += (piece.axes[ax] || 0) * w;
  }
  if (dayAxis && mission.weights[dayAxis] == null) s += (piece.axes[dayAxis] || 0) * 0.6;
  s += piece.score * 2; // คุณภาพรวมของชิ้นมีผลเสมอ
  return s;
}

/** เลือกชุด 2 ชิ้น (หลัก+เสริมต่างสาย) ต่อ (วัน, ภารกิจ) — คลังเดิมได้ชุดเดิมเสมอ */
export function pickSet(pieces, mission, dateKey, uid) {
  if (!pieces.length) return null;
  const dayAxis = DAY_AXIS_BOOST[thaiDayName(dateKey)] || null;
  const ranked = pieces
    .map((p) => ({
      p,
      s: missionScore(p, mission, dayAxis) + seededFrac(`${uid}|${dateKey}|${mission.key}|${p.n}`) * 4,
    }))
    .sort((a, b) => b.s - a.s);
  const main = ranked[0].p;
  const partner =
    ranked.slice(1).find((r) => r.p.peakShort !== main.peakShort)?.p ||
    ranked[1]?.p ||
    null;
  return { main, partner, dayAxis };
}

// ── เนื้อความ (LLM 1 ครั้ง/คน/วัน — cache redis) ────────────────

const CONTENT_SYS = `คุณคืออาจารย์ Ener เขียนเนื้อความรายงานจัดชุดพลัง ตอบ JSON เดียวเท่านั้น:
{"vaultTitle":string,"tags":[string,string,string],"setLines":{"daily":string,"work":string,"travel":string,"luck":string,"date":string},"mainLine":string,"gapLine":string,"intent":string}
กติกาภาษา: ทุก line 2 ประโยคเป๊ะ — ประโยคแรกบอกทำอะไร (พก/ห้อย/เพิ่ม/เลือก + เลขชิ้นตามที่ให้) ประโยคสอง "เชื่อกันว่า..." · ห้ามคำ: พุ่งสูง/ทุกมิติ/เติมเต็ม/ขยายโอกาส/สะท้อนพลัง/ชนกัน/ตีกัน
- vaultTitle: ฉายาคลังตามสายเด่น ≤8 คำ ห้ามการันตีรวย · tags: 3 ป้ายสั้นของชุดวันนี้
- setLines: เนื้อความของชุดแต่ละภารกิจตามข้อมูล sets ที่ให้ (ใช้เลขชิ้นให้ตรง) · date=นัดพบคนสำคัญ โทนสุภาพเรื่องเสน่ห์ความประทับใจ ห้ามหยาบโลน
- mainLine: ชิ้นหลักของคลัง วันไหนไม่แน่ใจพกชิ้นนี้ · gapLine: สายที่คลังบางสุด ชวนส่งชิ้นสายนั้นมาสแกนเพิ่มนุ่ม ๆ
- intent: "คำตั้งใจวันนี้" 1 ประโยคสั้น จากสายเด่นของวัน
ห้ามระบุชนิด/รุ่น/วัดพระ · ห้ามการันตีผล · เรียกตามหน่วยที่ให้ (องค์ที่/ชิ้นที่)`;

async function buildContent({ uid, dateKey, pieces, sets, avg, dayAxis }) {
  const cacheKey = `synergy:content:${uid}:${dateKey}`;
  try {
    const cached = await getValue(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch { /* ignore */ }

  const gapAxis = AXES.slice().sort((a, b) => (avg[a] || 0) - (avg[b] || 0))[0];
  const input = {
    day: thaiDayName(dateKey),
    dayAxis,
    gapAxis,
    avgAxes: avg,
    pieces: pieces.map((p) => ({ ref: `${p.unit} ${p.n}`, score: p.score, peak: p.peakShort })),
    sets: Object.fromEntries(
      Object.entries(sets).map(([k, v]) => [
        k,
        { main: `${v.main.unit} ${v.main.n}`, partner: v.partner ? `${v.partner.unit} ${v.partner.n}` : null },
      ]),
    ),
    mainPiece: `${pieces[0].unit} ${[...pieces].sort((a, b) => b.score - a.score)[0].n}`,
  };

  let j = null;
  for (let a = 0; a < 2 && !j; a++) {
    try {
      const model = getGeminiFlashModel({
        systemInstruction: CONTENT_SYS,
        temperature: 0.4,
        timeoutMs: 25000,
        maxTokens: 900,
        modelOverride: env.LLM_CONSULT_MODEL_FREE,
        cacheSystemPrompt: true,
        disableReasoning: true,
      });
      const raw = await generateTextWithTimeout(model, JSON.stringify(input), 25000);
      const t = String(raw).match(/\{[\s\S]*\}/)[0].replace(/,\s*([}\]])/g, "$1");
      j = JSON.parse(t);
      if (!j?.setLines) j = null;
    } catch { /* retry */ }
  }
  if (!j) {
    // fallback deterministic — ไม่มี LLM ก็ต้องได้รายงานครบ
    const mk = (v) =>
      v
        ? `พก${v.main.unit} ${v.main.n}${v.partner ? ` คู่กับ${v.partner.unit} ${v.partner.n}` : ""} ได้เลยครับ เชื่อกันว่าชุดนี้หนุนเรื่องนี้ได้ตรงทาง`
        : "";
    j = {
      vaultTitle: `คลังสาย${dayAxis || "หนุนดวง"}`,
      tags: [dayAxis || "หนุนดวง", "ตั้งหลัก", "มั่นคง"],
      setLines: Object.fromEntries(Object.entries(sets).map(([k, v]) => [k, mk(v)])),
      mainLine: "วันไหนไม่แน่ใจ พกชิ้นหลักของคลังได้เลยครับ เชื่อกันว่าช่วยประคองดวงให้มั่นคง",
      gapLine: `คลังยังบางด้าน${gapAxis} ถ้ามีชิ้นสายนั้นที่บ้าน ส่งมาให้อาจารย์ดูได้ครับ`,
      intent: "ตั้งหลักให้มั่น แล้วเดินทีละก้าวครับ",
    };
  }
  j.gapAxis = gapAxis;
  try {
    await setLargeValueWithTtl(cacheKey, JSON.stringify(j), 26 * 3600);
  } catch { /* ignore */ }
  return j;
}

// ── บันทึก "วันนี้พกชุดนี้" + นับต่อเนื่อง (redis) ────────────────

export async function recordCarryToday(lineUserId) {
  const uid = String(lineUserId);
  const today = bangkokDateKey();
  const yesterday = bangkokDateKey(new Date(), -1);
  const lastKey = `synergy:carry:last:${uid}`;
  const cntKey = `synergy:carry:cnt:${uid}`;
  const last = await getValue(lastKey).catch(() => null);
  let streak = Number(await getValue(cntKey).catch(() => 0)) || 0;
  if (last === today) return { streak: Math.max(1, streak) };
  streak = last === yesterday ? streak + 1 : 1;
  await setValueWithTtl(lastKey, today, 60 * 86400).catch(() => {});
  await setValueWithTtl(cntKey, String(streak), 60 * 86400).catch(() => {});
  console.log(JSON.stringify({ event: "SYNERGY_CARRY_RECORDED", lineUserIdPrefix: uid.slice(0, 10), streak }));
  return { streak };
}

// ── ความรู้ให้อาจารย์ในแชท (กบ 4 ส.ค.: ลูกค้าถามชุดที่จัดให้ ต้องตอบตรงกับรายงาน) ──

/**
 * fact block ชุดจัดของวันนี้สำหรับ consult — deterministic ตัวเดียวกับหน้ารายงาน
 * ไม่ยิง LLM เอง (ใช้คำอ่านจาก cache ต่อเมื่อลูกค้าเคยเปิดหน้าแล้วเท่านั้น) · cache 15 นาที
 * @param {string} lineUserId
 * @returns {Promise<string|null>}
 */
export async function buildSynergyFactsForChat(lineUserId) {
  const uid = String(lineUserId || "").trim();
  if (!uid) return null;
  const todayKey = bangkokDateKey();
  const cacheKey = `synergy:factchat:${uid}:${todayKey}`;
  try {
    const c = await getValue(cacheKey);
    if (c) return c;
  } catch { /* ignore */ }

  const pieces = await loadVault(uid);
  let out;
  if (pieces.length < 3) {
    out =
      `• จัดชุดพลัง: คลังลูกค้ามี ${pieces.length} ชิ้น ยังไม่ครบ 3 ชิ้นขั้นต่ำที่อาจารย์จะจัดชุดให้ได้ — ` +
      `ตอบเรื่องนี้เฉพาะเมื่อลูกค้าถามเอง แล้วชวนส่งชิ้นมาสแกนเพิ่มแบบนุ่ม ๆ`;
  } else {
    const dayName = thaiDayName(todayKey);
    const dayAxis = DAY_AXIS_BOOST[dayName] || null;
    const best = [...pieces].sort((a, b) => b.score - a.score)[0];
    const ref = (pc) => `${pc.unit} ${pc.n} (สาย${pc.peakShort})`;
    const setLine = (m) => {
      const st = pickSet(pieces, m, todayKey, uid);
      return `  - ${m.label}: ${ref(st.main)}${st.partner ? ` คู่กับ ${ref(st.partner)}` : ""}`;
    };
    // คำอ่านจริงจากรายงาน (ถ้า cache ของวันมีอยู่) — ให้คำพูดอาจารย์ตรงกับหน้ารายงานเป๊ะ
    let daySay = null;
    try {
      const raw = await getValue(`synergy:content:${uid}:${todayKey}`);
      const j = raw ? JSON.parse(raw) : null;
      daySay = String(j?.setLines?.daily || "").trim() || null;
    } catch { /* ignore */ }
    out = [
      `• จัดชุดพลังของลูกค้าคนนี้ (ระบบจัดไว้แล้ว ประจำ${dayName}ที่ ${todayKey} — ข้อเท็จจริง ห้ามจัดใหม่/สลับชิ้นเอง):`,
      ...MISSIONS.map(setLine),
      `  - ชิ้นหลักประจำคลัง: ${ref(best)} — วันไหนไม่แน่ใจให้พกชิ้นนี้`,
      ...(dayAxis ? [`  - ${dayName} เชื่อกันว่าสาย${dayAxis}เด่นเป็นพิเศษ (เหตุผลที่ชุดวันนี้ออกมาแบบนี้)`] : []),
      ...(daySay ? [`  - คำอ่านชุดวันทั่วไปตามรายงาน: "${daySay}" (เล่าให้ตรงแนวนี้)`] : []),
      `  - เลของค์ที่/ชิ้นที่ อ้างตามคลังลูกค้า ตรงกับหน้ารายงานจัดชุด · พูดแบบ "เชื่อกันว่า" ห้ามการันตีผล`,
      `  - ⛔️ เรื่อง flow: ใช้ข้อมูลนี้เฉพาะเมื่อลูกค้าถามเรื่องจัดชุด/วันนี้พกชิ้นไหน/ชุดที่จัดให้เอง — ` +
        `ห้ามยกเรื่องจัดชุดขึ้นมาเองหรือดึงบทสนทนาเรื่องอื่นของลูกค้ามาเข้าเรื่องนี้เด็ดขาด · ` +
        `ลูกค้าอยากเปิดดู: บอกว่าพิมพ์ จัดชุด ในแชทนี้ได้เลย`,
    ].join("\n");
  }
  try {
    await setLargeValueWithTtl(cacheKey, out, 900);
  } catch { /* ignore */ }
  return out;
}

// ── Flex carousel แนะนำ (กบ 1 ส.ค. — แทนข้อความล้วน ใช้ทั้ง trigger + คำสั่งแชท) ──

/**
 * @param {string} lineUserId
 * @returns {Promise<object|null>} LINE flex message (carousel) หรือ null ถ้าคลัง <3 ชิ้น
 */
export async function buildSynergyCarouselFlex(lineUserId) {
  const uid = String(lineUserId || "").trim();
  const pieces = await loadVault(uid);
  if (pieces.length < 3) return null;
  const token = await getOrCreateSynergyToken(uid);
  if (!token) return null;
  const base = String(env.APP_BASE_URL || "").replace(/\/+$/, "");
  const url = `${base}/synergy/${token}`;
  const todayKey = bangkokDateKey();
  const dayName = thaiDayName(todayKey);
  const set = pickSet(pieces, MISSIONS[0], todayKey, uid);
  const best = [...pieces].sort((a, b) => b.score - a.score)[0];

  // ธีมตามกล่องในหน้า HTML (กบ 4 ส.ค.): การ์ดละเรื่อง กรอบทอง หัวข้อทอง เนื้อในเหมือน .sec
  const GOLD = "#E8C547", DIM = "#CBB98A", CREAM = "#F5EDD8", BG = "#14110C", LINE_C = "#3A3122";
  const btn = (label, href) => ({
    type: "box", layout: "vertical", backgroundColor: BG,
    paddingAll: "12px", paddingTop: "4px",
    contents: [{
      type: "button", style: "primary", color: "#B8871B", height: "sm",
      action: { type: "uri", label, uri: href || url },
    }],
  });
  const card = ({ title, contents, btnLabel, href }) => ({
    type: "bubble", size: "kilo",
    body: {
      type: "box", layout: "vertical", backgroundColor: BG,
      paddingAll: "14px", spacing: "sm",
      contents: [
        { type: "text", text: title, weight: "bold", size: "md", color: GOLD, wrap: true },
        { type: "separator", color: LINE_C },
        ...contents,
      ],
    },
    footer: btn(btnLabel, href),
  });
  const pieceCol = (pc) => ({
    type: "box", layout: "vertical", flex: 1, spacing: "xs",
    contents: [
      { type: "image", url: pc.img, size: "full", aspectRatio: "3:4", aspectMode: "cover" },
      { type: "text", text: `${pc.unit} ${pc.n}`, size: "sm", weight: "bold", color: GOLD, align: "center" },
      { type: "text", text: `สาย${pc.peakShort}`, size: "xs", color: DIM, align: "center" },
    ],
  });

  const bubbles = [
    // เรื่อง 1: ชุดของวัน — โชว์คู่ชิ้นเหมือนกล่อง "แนะนำพกชุดนี้"
    card({
      title: `ชุดพลัง${dayName}`,
      contents: [
        {
          type: "box", layout: "horizontal", spacing: "sm",
          contents: [
            pieceCol(set.main),
            ...(set.partner
              ? [
                  { type: "text", text: "+", size: "xxl", weight: "bold", color: GOLD, flex: 0, gravity: "center" },
                  pieceCol(set.partner),
                ]
              : []),
          ],
        },
        {
          type: "text", size: "sm", color: CREAM, wrap: true,
          text: set.dayAxis ? `${dayName} เชื่อกันว่าสาย${set.dayAxis}เด่นเป็นพิเศษ` : "อาจารย์จัดจากคลังของคุณ",
        },
      ],
      btnLabel: "เปิดดูชุดของวัน",
      href: url,
    }),
    // เรื่อง 2: ชิ้นหลักประจำคลัง — รูปเล็ก+ข้อความ เหมือน chip ในหน้า HTML
    card({
      title: "ชิ้นหลักประจำคลัง",
      contents: [
        {
          type: "box", layout: "horizontal", spacing: "md", alignItems: "center",
          contents: [
            { type: "image", url: best.img, aspectRatio: "1:1", aspectMode: "cover", flex: 1 },
            {
              type: "box", layout: "vertical", flex: 2, spacing: "xs",
              contents: [
                { type: "text", text: `${best.unit} ${best.n}`, weight: "bold", size: "md", color: GOLD },
                { type: "text", text: `สาย${best.peakShort}`, size: "xs", color: DIM },
              ],
            },
          ],
        },
        { type: "text", text: "วันไหนไม่แน่ใจ พกชิ้นนี้ได้เลย", size: "sm", color: CREAM, wrap: true },
      ],
      btnLabel: "ดูรายละเอียด",
      href: `${url}?go=main`,
    }),
    // เรื่อง 3: เลือกตามภารกิจ — ลิสต์เหมือนแถวปุ่มภารกิจ
    card({
      title: "เลือกชุดตามสิ่งที่จะทำ",
      contents: [
        ...["คุยงานสำคัญ", "เดินทางไกล", "เสี่ยงโชค", "นัดพบคนสำคัญ"].map((t) => ({
          type: "box", layout: "horizontal", spacing: "sm",
          contents: [
            { type: "text", text: "◆", size: "xs", color: GOLD, flex: 0, gravity: "center" },
            { type: "text", text: t, size: "sm", color: CREAM, flex: 1 },
          ],
        })),
        { type: "text", text: `อาจารย์จัดชุดให้จากคลังของคุณ ${pieces.length} ชิ้น`, size: "xs", color: DIM, wrap: true },
      ],
      btnLabel: "เลือกภารกิจ",
      href: `${url}?go=missions`,
    }),
  ];

  return {
    type: "flex",
    altText: "อาจารย์จัดชุดพลังจากคลังของคุณไว้ให้แล้ว เปิดดูได้เลย",
    contents: { type: "carousel", contents: bubbles },
  };
}

// ── ประกอบหน้า ──────────────────────────────────────────────────

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export async function renderSynergyPage(lineUserId) {
  const uid = String(lineUserId);
  const htmlCacheKey = `synergy:html:${uid}:${bangkokDateKey()}`;
  try {
    const cached = await getValue(htmlCacheKey);
    if (cached && cached.length > 5000) return { ok: true, html: cached, fromCache: true };
  } catch { /* ignore */ }
  const pieces = await loadVault(uid);
  if (pieces.length < 3) {
    return { ok: false, reason: "not_enough_pieces", count: pieces.length };
  }
  const avg = {};
  for (const ax of AXES) {
    avg[ax] = Math.round(pieces.reduce((s, p) => s + (p.axes[ax] || 0), 0) / pieces.length);
  }
  const todayKey = bangkokDateKey();
  const tomorrowKey = bangkokDateKey(new Date(), 1);

  // พรีคำนวณ 10 ชุด (2 วัน × 5 ภารกิจ) — JS ฝั่งหน้าแค่สลับ
  const setsByDay = {};
  for (const [dayId, dk] of [["today", todayKey], ["tomorrow", tomorrowKey]]) {
    setsByDay[dayId] = {};
    for (const m of MISSIONS) {
      setsByDay[dayId][m.key] = pickSet(pieces, m, dk, uid);
    }
  }
  const content = await buildContent({
    uid, dateKey: todayKey, pieces,
    sets: setsByDay.today, avg,
    dayAxis: setsByDay.today.daily?.dayAxis || null,
  });

  const IC = icons();
  const lvl = (v) => (v >= 66 ? [3, "เด่นมาก"] : v >= 55 ? [2, "เด่น"] : [1, "เสริมได้อีก"]);
  const lvlBar = (n) => `<span class="lb3">${[1, 2, 3].map((i) => `<i class="${i <= n ? "on" : ""}"></i>`).join("")}</span>`;
  const best = [...pieces].sort((a, b) => b.score - a.score)[0];
  const dayName = thaiDayName(todayKey);
  const dayColor = DAY_COLOR[dayName] || "";

  const pieceJson = JSON.stringify(
    pieces.map((p) => ({
      n: p.n, unit: p.unit, img: p.img, peak: p.peakShort,
      score: p.score.toFixed(1),
      url: p.token ? `/r/${p.token}` : "",
    })),
  );
  const setsJson = JSON.stringify(
    Object.fromEntries(
      Object.entries(setsByDay).map(([day, ms]) => [
        day,
        Object.fromEntries(
          Object.entries(ms).map(([k, v]) => [
            k,
            v ? { a: v.main.n, b: v.partner ? v.partner.n : null, line: content.setLines?.[k] || "" } : null,
          ]),
        ),
      ]),
    ),
  );
  const missionBtns = MISSIONS.map(
    (m, i) => `<button class="mb${i === 0 ? " on" : ""}" data-m="${m.key}">${esc(m.label)}</button>`,
  ).join("");

  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>จัดชุดพลังของคุณ - Ener Scan</title>
<meta name="description" content="อาจารย์จัดชุดวัตถุมงคลจากคลังของคุณ วันนี้ควรพกชิ้นไหน ดูได้เลย">
<meta property="og:title" content="จัดชุดพลังของคุณ - Ener Scan">
<meta property="og:description" content="อาจารย์จัดชุดจากวัตถุมงคลของคุณ ${pieces.length} ชิ้น อ่านตามแนวทาง Ener">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%230d0b08'/%3E%3Ctext x='50' y='68' font-size='52' text-anchor='middle' fill='%23e8c547'%3E✦%3C/text%3E%3C/svg%3E">
<link href="https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;600;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Kanit,sans-serif;background:#0d0b08;color:#f5edd8;max-width:520px;margin:0 auto;padding:16px 14px 40px}
.hd{text-align:center;margin-bottom:8px}
.hd h1{font-size:16px;color:#e8c547;letter-spacing:3px}
.vault{color:#fff;font-size:17px;font-weight:600;margin-top:2px}
.hd small{color:#b3a479;font-size:12.5px}
.tabs{display:flex;gap:8px;justify-content:center;margin:10px 0 4px}
.tabs button,.mrowbtns button{font-family:inherit;cursor:pointer}
.db{background:#14110c;border:1px solid #3a3122;color:#cbb98a;border-radius:20px;padding:6px 18px;font-size:13.5px}
.db.on{background:linear-gradient(90deg,#b8871b,#e8c547);color:#0d0b08;border-color:#e8c547;font-weight:600}
.mrowbtns{display:flex;gap:6px;overflow-x:auto;padding:6px 2px 8px;-webkit-overflow-scrolling:touch}
.mb{flex:0 0 auto;background:#14110c;border:1px solid #3a3122;color:#cbb98a;border-radius:20px;padding:6px 14px;font-size:12.5px}
.mb.on{background:#241d10;border-color:#e8c547;color:#e8c547;font-weight:600}
.today{border:2px solid #e8c547;border-radius:16px;background:linear-gradient(160deg,#241d10,#14110c);padding:16px 14px;text-align:center;box-shadow:0 0 24px rgba(232,197,71,.22)}
.today .tag{color:#e8c547;font-size:14px;font-weight:600}
.pair{display:flex;justify-content:center;align-items:center;gap:10px;margin:12px 0}
.bp{display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer}
.bp:active{transform:scale(.97)}
.bp img{width:118px;height:140px;object-fit:cover;border-radius:12px;border:1px solid #8f6710}
.bp b{color:#e8c547;font-size:14px;white-space:nowrap}.bp span{color:#cbb98a;font-size:11.5px;white-space:nowrap}
.plus{color:#e8c547;font-size:26px;font-weight:800}
.tags{display:flex;justify-content:center;gap:6px;flex-wrap:wrap;margin-bottom:10px}
.tags i{font-style:normal;background:#0d0b08;border:1px solid #8f6710;color:#e8c547;border-radius:20px;padding:2px 12px;font-size:12.5px}
.say{font-size:14.5px;line-height:1.65;color:#f5edd8;min-height:44px}
.daymeta{color:#cbb98a;font-size:12.5px;margin-top:8px}
.sec{border:1px solid #3a3122;border-radius:14px;background:#14110c;padding:13px 14px;margin-top:12px}
.sec h3{color:#e8c547;font-size:15px;margin-bottom:10px}
.chip{display:flex;gap:9px;align-items:center;background:#1a1610;border:1px solid #3a3122;border-radius:10px;padding:7px;cursor:pointer}
.chip:active{transform:scale(.98)}
.chip img{width:42px;height:50px;object-fit:cover;border-radius:6px}
.chip b{color:#e8c547;font-size:13.5px;display:block;white-space:nowrap}.chip span{color:#cbb98a;font-size:11.5px;white-space:nowrap}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.ic{width:19px;height:19px;vertical-align:-4px;margin-right:2px}
.bars{display:flex;flex-direction:column;gap:7px}
.bar{display:flex;align-items:center;gap:8px;font-size:13px}
.bar .nm{flex:0 0 118px;color:#e8dcbc}
.lb3{display:inline-flex;gap:4px}
.lb3 i{width:26px;height:10px;border-radius:3px;background:#33301f;border:1px solid #4a3f22}
.lb3 i.on{background:linear-gradient(90deg,#b8871b,#e8c547);border-color:#e8c547}
.bar .lb{color:#b3a479;font-size:12.5px}
.carry{font-family:inherit;cursor:pointer;margin-top:12px;background:#0d0b08;border:1.5px solid #e8c547;color:#e8c547;border-radius:12px;padding:10px 28px;font-size:14.5px;font-weight:600}
.carry.done{background:linear-gradient(90deg,#b8871b,#e8c547);color:#0d0b08}
.carry-note{color:#cbb98a;font-size:12.5px;margin-top:6px;min-height:16px}
.gap{border:1px dashed #8f6710;border-radius:12px;padding:12px;margin-top:12px;background:#171307}
.gap b{color:#e8c547}.gap p{font-size:13.5px;line-height:1.6;margin-top:4px}
.cta{display:block;text-align:center;background:linear-gradient(90deg,#b8871b,#e8c547);color:#0d0b08;font-weight:600;border-radius:12px;padding:12px;margin-top:14px;text-decoration:none;font-size:15px}
.ft{color:#b3a479;font-size:12px;text-align:center;margin-top:12px;line-height:1.6}
#ov{position:fixed;inset:0;background:rgba(0,0,0,.78);display:none;align-items:center;justify-content:center;z-index:50;padding:20px}
#ov.show{display:flex}
.pm{background:linear-gradient(160deg,#241d10,#14110c);border:1.5px solid #e8c547;border-radius:18px;max-width:340px;width:100%;padding:20px;text-align:center;box-shadow:0 0 30px rgba(232,197,71,.3)}
.pm img{width:180px;height:214px;object-fit:cover;border-radius:12px;border:1px solid #8f6710}
.pm h4{color:#e8c547;font-size:18px;margin:10px 0 2px}
.pm .ps{color:#cbb98a;font-size:13.5px}
.pm .sc{color:#fff;font-size:15px;margin:6px 0 12px}
.pm a.go{display:block;background:linear-gradient(90deg,#b8871b,#e8c547);color:#0d0b08;font-weight:600;border-radius:10px;padding:11px;text-decoration:none;font-size:14.5px}
.pm .cl{margin-top:10px;color:#b3a479;font-size:13px;background:none;border:none;cursor:pointer;font-family:inherit}
@keyframes goflash{0%,60%{box-shadow:0 0 0 2px #e8c547,0 0 26px rgba(232,197,71,.5)}100%{box-shadow:none}}
.goflash{animation:goflash 2.2s ease-out 1;border-radius:14px}
</style></head><body>
<div class="hd"><h1>ENER SCAN</h1><div class="vault">${esc(content.vaultTitle)}</div><small>จัดจากวัตถุมงคลของคุณ ${pieces.length} ชิ้น</small></div>

<div class="tabs"><button class="db on" data-d="today">วันนี้</button><button class="db" data-d="tomorrow">พรุ่งนี้</button></div>
<div class="mrowbtns" id="mission-row">${missionBtns}</div>

<div class="today">
  <div class="tag" id="set-title">${esc(dayName)} แนะนำพกชุดนี้</div>
  <div class="pair" id="set-pair"></div>
  <div class="tags">${(content.tags || []).map((t) => `<i>${esc(t)}</i>`).join("")}</div>
  <div class="say" id="set-line"></div>
  <div class="daymeta">โทนสีเสริมกำลังใจวันนี้: ${esc(dayColor)} · คำตั้งใจ: ${esc(content.intent || "")}</div>
  <button class="carry" id="carry-btn">วันนี้พกชุดนี้</button>
  <div class="carry-note" id="carry-note"></div>
</div>

<div class="sec" id="main-piece"><h3>วันไหนไม่แน่ใจ พกชิ้นนี้</h3>
  <div style="display:flex;flex-direction:column;gap:7px"><div class="grid" style="grid-template-columns:1fr">${`<div class="chip tap" data-n="${best.n}"><img src="${esc(best.img)}" alt="${best.unit} ${best.n}"><div><b>${best.unit} ${best.n}</b><span>${esc(best.peakShort)}</span></div></div>`}</div>
  <p style="font-size:13px;color:#e8dcbc;line-height:1.55">${esc(content.mainLine || "")}</p></div>
</div>

<div class="sec"><h3>คลังของคุณเด่นด้านไหน</h3>
  <div class="bars">${AXES.map((ax) => { const [n, lb] = lvl(avg[ax]); return `<div class="bar"><span class="nm">${IC[ax] || ""} ${ax}</span>${lvlBar(n)}<span class="lb">${lb}</span></div>`; }).join("")}</div>
</div>

<div class="gap"><b>ทัพคุณยังขาดสาย${esc(content.gapAxis || "")}</b><p>${esc(content.gapLine || "")}</p></div>

<a class="cta" href="${esc(String(process.env.YT_SHORT_OA_LINK || "https://lin.ee/p2sxdYFJ"))}">ส่งชิ้นเพิ่มให้อาจารย์ดู เติมทัพให้ครบ</a>
<div class="ft">อ่านพลังตามแนวทาง Ener ไม่ใช่คำทำนาย · ไม่ตัดสินแท้เก๊หรือมูลค่า · ไม่รับรองผล</div>

<div id="ov" role="dialog" aria-modal="true"><div class="pm">
<img id="pm-img" src="" alt=""><h4 id="pm-t"></h4><div class="ps" id="pm-s"></div><div class="sc" id="pm-sc"></div>
<a class="go" id="pm-go" href="#" target="_blank" rel="noopener">เปิดรายงานเต็มของชิ้นนี้</a>
<button class="cl" onclick="document.getElementById('ov').classList.remove('show')">ปิด</button>
</div></div>

<script>
var PIECES=${pieceJson};
var SETS=${setsJson};
var DAYNAMES={today:${JSON.stringify(dayName)},tomorrow:${JSON.stringify(thaiDayName(tomorrowKey))}};
var curDay="today",curM="daily";
function byN(n){return PIECES.find(function(x){return x.n===n})}
function pieceHtml(n){var p=byN(n);if(!p)return "";return '<div class="bp tap" data-n="'+p.n+'" role="button" tabindex="0"><img src="'+p.img+'" alt="'+p.unit+' '+p.n+'"><b>'+p.unit+" "+p.n+'</b><span>'+p.peak+'</span></div>'}
function renderSet(){var s=(SETS[curDay]||{})[curM];if(!s)return;
 var pair=pieceHtml(s.a)+(s.b?'<div class="plus">+</div>'+pieceHtml(s.b):"");
 document.getElementById("set-pair").innerHTML=pair;
 document.getElementById("set-line").textContent=s.line||"";
 var label=curM==="daily"?" แนะนำพกชุดนี้":" · ชุดสำหรับภารกิจนี้";
 document.getElementById("set-title").textContent=DAYNAMES[curDay]+label;}
document.addEventListener("click",function(e){
 var d=e.target.closest(".db");if(d){document.querySelectorAll(".db").forEach(function(b){b.classList.remove("on")});d.classList.add("on");curDay=d.dataset.d;renderSet();return}
 var m=e.target.closest(".mb");if(m){document.querySelectorAll(".mb").forEach(function(b){b.classList.remove("on")});m.classList.add("on");curM=m.dataset.m;renderSet();return}
 var t=e.target.closest(".tap");
 if(!t){if(e.target.id==="ov")document.getElementById("ov").classList.remove("show");return}
 var p=byN(Number(t.dataset.n));if(!p)return;
 document.getElementById("pm-img").src=p.img;
 document.getElementById("pm-img").alt=p.unit+" "+p.n+" สาย"+p.peak;
 document.getElementById("pm-t").textContent=p.unit+" "+p.n;
 document.getElementById("pm-s").textContent="สายเด่น: "+p.peak;
 document.getElementById("pm-sc").textContent="พลังรวม "+p.score+"/10";
 var go=document.getElementById("pm-go");
 if(p.url){go.style.display="block";go.href=p.url}else{go.style.display="none"}
 document.getElementById("ov").classList.add("show");});
renderSet();
document.getElementById("carry-btn").addEventListener("click", async function () {
  var b = this;
  b.disabled = true;
  try {
    var r = await fetch(location.pathname + "/carry", { method: "POST" });
    var j = await r.json();
    if (j.ok) {
      b.textContent = "บันทึกแล้ว ✓";
      b.classList.add("done");
      document.getElementById("carry-note").textContent =
        j.streak > 1 ? "พกตามชุดแนะนำต่อเนื่อง " + j.streak + " วัน" : "ขอให้เป็นวันที่ดีครับ";
    } else { b.disabled = false; }
  } catch (e) { b.disabled = false; }
});
(function(){
 var go=new URLSearchParams(location.search).get("go");
 var el=go==="main"?document.getElementById("main-piece"):go==="missions"?document.getElementById("mission-row"):null;
 if(!el)return;
 setTimeout(function(){el.scrollIntoView({behavior:"smooth",block:"center"});el.classList.add("goflash");},250);
})();
</script>
</body></html>`;

  try {
    await setLargeValueWithTtl(htmlCacheKey, html, 600);
  } catch { /* ignore */ }
  return { ok: true, html };
}
