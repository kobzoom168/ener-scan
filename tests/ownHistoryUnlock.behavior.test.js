/**
 * งาน 2 (กบ 23 ก.ย. 2026) — ปลดล็อกคลัง/รายงานย้อนหลังของเจ้าของ
 *
 * กติกาถาวร: เจ้าของดูของเดิมของตัวเองได้เสมอ แม้ไม่เคยซื้อแพ็กหรือแพ็กหมดอายุ
 * สิ่งที่ต้องไม่เปลี่ยน: login/owner auth/ban · รายงาน held/pending/failed ไม่รั่ว ·
 * ไม่เปิดสาธารณะ/ไม่เห็นของคนอื่น · เปิดดูไม่เรียก AI · ไม่ผูกกับสวิตช์ trial
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// hermetic: นับเฉพาะ fetch ไป host โมเดลว่าเป็น AI call
const EXTERNAL = { ai: 0, network: 0 };
globalThis.fetch = async (url) => {
  EXTERNAL.network += 1;
  if (/openai|openrouter|generativelanguage|anthropic|deepseek|llm\./i.test(String(url))) EXTERNAL.ai += 1;
  throw new Error("HERMETIC: network blocked");
};

const { ownHistoryViewFlags, canViewOwnHistory } =
  await import("../src/services/reports/ownHistoryAccess.util.js");

test("กติกาถาวร: เจ้าของเปิดดูของเดิมได้เสมอ และไม่ผูกกับสวิตช์ trial", () => {
  assert.equal(canViewOwnHistory(), true);
  assert.deepEqual(ownHistoryViewFlags(), { accessFull: true, memberAccess: true });
  // ตรวจเฉพาะ "โค้ด" (ตัดคอมเมนต์อธิบายที่มา) — ห้ามผูกกับนโยบายลูกค้าใหม่/สถานะการจ่ายเงิน
  const src = read("src/services/reports/ownHistoryAccess.util.js");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n")
    .filter((l) => !l.trim().startsWith("//")).join("\n");
  for (const forbidden of ["new_customer_trial", "app_settings", "hasRecentPaidAccess", "paid_until", "process.env", "import"])
    assert.ok(!code.includes(forbidden), `กติกานี้ต้องไม่ขึ้นกับ ${forbidden}`);
});

test("ไม่มีแพ็ก/แพ็กหมดอายุ ก็ยังเห็นคลังเต็มไม่ถูกเบลอ", async () => {
  const { renderAmuletLibraryRankingHtml } =
    await import("../src/templates/reports/amuletLibraryRanking.template.js");
  const mkItem = (i) => ({
    displayReportId: `RPT-${i}`,
    publicToken: `tok${i}`,
    thumbUrl: `https://example.invalid/${i}.jpg`,
    powerTotal: 9 - i * 0.3,
    compatPercent: 70 + i,
    peakPowerLabelTh: `ชิ้น ${i}`,
    axisScores: { baramee: 7, metta: 7, luck: 7, protection: 7, fit: 7, specialty: 7 },
    scannedAtIso: "2026-09-01T00:00:00.000Z",
    scanCountInGroup: 1,
    duplicateStatus: null,
  });
  const items = Array.from({ length: 9 }, (_, i) => mkItem(i + 1));
  const library = {
    totalCount: 9,
    items,
    topOverall: items[0],
    byOverall: items,
    byBaramee: items, byMetta: items, byLuck: items,
    byProtection: items, byFit: items, bySpecialty: items,
    byFortuneAnchor: items, axisHighlights: {},
  };
  const { accessFull, memberAccess } = ownHistoryViewFlags();
  const html = renderAmuletLibraryRankingHtml({
    pagePublicToken: "tok_history_test", library, pinnedOriginalCount: 0,
    accessFull, memberAccess, lockedAll: !memberAccess, liffPayUrl: "https://example.invalid",
  });
  // คลาสเบลออยู่ใน stylesheet เสมอ — ต้องเช็คว่า "ถูกใส่ให้ element" หรือไม่
  const appliedBlur = (html.match(/class="[^"]*alib-row-img--blur[^"]*"/g) || []).length;
  const appliedLocked = (html.match(/class="[^"]*alib-pod--locked[^"]*"/g) || []).length;
  assert.equal(appliedBlur, 0, "ห้ามเบลอรูปของเจ้าของ");
  assert.equal(appliedLocked, 0, "ห้ามล็อกชิ้นของเจ้าของ");
  assert.doesNotMatch(html, /เปิดสิทธิ์เพื่อดู/, "ห้ามมีปุ่มจ่ายเงินเพื่อดูของเดิม");
  // และต้องพิสูจน์ว่าเทสต์นี้จับของจริง: ถ้าล็อก ต้องเบลอ
  const lockedHtml = renderAmuletLibraryRankingHtml({
    pagePublicToken: "tok_history_test", library, pinnedOriginalCount: 0,
    accessFull: false, memberAccess: false, lockedAll: true, liffPayUrl: "https://example.invalid",
  });
  assert.ok((lockedHtml.match(/class="[^"]*alib-row-img--blur[^"]*"/g) || []).length > 0,
    "sanity: โหมดล็อกต้องเบลอจริง ไม่งั้นเทสต์ข้างบนไม่มีความหมาย");
  assert.match(html, /ชิ้น 9/, "ต้องเห็นรายการครบ ไม่ใช่เฉพาะชิ้นล่าสุด");
  assert.match(html, /ชิ้น 1/);
});

test("เส้นเปิดดูไม่เหลือเงื่อนไขการจ่ายเงินแล้ว", () => {
  const ctrl = read("src/controllers/report.controller.js");
  // ต้องไม่มีการ "เรียก" เกตจ่ายเงินในเส้นเปิดดูแล้ว (เหลือได้แค่ในคอมเมนต์อธิบายของเดิม)
  const code = ctrl.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  assert.ok(!code.includes("hasRecentPaidAccess("), "controller ต้องไม่เรียกเกตจ่ายเงินอีก");
  assert.ok(!code.includes("countUserPiecesForCensorGate"), "ข้อยกเว้นคลัง ≤5 ชิ้นต้องถูกยกเลิก");
  assert.match(ctrl, /ownHistoryViewFlags\(\)/, "ต้องใช้กติกาถาวรแทน");
  assert.equal((ctrl.match(/ownHistoryViewFlags\(\)/g) || []).length, 2, "ต้องแทนครบทั้งหน้ารายงานและหน้าคลัง");

  const liff = read("src/routes/liff.routes.js");
  const liffCode = liff.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  assert.ok(!liffCode.includes("hasRecentPaidAccess"), "LIFF ต้องไม่เกตด้วยการจ่ายเงินในเส้นเปิดดู");
  assert.match(liff, /const isMember = canViewOwnHistory\(\);/);
  assert.match(liff, /if \(canViewOwnHistory\(\)\) return null;/, "teaser เบลอต้องไม่ถูกสร้างอีก");
});

test("owner authorization / ban / ความเป็นส่วนตัว ยังอยู่ครบ", () => {
  const app = read("src/app.js");
  // คลังส่วนตัวยังต้องแลก token → uid และห้าม index/แคชสาธารณะ
  assert.match(app, /resolveMyScansToken\(token\)/);
  assert.match(app, /private, no-store/);
  assert.match(app, /noindex, nofollow/);
  assert.match(app, /myscans_rl:/, "rate limit ต้องยังอยู่");
  const liff = read("src/routes/liff.routes.js");
  assert.match(liff, /isBanned\(userId\)/, "การเช็คแบนต้องยังอยู่");
});

test("รายงานที่ยัง held/pending/failed ต้องไม่รั่วเพราะปลด paywall", () => {
  // การตัดสินว่ารายงานพร้อมหรือไม่ อยู่คนละชั้นกับ paywall และไม่ถูกแตะ
  const q = read("src/services/reports/reportQuery.service.js");
  assert.match(q, /REPORT_EXPIRED/);
  assert.match(q, /REPORT_UNAVAILABLE/);
  assert.match(q, /REPORT_NOT_FOUND/);
  const ctrl = read("src/controllers/report.controller.js");
  // ทุกเส้นเปิดดูต้องยังเช็ค accessError ก่อน render
  assert.ok((ctrl.match(/accessError/g) || []).length >= 8, "เส้นเปิดดูต้องยังตรวจสถานะรายงาน");
  assert.match(ctrl, /httpStatus \?\? 404/);
});

test("เปิดดูย้อนหลัง = ใช้ข้อมูลเดิม ไม่เรียก AI", async () => {
  const before = EXTERNAL.ai;
  const { renderAmuletLibraryRankingHtml } =
    await import("../src/templates/reports/amuletLibraryRanking.template.js");
  renderAmuletLibraryRankingHtml({
    pagePublicToken: "tok_ai_zero", pinnedOriginalCount: 0,
    library: (() => {
      const it = (i) => ({ displayReportId: `R${i}`, publicToken: `t${i}`, powerTotal: 7, compatPercent: 70,
        peakPowerLabelTh: `ชิ้น ${i}`, axisScores: {}, scannedAtIso: "2026-09-01T00:00:00.000Z", scanCountInGroup: 1 });
      const arr = [it(1), it(2)];
      return { totalCount: 2, items: arr, topOverall: arr[0], byOverall: arr, byBaramee: arr, byMetta: arr,
        byLuck: arr, byProtection: arr, byFit: arr, bySpecialty: arr, byFortuneAnchor: arr, axisHighlights: {} };
    })(),
    ...ownHistoryViewFlags(), lockedAll: false, liffPayUrl: "https://example.invalid",
  });
  assert.equal(EXTERNAL.ai, before, "การ render ของเดิมต้องไม่เรียก AI");
  // โมดูลกติกาต้องไม่ลาก client AI เข้ามาเลย
  const util = read("src/services/reports/ownHistoryAccess.util.js");
  assert.ok(!/openai|gemini|deepseek|openrouter/i.test(util));
});
