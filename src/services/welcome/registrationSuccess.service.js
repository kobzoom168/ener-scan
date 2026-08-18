/**
 * Registration success flow (กบเคาะ 14 ส.ค. + Codex ข้อ 1/4):
 * trigger จากสถานะ "ไม่ครบ → ครบ" เท่านั้น + dedupe push กันยิงซ้ำตอนแก้ข้อมูล
 * - ไม่มีรูปค้าง: success + How-to + ชวนส่งรูป
 * - มีรูปค้าง: success + การ์ด thumbnail รูปเดิม + ปุ่ม "เริ่มอ่านรูปนี้:{token}"
 *   (ห้ามส่ง How-to ที่ชวนส่งรูป — จะขัดกับรูปที่ค้างอยู่)
 */
import { tryDedupeOnce } from "../../redis/scanV2Redis.js";
import { peekHold } from "./preRegistrationHold.service.js";
import { decideLiffSuccessFlow } from "./registrationOnboarding.logic.js";

const log = (event, extra = {}) => console.log(JSON.stringify({ event, ...extra }));

/** การ์ด resume: thumbnail รูปที่ค้าง + ปุ่ม token ลับใช้ครั้งเดียว */
export async function buildResumeFlexCard(hold) {
  let thumbUrl = "";
  try {
    const { createScanUploadBucketSignedUrl } = await import(
      "../../utils/storage/scanUploadStorageSignedUrl.util.js"
    );
    thumbUrl = await createScanUploadBucketSignedUrl(hold.storagePath);
  } catch { /* ไม่มีรูปหัวการ์ดก็ยังใช้ได้ */ }
  const bodyLines = [
    "รับรูปที่ส่งไว้ก่อนหน้าแล้วครับ ยังไม่ต้องส่งซ้ำ",
    hold.description ? `ข้อมูลที่แจ้งไว้: ${hold.description}` : null,
    "แตะปุ่มด้านล่าง ผมส่งรูปนี้ให้อาจารย์อ่านทันทีครับ",
  ].filter(Boolean);
  return {
    type: "flex",
    altText: "รับรูปที่ส่งไว้แล้ว แตะเริ่มอ่านได้เลยครับ",
    contents: {
      type: "bubble",
      size: "kilo",
      ...(thumbUrl
        ? {
            hero: {
              type: "image",
              url: thumbUrl,
              size: "full",
              aspectRatio: "4:3",
              aspectMode: "cover",
            },
          }
        : {}),
      body: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#161209",
        paddingAll: "16px",
        contents: [
          ...bodyLines.map((t, i) => ({
            type: "text",
            text: t,
            wrap: true,
            size: i === 0 ? "sm" : "xs",
            color: i === 0 ? "#F5EDD8" : "#CBB98A",
            margin: i === 0 ? "none" : "sm",
          })),
          {
            type: "button",
            style: "primary",
            color: "#C9A95F",
            margin: "lg",
            action: {
              type: "message",
              label: "เริ่มอ่านรูปนี้",
              text: `เริ่มอ่านรูปนี้:${hold.resumeToken}`,
            },
          },
        ],
      },
    },
  };
}

/**
 * ส่ง success flow (push) — เรียกได้จากทั้ง LIFF save และ chat fallback
 * @param {{ pushMessage: (uid: string, msgs: object[]) => Promise<unknown> }} client
 * @param {{ userId: string, nickname: string, completeBefore: boolean, completeAfter: boolean, source: string }} p
 * @returns {Promise<"none" | "success_resume" | "success_howto">}
 */
export async function sendRegistrationSuccessFlow(
  client,
  { userId, nickname, completeBefore, completeAfter, source },
  deps = {},
) {
  const dedupe = deps.tryDedupeOnce || tryDedupeOnce;
  const clearDedupe =
    deps.clearDedupeKey ||
    (async (k) => {
      const { clearDedupeKey } = await import("../../redis/scanV2Redis.js");
      return clearDedupeKey(k);
    });
  const peek = deps.peekHold || peekHold;

  const hold = await peek(userId).catch(() => null);
  const flow = decideLiffSuccessFlow({
    completeBefore,
    completeAfter,
    hasHeldImage: Boolean(hold?.storagePath && hold?.resumeToken),
  });
  if (flow === "none") return "none";
  // dedupe กันยิงซ้ำ (retry/หลาย instance) — แต่ push ล้มต้องล้าง dedupe ให้ retry ได้
  // (Codex รอบ 2 ข้อ 2: เดิม dedupe ก่อน push ล้ม = ลูกค้าไม่ได้ปุ่ม resume แล้วโดน suppress 24 ชม.)
  const dedupeKey = `prereg:success:${userId}`;
  const first = await dedupe(dedupeKey, 86400);
  if (!first) return "none";

  const name = String(nickname || "").trim();
  const successText = `ลงทะเบียนเรียบร้อยครับ${name ? ` คุณ${name}` : ""}`;
  const msgs = [{ type: "text", text: successText }];
  if (flow === "success_resume") {
    msgs.push(await buildResumeFlexCard(hold));
  } else {
    try {
      const { buildHowtoFlowFlex } = await import("./howtoFlow.service.js");
      msgs.push(buildHowtoFlowFlex());
    } catch { /* ไม่มีการ์ดก็เชิญด้วยข้อความ */ }
    msgs.push({
      type: "text",
      text: "ส่งรูปพระ เครื่องราง หิน หรือกำไล มาได้เลยครับ เดี๋ยวผมส่งให้อาจารย์อ่าน ฟรีวันละ 1 ชิ้นครับ",
    });
  }
  try {
    const { pushToCustomer } = await import("../lineOutbound/customerPush.gateway.js");
    const pushed = await pushToCustomer(client, userId, msgs, { source: "registration_success" });
    if (pushed.suppressedBanned) return { sent: false, suppressedBanned: true };
  } catch (e) {
    await clearDedupe(dedupeKey).catch(() => {});
    log("registration_success_push_failed", {
      uidPrefix: userId.slice(0, 8),
      source,
      message: String(e?.message || e).slice(0, 120),
    });
    return "push_failed";
  }
  log("registration_saved", { uidPrefix: userId.slice(0, 8), source, flow });
  return flow;
}
