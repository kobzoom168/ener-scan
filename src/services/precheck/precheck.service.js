/**
 * Pre-Check "เช็คก่อนเช่า" (กบเคาะ 8 ส.ค. 2026 — แผน ener-object-data-monetize.md รอบ 3)
 * ฝั่ง "คนซื้อ" เท่านั้น: กำลังจะเช่าจากร้าน → พิมพ์ "เช็คก่อนเช่า" → ส่งรูป → รายงานปกติ
 * + การ์ดสถิติ "ของประเภทเดียวกันในระบบอยู่ช่วงคะแนนไหน" + คำเตือนข้อมูลประกอบ
 *
 * กติกา: ชิ้นที่เช็ค**ไม่ใช่ของลูกค้า** — ธง precheckMode บนแถวสแกน → ไม่เข้าคลัง/ชุดพก/
 * ทะเบียน/คลิป FB/YT · ข้ามเกตถามข้อมูล (ยังไม่ใช่เจ้าของ) · ใช้สิทธิ์สแกนตามปกติ
 * ภาษา: ห้ามคำที่ชี้แท้เก๊/ตัดสินว่าดี-แย่ — "ช่วงคะแนนที่พบได้บ่อย" เท่านั้น (เบรก percentile รอบ 2)
 */
import { supabase } from "../../config/supabase.js";
import { getValue, setValueWithTtl } from "../../redis/scanV2Redis.js";

const MODE_TTL_SEC = 30 * 60;
const modeKey = (uid) => `precheck:mode:${uid}`;
const TRIGGER_RE = /^(เช็ค?ก่อนเช่า|เช็กก่อนเช่า|เช็ค?ก่อนซื้อ|กำลังจะเช่า|จะเช่าดีไหม)/;

export async function isPrecheckActive(lineUserId) {
  try {
    return Boolean(await getValue(modeKey(lineUserId)));
  } catch {
    return false;
  }
}

/** คำสั่งเปิดโหมดในแชท — คืน true = จัดการแล้ว */
export async function maybeHandlePrecheckTrigger({ client, event, userId, text }) {
  if (!TRIGGER_RE.test(String(text || "").trim())) return false;
  try {
    await setValueWithTtl(modeKey(userId), "1", MODE_TTL_SEC);
    await __replyCustomer(client, event.replyToken, {
      type: "text",
      text:
        "เปิดโหมดเช็คก่อนเช่าแล้ว ถ่ายรูปองค์ที่จะเช่าส่งมา" +
        "อาจารย์จะอ่านพลัง เทียบกับของประเภทเดียวกันในระบบ และดูความเข้ากับดวงคุณให้ " +
        "องค์ที่เช็คจะไม่ถูกเก็บเข้าคลังของคุณ (ยังไม่ใช่ของเรา) " +
        "ใช้สิทธิ์สแกนตามปกติ",
    });
    console.log(JSON.stringify({ event: "PRECHECK_MODE_ON", lineUserIdPrefix: userId.slice(0, 8) }));
    return true;
  } catch {
    return true;
  }
}

function rangeLine(score, stats) {
  const sc = Number(score);
  const p25 = Number(stats?.p25);
  const p75 = Number(stats?.p75);
  if (!Number.isFinite(sc) || !Number.isFinite(p25) || !Number.isFinite(p75)) return "";
  if (sc > p75) return "องค์นี้อ่านค่าได้สูงกว่าช่วงที่พบบ่อย";
  if (sc < p25) return "องค์นี้อ่านค่าได้ต่างจากช่วงที่พบบ่อย ลองดูข้อมูลด้านอื่นประกอบด้วย";
  return "องค์นี้อยู่ในช่วงแนนที่พบได้บ่อยของของประเภทนี้";
}

/**
 * เรียกหลังส่งรายงานสำเร็จ (deliverOutbound) เมื่อโหมดเปิดอยู่ —
 * ติดธง precheck บนแถวสแกน + ส่งการ์ดสถิติตาม (fire-and-forget)
 */
export async function handlePrecheckAfterReport({ client, lineUserId, payload }) {
  try {
    const token = String(payload?.publicToken || "").trim();
    if (!token) return;
    // ธง: ไม่ให้ปนคลัง/ชุด/โพสต์ (ผู้อ่านฝั่งคลังกรอง precheckMode)
    await supabase.rpc("ener_mark_precheck", { p_token: token }).catch(() => {});

    let rp = payload?.reportPayload || null;
    if (!rp) {
      const { data } = await supabase
        .from("scan_results_v2")
        .select("report_payload_json")
        .eq("html_public_token", token)
        .maybeSingle();
      rp = data?.report_payload_json || null;
    }
    const score = rp?.summary?.energyScore;
    const compat = Number(rp?.summary?.compatibilityPercent);
    const ou = rp?.object?.objectUnderstanding || {};
    const form = String(ou.objectForm || "").trim();
    const formTh = String(ou.formDisplayTh || "").trim() || "ของประเภทเดียวกัน";

    let statsLine = "";
    let judged = "";
    if (form && form !== "unknown") {
      const { data: st } = await supabase.rpc("ener_form_stats", { p_form: form });
      const j = typeof st === "string" ? JSON.parse(st) : st;
      if (j && Number(j.count) >= 20) {
        statsLine = `${formTh}ในระบบ ${Number(j.count).toLocaleString()} รายการ ส่วนใหญ่อ่านได้ช่วง ${j.p25}-${j.p75} (เฉลี่ย ${j.avg})`;
        judged = rangeLine(score, j);
      }
    }

    const lines = [
      { type: "text", text: `องค์ที่เช็ค: พลังรวม ${score}/10`, weight: "bold", size: "lg", color: "#E8C547" },
      ...(Number.isFinite(compat)
        ? [{ type: "text", text: `เข้ากับดวงคุณ ${Math.round(compat)}%`, size: "md", color: "#F5EDD8" }]
        : []),
      ...(statsLine ? [{ type: "text", text: statsLine, size: "sm", color: "#F5EDD8", wrap: true }] : []),
      ...(judged ? [{ type: "text", text: judged, size: "sm", color: "#CBB98A", wrap: true }] : []),
      {
        type: "text",
        text: "ข้อมูลพลังงานประกอบการตัดสินใจเท่านั้น ไม่เกี่ยวกับความแท้ อายุ หรือมูลค่าของวัตถุ",
        size: "xs", color: "#9a8b66", wrap: true,
      },
    ];
    const flex = {
      type: "flex",
      altText: "ผลเช็คก่อนเช่า",
      contents: {
        type: "bubble", size: "kilo",
        body: {
          type: "box", layout: "vertical", backgroundColor: "#14110C", paddingAll: "16px", spacing: "md",
          contents: [
            { type: "text", text: "ผลเช็คก่อนเช่า", weight: "bold", size: "md", color: "#E8C547" },
            { type: "separator", color: "#3A3122" },
            ...lines,
          ],
        },
        footer: {
          type: "box", layout: "vertical", backgroundColor: "#14110C", paddingAll: "12px", spacing: "sm",
          contents: [
            {
              type: "button", style: "primary", color: "#B8871B", height: "sm",
              action: { type: "message", label: "เช็คองค์ต่อไป", text: "เช็คก่อนเช่า" },
            },
          ],
        },
      },
    };
    {
      const { pushToCustomer } = await import("../lineOutbound/customerPush.gateway.js");
      const pushed = await pushToCustomer(client, lineUserId, flex, { source: "precheck_delayed" });
      if (pushed.suppressedBanned) return { sent: false, suppressedBanned: true };
      if (pushed.sent !== true) {
        console.error(JSON.stringify({ event: "PRECHECK_DELAYED_BLOCKED", reason: pushed.reason || "unknown" }));
        return { sent: false, reason: pushed.reason };
      }
    }
    try {
      const { insertLineConversationMessage } = await import("../../stores/conversationMessages.db.js");
      void insertLineConversationMessage(
        lineUserId,
        "bot",
        `[เช็คก่อนเช่า] พลังรวม ${score}/10${statsLine ? ` · ${statsLine}` : ""}${judged ? ` · ${judged}` : ""}`,
        { speakerRole: "ajarn", replyType: "precheck_result", source: "worker" },
      );
    } catch { /* ignore */ }
    console.log(JSON.stringify({ event: "PRECHECK_RESULT_SENT", lineUserIdPrefix: lineUserId.slice(0, 8), form, score }));
  } catch (e) {
    console.log(JSON.stringify({ event: "PRECHECK_RESULT_ERROR", msg: String(e?.message || e).slice(0, 140) }));
  }
}

/** customer reply boundary (Codex P0-1): ทุก reply ของไฟล์นี้ผ่าน hard-tone guard */
async function __replyCustomer(client, replyToken, messages) {
  const { replyToCustomer } = await import("../lineOutbound/customerPush.gateway.js");
  const r = await replyToCustomer(client, replyToken, messages, { source: "precheck", replyType: "precheck", toneKind: "step" });
  if (r.sent !== true) {
    console.error(JSON.stringify({ event: "CUSTOMER_REPLY_TONE_BLOCKED", surface: "precheck", violations: r.toneViolations || [] }));
  }
  return r;
}
