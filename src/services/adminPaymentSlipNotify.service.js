import { env } from "../config/env.js";
import { invokeLinePushMessage } from "../utils/lineClientTransport.util.js";

/**
 * Push a LINE text to `ADMIN_LINE_USER_ID` when a payment slip is accepted into `pending_verify`
 * (manual PromptPay flow). Same env as DLQ alerts; disable with `ADMIN_PAYMENT_SLIP_NOTIFY=false`.
 *
 * Never throws — failures are logged only (user flow already succeeded).
 *
 * @param {object} opts
 * @param {*} opts.client — LINE Messaging API client (`pushMessage`)
 * @param {string} opts.lineUserId — payer LINE userId
 * @param {string|number} opts.paymentId
 * @param {string|null|undefined} opts.paymentRef
 * @param {string|null|undefined} opts.packageKey
 * @param {string|null|undefined} opts.slipUrl — public slip image URL (optional)
 * @param {Partial<typeof env>} [opts.env] — test override
 */
export async function maybeNotifyAdminSlipPendingVerify({
  client,
  lineUserId,
  paymentId,
  paymentRef,
  packageKey,
  slipUrl,
  env: envOverride,
} = {}) {
  const e = envOverride ? { ...env, ...envOverride } : env;
  const adminId = String(e.ADMIN_LINE_USER_ID || "").trim();
  if (!adminId || !e.ADMIN_PAYMENT_SLIP_NOTIFY) return;

  const uid = String(lineUserId || "").trim();
  const pid = paymentId != null ? String(paymentId).trim() : "";
  if (!pid) return;

  const ref = paymentRef != null ? String(paymentRef).trim() : "";
  const pkg = packageKey != null ? String(packageKey).trim() : "";
  const slip = slipUrl != null ? String(slipUrl).trim() : "";

  const base = String(e.APP_BASE_URL || "").replace(/\/$/, "");
  const detailLink =
    base && /^https?:\/\//i.test(base)
      ? `${base}/admin/payments/${encodeURIComponent(pid)}`
      : "";

  /** @type {(string | null)[]} */
  const lines = [
    "[ชำระเงิน] มีสลิปรอตรวจ (pending_verify)",
    ref ? `อ้างอิง: ${ref}` : null,
    `paymentId: ${pid}`,
    pkg ? `แพ็กเกจ: ${pkg}` : null,
    uid ? `ผู้ใช้ LINE: ${uid.slice(0, 12)}…` : null,
    slip ? `รูปสลิป: ${slip.slice(0, 900)}` : null,
    detailLink ? `เปิดตรวจ: ${detailLink}` : null,
  ];
  const text = lines.filter((x) => x != null && x !== "").join("\n").slice(0, 4900);

  try {
    await invokeLinePushMessage(
      client,
      "adminPaymentSlipNotify.push",
      adminId,
      { type: "text", text },
    );
    console.log(
      JSON.stringify({
        event: "ADMIN_SLIP_PENDING_VERIFY_PUSH_OK",
        paymentId: pid,
        adminIdPrefix: adminId.slice(0, 8),
      }),
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "ADMIN_SLIP_PENDING_VERIFY_PUSH_FAIL",
        paymentId: pid,
        message: err && typeof err === "object" && "message" in err ? String(err.message) : String(err),
      }),
    );
  }
}
