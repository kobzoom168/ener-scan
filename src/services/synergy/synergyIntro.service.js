/**
 * แนะนำรายงานจัดชุดพลังตอนลูกค้ามีครบ 3 ชิ้นครั้งแรก (trigger ตามสเปก — ครั้งเดียวต่อคน)
 * fire-and-forget จาก deliverOutbound หลังส่ง report สำเร็จ
 */
import { tryDedupeOnce, clearDedupeKey } from "../../redis/scanV2Redis.js";
import { env } from "../../config/env.js";

export async function maybeIntroduceSynergy(lineUserId) {
  const uid = String(lineUserId || "").trim();
  if (!uid) return { skipped: "no_uid" };
  try {
    const { loadVault, getOrCreateSynergyToken } = await import("./synergyReport.service.js");
    const vault = await loadVault(uid);
    if (vault.length < 3) return { skipped: "below_3" };
    const vaultCount = Number(vault.totalUniqueCount) || vault.length;
    const first = await tryDedupeOnce(`synergy:intro:${uid}`, 365 * 86400);
    if (!first) return { skipped: "already_introduced" };
    const token = await getOrCreateSynergyToken(uid);
    if (!token) return { skipped: "no_token" };
    const base = String(env.APP_BASE_URL || "").replace(/\/+$/, "");
    const lineToken = String(process.env.CHANNEL_ACCESS_TOKEN || "").trim();
    if (!lineToken) return { skipped: "no_line_token" };
    // Codex C6/P1-3: ข้อความอัตโนมัติที่มี URL/CTA = เสียงแอดมินล้วน ห้ามปนเสียง/
    // คำตีความของอาจารย์ในข้อความเดียว · เนื้อหาวิชาอยู่ในหน้ารายงาน synergy เอง
    const text = [
      `คลังของคุณมี ${vaultCount} ชิ้นแล้ว เปิดดูชุดประจำวันได้ที่นี่`,
      `${base}/synergy/${token}`,
      "",
      "พิมพ์ จัดชุด ในแชทนี้เมื่อไหร่ก็ได้",
    ].join("\n");
    // Flex carousel (กบ 1 ส.ค.) — พังค่อยถอยไป text
    let messages;
    try {
      const { buildSynergyCarouselFlex } = await import("./synergyReport.service.js");
      const flex = await buildSynergyCarouselFlex(uid);
      messages = flex
        ? [{ type: "text", text: `คลังของคุณมี ${vaultCount} ชิ้นแล้ว เลื่อนดูชุดประจำวัน (พิมพ์ จัดชุด)` }, flex]
        : [{ type: "text", text }];
    } catch {
      messages = [{ type: "text", text }];
    }
    {
      const { pushRawToCustomer } = await import("../lineOutbound/customerPush.gateway.js");
      const sent = await pushRawToCustomer(uid, messages, { source: "synergy_intro" });
      if (sent.sent !== true) {
        // P1 (Codex): dedupe อายุ 365 วันถูก claim ไปก่อนส่ง — ส่งไม่สำเร็จต้องคืนสิทธิ์
        // ไม่งั้นลูกค้าจะไม่มีวันได้ intro อีกเลยทั้งปี
        await clearDedupeKey(`synergy:intro:${uid}`).catch(() => {});
        console.log(JSON.stringify({ event: "SYNERGY_INTRO_BLOCKED", reason: sent.reason || "unknown", dedupeCleared: true }));
        return { sent: false, suppressedBanned: sent.suppressedBanned === true, reason: sent.reason };
      }
    }
    const { insertLineConversationMessage } = await import(
      "../../stores/conversationMessages.db.js"
    );
    void insertLineConversationMessage(uid, "bot", text, {
      speakerRole: "admin", replyType: "synergy_intro", source: "flow",
    });
    console.log(JSON.stringify({ event: "SYNERGY_INTRO_SENT", lineUserIdPrefix: uid.slice(0, 10), pieces: vaultCount }));
    // prewarm: คำนวณ+cache หน้าไว้ล่วงหน้า คนกดลิงก์แล้วเปิดไว
    import("./synergyReport.service.js").then((m) => void m.renderSynergyPage(uid)).catch(() => {});
    return { sent: true };
  } catch (e) {
    console.log(JSON.stringify({ event: "SYNERGY_INTRO_ERROR", message: String(e?.message || e).slice(0, 160) }));
    return { error: true };
  }
}
