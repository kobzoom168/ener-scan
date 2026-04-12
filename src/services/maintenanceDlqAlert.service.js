import line from "@line/bot-sdk";
import { env } from "../config/env.js";

/**
 * @param {{ outDead?: number|null, outFailed?: number|null }} counts
 * @param {{ env?: Partial<typeof env>, lineClient?: { pushMessage: (userId: string, msg: { type: string, text?: string }) => Promise<unknown> } }} [deps]
 * @returns {Promise<void>}
 */
export async function maybeSendDlqAlert(counts, deps = {}) {
  const e = deps.env ? { ...env, ...deps.env } : env;
  const adminId = String(e.ADMIN_LINE_USER_ID || "").trim();
  const threshold = Number(e.CANARY_DLQ_DEAD_ALERT_THRESHOLD) || 1;
  const dead = counts.outDead ?? 0;
  const failed = counts.outFailed ?? 0;
  if (!adminId || dead < threshold) return;

  const text = `[DLQ Alert] outbound_messages.dead = ${dead}, failed = ${failed}\nตรวจสอบที่ Supabase: status = 'dead'\nHint: sql/outbound_dead_letter_inspect.template.sql`;

  const client =
    deps.lineClient ??
    new line.Client({
      channelAccessToken: e.CHANNEL_ACCESS_TOKEN,
      channelSecret: e.CHANNEL_SECRET,
    });
  try {
    await client.pushMessage(adminId, { type: "text", text });
    console.log(
      JSON.stringify({
        event: "DLQ_ALERT_SENT",
        adminIdPrefix: adminId.slice(0, 8),
        outDead: dead,
        outFailed: failed,
      }),
    );
  } catch (err) {
    console.error("[DLQ_ALERT] push failed:", err?.message);
  }
}
