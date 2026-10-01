// objectCheck ปลอม: ทุกอย่างของจริง ยกเว้น checkSingleObjectGated (AI) → ตอบ single_supported และนับการเรียก
export * from "../../../src/services/objectCheck.service.js?real";
const g = globalThis;
g.__lineIt = g.__lineIt || { calls: [], images: new Map() };
export async function checkSingleObjectGated(imageBase64, opts = {}) {
  g.__lineIt.calls.push({ type: "objectCheckAI", messageId: opts.messageId ?? null, path: opts.path ?? null });
  const firstPass = "single_supported";
  return { result: firstPass, firstPass, secondPass: null, softAccept: false,
    gateMeta: { path: opts.path ?? null, messageId: opts.messageId ?? null, firstPass, secondPass: null, finalDecision: firstPass, supportedFamilyGuess: "amulet" } };
}
