/**
 * Idle reply helper (แยกจาก webhook เพื่อทดสอบ behavior ได้ — Codex P0-5)
 *
 * Contract: orchestrator (planner/consult) ถูกเรียกเฉพาะ allowIdleDirectConsult
 * === true (true-idle free-form fallback จุดเดียว) — เมนู/help/start/เริ่ม และ
 * pending-verify menu เป็น deterministic ล้วน: planner=0, consult=0 ·
 * orchestrator ไม่ handled (เช่น consult null) → deterministic fallback เสมอ
 */

/**
 * @param {{
 *   client: any, replyToken: string, userId: string,
 *   invokePhase1GeminiOrchestrator?: Function | null,
 *   allowIdleDirectConsult?: boolean,
 *   deps: {
 *     sendNonScanReply: Function,
 *     buildIdleDeterministicPrimaryText: () => string,
 *     buildIdleText: (userId: string) => Promise<string | null>,
 *   },
 * }} p
 */
export async function replyIdleTextNoDuplicate({
  client,
  replyToken,
  userId,
  invokePhase1GeminiOrchestrator = null,
  allowIdleDirectConsult = false,
  deps,
}) {
  if (
    allowIdleDirectConsult === true &&
    invokePhase1GeminiOrchestrator &&
    (await invokePhase1GeminiOrchestrator({ allowIdleDirectConsult: true })).handled
  )
    return { via: "orchestrator" };
  const primary = deps.buildIdleDeterministicPrimaryText();
  let personaSoft = null;
  try {
    personaSoft = await deps.buildIdleText(userId);
  } catch {
    personaSoft = null;
  }
  const altPersona =
    String(personaSoft || "").trim() &&
    String(personaSoft).trim() !== primary.trim()
      ? String(personaSoft).trim()
      : null;
  await deps.sendNonScanReply({
    client,
    userId,
    replyToken,
    replyType: "idle_post_scan",
    semanticKey: "idle_post_scan",
    text: primary,
    alternateTexts: [
      ...(altPersona ? [altPersona] : []),
      "มีชิ้นไหนต้องการให้ดู ส่งมา",
    ],
  });
  return { via: "deterministic" };
}
