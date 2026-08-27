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
  onConsultUnavailable = null,
  deps,
}) {
  if (allowIdleDirectConsult === true && invokePhase1GeminiOrchestrator) {
    const orch = await invokePhase1GeminiOrchestrator({ allowIdleDirectConsult: true });
    if (orch.handled) return { via: "orchestrator" };
    // consult ตอบไม่ได้ (timeout/ว่าง) + คำถาม → fallback ซื่อสัตย์แทน nudge (flow-role เคส 6)
    if (orch.reason === "idle_bypass_consult_null" && typeof onConsultUnavailable === "function") {
      const fb = await onConsultUnavailable().catch(() => null);
      if (fb && fb.text) {
        const r = await deps.sendNonScanReply({
          client,
          userId,
          replyToken,
          replyType: fb.replyType || "consult_unavailable",
          semanticKey: fb.replyType || "consult_unavailable",
          text: fb.text,
          alternateTexts: [],
          speakerRoleOverride: fb.speakerRole || "admin",
        });
        console.log(JSON.stringify({ event: "CONSULT_UNAVAILABLE_FALLBACK", via: fb.via, sent: r?.sent === true }));
        return { via: "consult_unavailable" };
      }
    }
  }
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
      "มีชิ้นไหนอยากให้ดูต่อก็ส่งมา\nเดี๋ยวไล่ดูให้",
    ],
  });
  return { via: "deterministic" };
}
