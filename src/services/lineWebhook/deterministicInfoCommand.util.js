/**
 * State-aware deterministic info commands (Codex รอบ 4): "วิธีใช้/วิธีใช้งาน" และ
 * "สแกนพลังงาน" ต้องเป็น AI=0 ใน "ทุก" state (idle/pending_verify/paywall/
 * awaiting_slip/waiting_birthdate/soft-verify) — router นี้อยู่ก่อน semantic/
 * orchestrator เสมอ · exact match เท่านั้น ประโยคยาวยังไหลไปเลนปกติ
 */

const USAGE_COMMANDS = new Set(["วิธีใช้", "วิธีใช้งาน", "วิธีใช้งาน ener scan", "how to use"]);
const SCAN_ENERGY_COMMANDS = new Set(["สแกนพลังงาน"]);

/** @returns {"usage_help" | "scan_energy" | null} */
export function matchDeterministicInfoCommand(text) {
  const t = String(text || "").trim().toLowerCase();
  if (!t || t.length > 30) return null;
  if (USAGE_COMMANDS.has(t)) return "usage_help";
  if (SCAN_ENERGY_COMMANDS.has(t)) return "scan_energy";
  return null;
}

// ไม่มีบรรทัดราคา/ค่าครู (Codex รอบ 5: ลูกค้าไม่ได้ถามเรื่องเงิน ห้ามชวนซื้อ)
// และไม่มี CTA ซ้ำ/ครับซ้ำ — โทนกบ
export function buildUsageHelpText() {
  return [
    "วิธีใช้งาน Ener Scan",
    "",
    "1) ส่งรูปวัตถุที่ต้องการสแกน",
    "2) ผมจะขอวันเกิด (DD/MM/YYYY)",
    "3) อาจารย์อ่านเสร็จ ผมส่งผลกลับมาในแชทนี้",
  ].join("\n");
}

export function buildScanEnergyText(hasSavedBirthdate) {
  return [
    "ส่งรูปวัตถุที่ต้องการสแกนมาได้ 1 รูปครับ",
    hasSavedBirthdate
      ? "มีวันเกิดบันทึกไว้แล้ว อาจารย์เริ่มอ่านทันที"
      : "ยังไม่มีวันเกิดบันทึกไว้ ผมจะขอวันเกิดก่อนเริ่ม",
  ].join("\n");
}

/**
 * Terminal handler — deterministic ล้วน ไม่มีทางแตะ AI (ไม่มี AI dep ให้เรียกด้วยซ้ำ)
 * @param {{ kind: "usage_help" | "scan_energy", client: any, userId: string,
 *   replyToken: string,
 *   deps: { sendNonScanReply: Function, getSavedBirthdate?: (uid: string) => Promise<any>,
 *     payPickLine?: string | null } }} p
 * @returns {Promise<boolean>} true = จบเทิร์นแล้ว
 */
export async function handleDeterministicInfoCommand({ kind, client, userId, replyToken, deps }) {
  if (kind === "scan_energy") {
    let saved = null;
    try {
      saved = deps.getSavedBirthdate ? await deps.getSavedBirthdate(userId) : null;
    } catch {
      saved = null;
    }
    await deps.sendNonScanReply({
      client,
      userId,
      replyToken,
      replyType: "scan_energy_helper",
      semanticKey: "scan_energy_helper",
      text: buildScanEnergyText(Boolean(saved)),
      alternateTexts: [],
    });
    return true;
  }
  await deps.sendNonScanReply({
    client,
    userId,
    replyToken,
    replyType: "usage_help",
    semanticKey: "usage_help",
    text: buildUsageHelpText(),
    alternateTexts: [
      ["สรุปวิธีใช้", "", "ส่งรูป 1 รูป → บอกวันเกิด DD/MM/YYYY → รอผลในแชท"].join("\n"),
    ],
  });
  return true;
}
