#!/usr/bin/env node
/**
 * สร้าง sanitized replay fixture จาก export ของ line_conversation_messages (Codex B4)
 *
 * ใช้: node scripts/replay/build-replay-fixture.mjs <export.csv> <out.jsonl> <label>
 * CSV คอลัมน์: conv(hash6), ts, role, replyType, speakerRole, source, text
 *   (export ด้วย substr(md5(line_user_id),1,6) — ห้ามมี line_user_id ดิบ)
 *
 * ผลลัพธ์ต่อแถว (เฉพาะ role=bot ที่เป็นข้อความถึงลูกค้าจริง):
 *   { id, conversationHash, ts, inbound, state, replyType, speakerRole, source,
 *     outbound, expected: { transport, aiCalls, route, evidence, textPolicy }, classification, reason }
 * classification ตัดจาก "นโยบายเก่าที่ log นี้ถูกตรวจ" (OLD_POLICY) เท่านั้น —
 * ส่วนผล "guard ปัจจุบันจับหรือไม่" ไปพิสูจน์ใน tests/replayConversations.test.js ผ่าน production boundary
 */
import { readFileSync, writeFileSync } from "node:fs";

const [, , inPath, outPath, label = "replay"] = process.argv;
if (!inPath || !outPath) { console.error("usage: build-replay-fixture.mjs <export.csv> <out.jsonl> [label]"); process.exit(2); }

function parseCsv(csv) {
  const rows = []; let cur = [], f = "", q = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (q) { if (c === '"' && csv[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { cur.push(f); f = ""; }
    else if (c === "\n") { cur.push(f); rows.push(cur); cur = []; f = ""; }
    else if (c !== "\r") f += c;
  }
  if (f || cur.length) { cur.push(f); rows.push(cur); }
  return rows;
}

/** sanitize: ตัด PII ที่อาจโผล่ในข้อความ (เบอร์/เลขบัญชี/token ใน URL/LINE id/ชื่อหลังคำว่า คุณ) */
export function sanitize(text) {
  return String(text || "")
    .replace(/U[0-9a-f]{32}/g, "[LINE_ID]")
    .replace(/https?:\/\/[^\s]+/g, "[URL]")
    .replace(/[\d๐-๙][\d๐-๙\- ]{7,}[\d๐-๙]/g, "[NUM]")
    .replace(/\b\d{5,}\b/g, "[NUM]")
    .replace(/คุณ\s?[ก-๙A-Za-z]{2,}(?=\s|$|ครับ|นะ)/gu, "คุณ[NAME]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[EMAIL]")
    .trim();
}

const SYSTEM_MARKER = /^\[.*\]$/;
/** นโยบายเก่าที่ใช้ตรวจ log 19-21 ส.ค. (กบ) — ใช้จัด classification เท่านั้น */
export const OLD_POLICY = [
  [/ครับ|ค่ะ|คร้าบ|จ้า|(?<!บัง)คับ|นะ(?=ลูก|คะ|ครับ|\s|$)/u, "polite_or_soft"],
  [/ขอบคุณ|สาธุ|ยินดี/u, "gratitude_back"],
  [/เยี่ยม|ดีมาก|เก่ง|สุดยอด|โชคดี/u, "praise"],
  [/ไม่ต้องกังวล|สบายใจ|เดี๋ยวก็|ไม่เป็นไร/u, "comfort"],
  [/[?？]|ไหม|มั้ย|หรือเปล่า/u, "question"],
  [/สนใจ|ลองดู|ทักมาได้|บอกได้เลย|บอกอาจารย์ได้/u, "cta"],
  [/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, "emoji"],
];

/** map replyType → expected contract ของ flow นั้น (route/AI/evidence) */
export function expectationFor(replyType, source) {
  const rt = String(replyType || "");
  const llm = /consult|phrasing|chat_fallback|clarifier|conv_surface/i.test(rt);
  const report = /scan_result|report|scan_energy_helper/i.test(rt);
  const step = /payment|slip|paywall|qr|registration|onboard|multiple_objects|reject|retake|object_info_gate/i.test(rt);
  return {
    transport: 0,                // ข้อความเก่าที่ผิด policy ต้องถูก boundary ปัจจุบัน block (transport=0)
    aiCalls: llm ? "<=2" : 0,    // deterministic flow = 0 · LLM flow = งบร่วม ≤2/เทิร์น
    route: source || (llm ? "llm" : "deterministic"),
    evidence: report ? "report_id" : "none",
    toneKind: step ? "step" : llm ? "reply" : "bundle",
  };
}

const rows = parseCsv(readFileSync(inPath, "utf8"));
const out = []; let lastIn = new Map(); let seq = 0; let markers = 0;
for (const [conv, ts, role, replyType, speakerRole, source, text] of rows) {
  if (!conv) continue;
  if (role !== "bot") { lastIn.set(conv, sanitize(text).slice(0, 80)); continue; }
  const outbound = String(text || "").trim();
  if (!outbound) continue;
  if (SYSTEM_MARKER.test(outbound)) { markers++; continue; }
  const old = OLD_POLICY.filter(([re]) => re.test(outbound)).map(([, k]) => k);
  const classification = old.length ? "violated_old_policy" : "clean_under_old_policy";
  seq++;
  out.push({
    id: `${label}-${String(seq).padStart(3, "0")}`,
    conversationHash: conv,
    ts,
    inbound: lastIn.get(conv) || "",
    state: /paywall|payment/i.test(replyType) ? "paywall" : /registration/i.test(replyType) ? "registration" : "idle",
    replyType: replyType || "-",
    speakerRole: speakerRole || "-",
    source: source || "-",
    outbound: sanitize(outbound),
    expected: expectationFor(replyType, source),
    classification,
    reason: old.length ? `old policy hits: ${old.join(",")}` : "no old-policy hit",
  });
}
writeFileSync(outPath, out.map((r) => JSON.stringify(r)).join("\n") + "\n");
console.log(JSON.stringify({ rows: out.length, systemMarkersSkipped: markers, violatedOld: out.filter((r) => r.classification === "violated_old_policy").length }));
