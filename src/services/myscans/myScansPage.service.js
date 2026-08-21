/**
 * "ผลสแกนของฉัน" — หน้า HTML ส่วนตัวลิสต์ผลสแกนย้อนหลัง (กบเคาะ 14 ส.ค. 2569)
 *
 * กติกาที่เคาะร่วมกับ Codex:
 * - แสดง 5 รายการ/หน้า + "ดูเพิ่มเติมอีก 5 รายการ" เฉพาะเมื่อมีเกิน (server pagination)
 * - ยุบชิ้นซ้ำด้วย object identity ของระบบ dedupe (diagnostics.baselineIdPrefix) เท่านั้น
 *   — ไม่มี identity = แสดงแยก (ห้ามยุบจากชื่อ/รูป) · รายการที่ยุบบอกจำนวนครั้งที่เคยสแกน
 * - คะแนน/เปอร์เซ็นต์อ่านจาก stored report (summary.*) ห้ามคำนวณใหม่
 * - fallback ครบ: ไม่มีรูป→placeholder ธีมดำทอง · ไม่มีชื่อ→"วัตถุมงคลที่สแกน" ·
 *   ไม่มีคะแนน→ไม่แสดง 0 · ไม่มีลิงก์รายงาน→ปิดปุ่มแจ้งตรง ๆ
 * - token: ms_ + 128-bit random hex · เก็บ sha256 hash ในตาราง user_page_tokens ·
 *   URL ไม่มี LINE user ID · log แค่ prefix
 * - ห้ามใส่ชื่อจริง/เบอร์/วันเกิดบนหน้า
 */
import crypto from "node:crypto";
import { supabase } from "../../config/supabase.js";
import { env } from "../../config/env.js";

export const MYSCANS_PAGE_SIZE = 5;
const MYSCANS_TOKEN_RE = /^ms_[a-f0-9]{32}$/;
const GENERIC_LABELS = new Set(["", "วัตถุจากการสแกน", "วัตถุมงคล", "ไม่ทราบ"]);

/** @param {string} token */
export function isValidMyScansTokenFormat(token) {
  return MYSCANS_TOKEN_RE.test(String(token || "").trim());
}

/** @param {string} token */
export function hashPageToken(token) {
  return crypto.createHash("sha256").update(String(token || ""), "utf8").digest("hex");
}

/** log ได้แค่นี้ ห้าม log token เต็ม (Codex) */
export function tokenPrefixForLog(token) {
  return String(token || "").slice(0, 8);
}

/** @param {string} lineUserId @returns {Promise<string | null>} token ดิบ (โชว์ครั้งเดียวตอนสร้าง/ส่งลิงก์) */
export async function getOrCreateMyScansToken(lineUserId) {
  const uid = String(lineUserId || "").trim();
  if (!uid) return null;
  // token ดิบไม่ได้เก็บ — เก็บ mapping uid→token ล่าสุดใน redis (ttl ยาว) เพื่อ reuse ลิงก์เดิม
  // ถ้า redis หาย = ออก token ใหม่ (rotate โดยธรรมชาติ ลิงก์เก่ายังใช้ได้เพราะ hash ยังอยู่)
  try {
    const { getValue } = await import("../../redis/scanV2Redis.js");
    const cached = await getValue(`myscans_token:${uid}`);
    if (cached && isValidMyScansTokenFormat(cached)) return cached;
  } catch { /* redis พัง = ออกใหม่ */ }

  const token = `ms_${crypto.randomBytes(16).toString("hex")}`;
  const { error } = await supabase.from("user_page_tokens").insert({
    line_user_id: uid,
    purpose: "myscans",
    token_hash: hashPageToken(token),
  });
  if (error) return null;
  try {
    const { setLargeValueWithTtl } = await import("../../redis/scanV2Redis.js");
    await setLargeValueWithTtl(`myscans_token:${uid}`, token, 90 * 24 * 3600);
  } catch { /* ignore */ }
  return token;
}

/** @param {string} token @returns {Promise<string | null>} lineUserId */
export async function resolveMyScansToken(token) {
  const t = String(token || "").trim();
  if (!isValidMyScansTokenFormat(t)) return null;
  const { data: row } = await supabase
    .from("user_page_tokens")
    .select("line_user_id,revoked_at")
    .eq("token_hash", hashPageToken(t))
    .eq("purpose", "myscans")
    .maybeSingle();
  if (!row || row.revoked_at) return null;
  return String(row.line_user_id);
}

/* ---------------- data ---------------- */

/**
 * แปลงแถว scan_results_v2 เป็น item การ์ด — อ่านค่าที่บันทึกไว้เท่านั้น ไม่คำนวณใหม่
 * @param {{ report_payload_json?: any, html_public_token?: string, created_at?: string }} row
 */
export function extractMyScanItem(row) {
  const p = row?.report_payload_json;
  if (!p || typeof p !== "object") return null;
  if (p.precheckMode) return null; // เช็คก่อนเช่า — ไม่ใช่ของลูกค้า
  const rawLabel = String(p.object?.objectLabel || "").trim();
  const name = GENERIC_LABELS.has(rawLabel) ? null : rawLabel;
  const objectType = String(p.object?.objectType || "").trim() || null;
  const img = String(p.object?.objectImageUrl || p.objectImageUrl || "").trim();
  const score = Number(p.summary?.energyScore);
  const compat = Number(p.summary?.compatibilityPercent);
  return {
    name,
    objectType,
    img: /^https:\/\//i.test(img) ? img : null,
    score10: Number.isFinite(score) ? Math.round(score * 10) / 10 : null,
    compatPct: Number.isFinite(compat) ? Math.round(compat) : null,
    reportToken: String(row?.html_public_token || "").trim() || null,
    identity: String(p.diagnostics?.baselineIdPrefix || "").trim() || null,
    createdAt: row?.created_at || null,
    scanCount: 1,
  };
}

/**
 * ยุบชิ้นซ้ำเฉพาะเมื่อ identity ตรงกันจริง (rows เรียงใหม่→เก่า — เก็บครั้งล่าสุดไว้โชว์)
 * @param {Array<ReturnType<typeof extractMyScanItem>>} items
 */
export function groupMyScanItemsByIdentity(items) {
  const out = [];
  const byIdentity = new Map();
  for (const it of items || []) {
    if (!it) continue;
    if (it.identity && byIdentity.has(it.identity)) {
      byIdentity.get(it.identity).scanCount += 1;
      continue;
    }
    if (it.identity) byIdentity.set(it.identity, it);
    out.push(it);
  }
  return out;
}

/** @param {string} lineUserId */
export async function loadMyScanItems(lineUserId) {
  const { data: rows, error } = await supabase
    .from("scan_results_v2")
    .select("report_payload_json, html_public_token, created_at")
    .eq("line_user_id", String(lineUserId))
    .order("created_at", { ascending: false })
    .limit(120);
  if (error) throw error;
  return groupMyScanItemsByIdentity((rows || []).map(extractMyScanItem));
}

/* ---------------- render ---------------- */

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** วันที่ไทย พ.ศ. (เวลาไทย) เช่น "14 ส.ค. 2569" */
export function formatThaiDateBE(iso) {
  const d = new Date(iso || 0);
  if (Number.isNaN(d.getTime())) return "";
  const bkk = new Date(d.getTime() + 7 * 3600 * 1000);
  return `${bkk.getUTCDate()} ${TH_MONTHS[bkk.getUTCMonth()]} ${bkk.getUTCFullYear() + 543}`;
}

const PLACEHOLDER_SVG =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 144'><rect width='120' height='144' rx='12' fill='%23161209'/><text x='60' y='84' font-size='40' text-anchor='middle' fill='%23c9a95f'>✦</text></svg>`,
  );

/**
 * @param {{ items: any[], offset: number, total: number, token: string, synergyUrl?: string | null, chatUrl?: string | null }} p
 */
export function renderMyScansHtml({ items, offset, total, token, synergyUrl = null, chatUrl = null }) {
  const page = items.slice(offset, offset + MYSCANS_PAGE_SIZE);
  const hasMore = total > offset + MYSCANS_PAGE_SIZE;
  const base = "/myscans/" + encodeURIComponent(token);

  const cards = page
    .map((it) => {
      const title = esc(it.name || "วัตถุมงคลที่สแกน");
      const sub = [
        it.objectType ? esc(it.objectType) : null,
        `สแกนล่าสุด ${esc(formatThaiDateBE(it.createdAt))}`,
        it.scanCount > 1 ? `เคยสแกน ${it.scanCount} ครั้ง` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      const scores = [
        it.score10 != null ? `<span class="sc">พลัง <b>${esc(it.score10)}</b>/10</span>` : null,
        it.compatPct != null ? `<span class="sc">เข้ากับคุณ <b>${esc(it.compatPct)}%</b></span>` : null,
      ]
        .filter(Boolean)
        .join("");
      const reportBtn = it.reportToken
        ? `<a class="btn" href="${base}/open-report/${encodeURIComponent(it.reportToken)}">เปิดรายงานเต็ม</a>`
        : `<span class="btn off">รายงานเต็มไม่พร้อมใช้งานแล้ว</span>`;
      return `<div class="card">
  <img src="${esc(it.img || PLACEHOLDER_SVG)}" alt="${title}" loading="lazy">
  <div class="info">
    <div class="t">${title}</div>
    <div class="s">${sub}</div>
    <div class="scores">${scores}</div>
    ${reportBtn}
  </div>
</div>`;
    })
    .join("\n");

  const moreBtn = hasMore
    ? `<a class="more" href="${base}?offset=${offset + MYSCANS_PAGE_SIZE}">ดูเพิ่มเติมอีก ${Math.min(MYSCANS_PAGE_SIZE, total - offset - MYSCANS_PAGE_SIZE)} รายการ</a>`
    : "";
  const backBtn = offset > 0 ? `<a class="more ghost" href="${base}">กลับหน้าแรก</a>` : "";

  const ctas = [
    chatUrl ? `<a class="cta" href="${base}/goto/chat">ส่งรูปชิ้นใหม่</a>` : "",
    synergyUrl ? `<a class="cta ghost" href="${base}/goto/synergy">จัดชุดจากของในคลัง</a>` : "",
  ].join("");

  const empty = `<div class="card"><div class="info"><div class="t">ยังไม่มีผลสแกน</div><div class="s">ส่งรูปพระ เครื่องราง หรือหินมงคลในแชท LINE ได้ ผลมารวมอยู่หน้านี้</div></div></div>`;

  return `<!doctype html><html lang="th"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>ผลสแกนของฉัน · Ener Scan</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%230d0b08'/%3E%3Ctext x='50' y='68' font-size='52' text-anchor='middle' fill='%23e8c547'%3E✦%3C/text%3E%3C/svg%3E">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0d0b08;color:#f0e6cf;font-family:'Kanit','Prompt',system-ui,sans-serif;padding:20px 14px 40px;max-width:560px;margin:0 auto}
h1{font-size:22px;color:#e8c547;font-weight:600;margin-bottom:2px}
.sub{color:#a89468;font-size:13px;margin-bottom:18px}
.card{display:flex;gap:12px;background:#161209;border:1px solid #c9a95f44;border-radius:14px;padding:12px;margin-bottom:12px}
.card img{width:96px;height:116px;object-fit:cover;border-radius:10px;border:1px solid #c9a95f55;flex-shrink:0;background:#0d0b08}
.info{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px}
.t{font-weight:600;font-size:16px;color:#f5edd8}
.s{font-size:12px;color:#a89468;line-height:1.5}
.scores{display:flex;gap:10px;flex-wrap:wrap}
.sc{font-size:12.5px;color:#cbb98a}.sc b{color:#e8c547;font-weight:600}
.btn{display:inline-block;margin-top:2px;padding:7px 14px;border-radius:9px;background:#c9a95f;color:#171204;font-size:13.5px;font-weight:600;text-decoration:none;align-self:flex-start}
.btn.off{background:none;border:1px solid #5a4d33;color:#8a7a58;font-weight:400}
.more{display:block;text-align:center;padding:12px;border:1px solid #c9a95f66;border-radius:12px;color:#e8c547;text-decoration:none;font-size:14.5px;margin:16px 0}
.more.ghost{border-color:#5a4d33;color:#a89468}
.ctas{display:flex;gap:10px;margin-top:22px}
.cta{flex:1;text-align:center;padding:13px;border-radius:12px;background:#c9a95f;color:#171204;font-weight:600;font-size:14.5px;text-decoration:none}
.cta.ghost{background:none;border:1px solid #c9a95f88;color:#e8c547}
.foot{margin-top:26px;text-align:center;color:#5a4d33;font-size:11.5px}
</style></head><body>
<h1>ผลสแกนของฉัน</h1>
<div class="sub">${total} รายการ · หน้านี้เป็นลิงก์ส่วนตัว ไม่ควรส่งต่อให้ผู้อื่น</div>
${page.length ? cards : empty}
${moreBtn}${backBtn}
<div class="ctas">${ctas}</div>
<div class="foot">ENER SCAN</div>
</body></html>`;
}

/* ---------------- LINE flex card (ใบเดียว — Codex ข้อ 5) ---------------- */

/**
 * @param {{ url: string, total: number }} p
 */
export function buildMyScansFlexCard({ url, total }) {
  return {
    type: "flex",
    altText: `ผลสแกนของคุณ ${total} รายการ เปิดดูได้`,
    contents: {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#161209",
        paddingAll: "18px",
        contents: [
          { type: "text", text: "ผลสแกนของฉัน", weight: "bold", size: "lg", color: "#E8C547" },
          {
            type: "text",
            text: `พบผลสแกน ${total} รายการ\nเปิดดูรูป แนน และรายงานย้อนหลังได้ที่นี่`,
            wrap: true,
            size: "sm",
            color: "#CBB98A",
            margin: "md",
          },
          {
            type: "button",
            style: "primary",
            color: "#C9A95F",
            margin: "lg",
            action: { type: "uri", label: "เปิดผลสแกนของฉัน", uri: url },
          },
        ],
      },
    },
  };
}

/* ---------------- ลิงก์กลับแชท OA (CTA "ส่งรูปชิ้นใหม่") ---------------- */

let _basicIdCache = null;
/** @param {{ getBotInfo: () => Promise<{ basicId?: string }> }} client */
export async function getOaChatUrl(client) {
  try {
    if (!_basicIdCache) {
      const info = await client.getBotInfo();
      _basicIdCache = String(info?.basicId || "").trim() || null;
    }
    return _basicIdCache ? `https://line.me/R/ti/p/${_basicIdCache}` : null;
  } catch {
    return null;
  }
}

export function appBaseUrl() {
  return String(env.APP_BASE_URL || "").replace(/\/+$/, "");
}
