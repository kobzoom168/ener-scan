/**
 * เกตเก็บข้อมูลชิ้นจากเจ้าของ (กบเคาะ 7 ส.ค. 2026 — docs/ai/plans/ener-object-info-gate.md)
 *
 * ตำแหน่งเกต: หลังสแกนเสร็จ ก่อนส่งรายงาน — รายงานคือแรงจูงใจให้ตอบ
 *  1. deliverOutbound เจอ scan_result ของชิ้นที่ยังไม่มีข้อมูล → ส่งคำถามแทน + พัก payload ใน redis
 *  2. ลูกค้าตอบในแชท → LLM แยกช่อง → บันทึก object_owner_info → re-enqueue รายงานส่งทันที
 *  3. ตอบ "ไม่ทราบ" = ผ่าน (ข้อมูลเหมือนกัน) · ลูกค้าเคยจ่าย = มีปุ่ม "ข้ามก่อน รับผลเลย"
 *  4. พิมพ์เรื่องอื่นระหว่างค้าง → เตือนซ้ำนุ่ม ๆ (วนตามกบสั่ง) · เกิน 24 ชม. fail-open ส่งรายงานให้
 *
 * เส้นแดง: คะแนนไม่ผูกรุ่น · ระบบไม่ฟันธง/ไม่เถียงเจ้าของ (ขัดกับภาพ = เก็บ+ธง) · ป้าย "เจ้าของแจ้ง"
 * เปิดด้วย OBJECT_INFO_GATE_ENABLED (staging ก่อน — pro รอกบสั่ง)
 */
import crypto from "node:crypto";
import { supabase } from "../../config/supabase.js";
import { getValue, setLargeValueWithTtl, clearDedupeKey } from "../../redis/scanV2Redis.js";

const PENDING_TTL_SEC = 24 * 3600;
const PURPOSE_TTL_SEC = 3600;
const PURPOSE_CHOICES = ["งาน", "การเงิน", "ความรัก", "คุ้มครอง", "เสี่ยงโชค", "สะสมบูชา"];

export function objectInfoGateEnabled() {
  return String(process.env.OBJECT_INFO_GATE_ENABLED ?? "false").trim().toLowerCase() === "true";
}

/** ลายชิ้นจาก report payload — วัตถุเดิมคะแนนเดิมเสมอ → ชิ้นเดิมได้คีย์เดิม ไม่ถามซ้ำ */
export function objectKeyFromReportPayload(reportPayload) {
  const p = reportPayload || {};
  const score = String(p.summary?.energyScore ?? "");
  const am = p.amuletV1?.powerCategories || null;
  const br = p.crystalBraceletV1?.axes || null;
  const axes = am
    ? Object.keys(am).sort().map((k) => `${k}:${am[k]?.score}`).join(",")
    : br
      ? Object.keys(br).sort().map((k) => `${k}:${br[k]?.score}`).join(",")
      : "";
  if (!score && !axes) return null;
  return crypto.createHash("md5").update(`${score}|${axes}`).digest("hex").slice(0, 16);
}

function laneFromReportPayload(reportPayload) {
  if (reportPayload?.amuletV1) return "amulet";
  if (reportPayload?.crystalBraceletV1) return "bracelet";
  return "other";
}

async function hasInfoForObject(lineUserId, objectKey) {
  try {
    const { data } = await supabase
      .from("object_owner_info")
      .select("id")
      .eq("line_user_id", lineUserId)
      .eq("object_key", objectKey)
      .limit(1);
    return Boolean(data?.length);
  } catch {
    return true; // DB พัง = อย่าขวางรายงาน
  }
}

const pendingKey = (uid) => `objinfo:pending:${uid}`;
const backupKey = (uid) => `objinfo:pending_backup:${uid}`;

/**
 * เรียกจาก deliverOutbound ก่อนส่ง scan_result — คืน true = เกตยึดไว้แล้ว (ส่งคำถามแทน อย่าส่งรายงาน)
 * @param {object} p { client, lineUserId, payload (outbound payload_json ทั้งก้อน) }
 */
export async function maybeHoldReportForObjectInfo({ client, lineUserId, payload }) {
  if (!objectInfoGateEnabled()) return false;
  try {
    const rp = payload?.reportPayload;
    if (!rp || payload?.error) return false;
    const objectKey = objectKeyFromReportPayload(rp);
    if (!objectKey) return false;
    if (await hasInfoForObject(lineUserId, objectKey)) return false;

    const lane = laneFromReportPayload(rp);
    const paidUntil = await supabase
      .from("app_users")
      .select("paid_until")
      .eq("line_user_id", lineUserId)
      .maybeSingle()
      .then((r) => r?.data?.paid_until || null)
      .catch(() => null);
    const isPaid = Boolean(paidUntil && Date.parse(paidUntil) > Date.now());

    const pending = {
      objectKey,
      lane,
      isPaid,
      objectForm: String(rp.object?.objectUnderstanding?.objectForm || ""),
      scanResultId: String(payload.scanResultId || rp.scanId || ""),
      outboundPayload: payload,
      heldAt: Date.now(),
    };
    await setLargeValueWithTtl(pendingKey(lineUserId), JSON.stringify(pending), PENDING_TTL_SEC);
    // สำรองกันรายงานหาย: pending หมดอายุโดยไม่มีคำตอบ → ข้อความถัดไปของลูกค้าจะปล่อยรายงานออก
    await setLargeValueWithTtl(backupKey(lineUserId), JSON.stringify(pending), PENDING_TTL_SEC * 2);

    const askText =
      lane === "bracelet"
        ? "อาจารย์อ่านพลังเสร็จแล้วครับ ก่อนส่งผล ขอข้อมูลชิ้นนี้นิดเดียว — เป็นหิน/กำไลชนิดไหนครับ (เช่น โรสควอตซ์ ไทเกอร์อาย หยก) พิมพ์บอกได้เลย เพื่อให้อาจารย์อ่านต่อยอดได้ละเอียดขึ้น และเก็บเข้าทะเบียนคลังของคุณ"
        : "อาจารย์อ่านพลังเสร็จแล้วครับ ก่อนส่งผล ขอข้อมูลองค์นี้นิดเดียว — เป็นพระอะไร วัดไหน รุ่น/ปีอะไรครับ พิมพ์บอกได้เลย (รู้เท่าไหนบอกเท่านั้นได้) เพื่อให้อาจารย์อ่านต่อยอดได้ละเอียดขึ้น และเก็บเข้าทะเบียนคลังของคุณ";
    const items = [
      { type: "action", action: { type: "message", label: "ไม่ทราบข้อมูลชิ้นนี้", text: "ไม่ทราบข้อมูลชิ้นนี้" } },
    ];
    if (isPaid) {
      items.push({ type: "action", action: { type: "message", label: "ข้ามก่อน รับผลเลย", text: "ข้ามก่อน รับผลเลย" } });
    }
    await client.pushMessage(lineUserId, {
      type: "text",
      text: askText,
      quickReply: { items },
    });
    try {
      const { insertLineConversationMessage } = await import("../../stores/conversationMessages.db.js");
      void insertLineConversationMessage(lineUserId, "bot", askText);
    } catch { /* ignore */ }
    console.log(JSON.stringify({ event: "OBJECT_INFO_GATE_ASKED", lineUserIdPrefix: lineUserId.slice(0, 8), lane, isPaid }));
    return true;
  } catch (e) {
    console.log(JSON.stringify({ event: "OBJECT_INFO_GATE_ERROR", step: "hold", msg: String(e?.message || e).slice(0, 140) }));
    return false; // เกตพัง = ส่งรายงานปกติ ห้ามขวางลูกค้า
  }
}

/** LLM แยกช่องจากข้อความลูกค้า — คืน null เมื่อไม่ใช่ข้อมูลชิ้น (ให้วนเตือน) */
async function parseOwnerInfo(rawText, lane) {
  const { getGeminiFlashModel, generateTextWithTimeout } = await import(
    "../../integrations/gemini/geminiFlash.api.js"
  );
  const sys =
    `แยกข้อมูลวัตถุมงคลจากข้อความเจ้าของ ตอบ JSON เดียวเท่านั้น: ` +
    `{"isObjectInfo":boolean,"objectName":string|null,"temple":string|null,"eraYear":string|null,"stoneType":string|null,"confidence":number}\n` +
    `- isObjectInfo=true เมื่อข้อความบอกชนิด/ชื่อ/วัด/รุ่น/ปี ของพระหรือหิน (แม้บอกแค่บางส่วน)\n` +
    `- isObjectInfo=false เมื่อเป็นทักทาย/คำถาม/เรื่องอื่น\n` +
    `- objectName=ชื่อพิมพ์หรือชนิด เช่น "พระขุนแผน" "เหรียญหลวงพ่อคูณ" · stoneType เฉพาะหิน/กำไล\n` +
    `- confidence 0-1 · ห้ามเดาข้อมูลที่ไม่ได้พูดถึง ให้ null`;
  try {
    const model = getGeminiFlashModel();
    const out = await generateTextWithTimeout(model, `${sys}\n\nเลน: ${lane}\nข้อความ: ${rawText}`, 8000);
    const m = String(out || "").match(/\{[\s\S]*\}/);
    if (!m) return null;
    const j = JSON.parse(m[0].replace(/,\s*([}\]])/g, "$1"));
    if (typeof j.isObjectInfo !== "boolean") return null;
    return j;
  } catch {
    return null;
  }
}

async function reEnqueueHeldReport(lineUserId, pending) {
  const { insertOutboundMessage } = await import("../../stores/scanV2/outboundMessages.db.js");
  await insertOutboundMessage({
    line_user_id: lineUserId,
    kind: "scan_result",
    priority: 50,
    payload_json: pending.outboundPayload,
    status: "queued",
  });
}

/**
 * เรียกจาก handleTextMessage (ต้นทาง) — คืน true = ข้อความนี้คือคำตอบเกต จบแล้ว อย่า route ต่อ
 */
export async function maybeHandleObjectInfoAnswer({ client, event, userId, text }) {
  if (!objectInfoGateEnabled()) return false;
  let pending;
  try {
    const raw = await getValue(pendingKey(userId));
    if (!raw) {
      // pending หมดอายุแต่มีสำรอง = เงียบเกิน 24 ชม. → fail-open ปล่อยรายงานที่ค้าง
      const bak = await getValue(backupKey(userId));
      if (bak) {
        try {
          const pb = JSON.parse(bak);
          await clearDedupeKey(backupKey(userId));
          await reEnqueueHeldReport(userId, pb);
          console.log(JSON.stringify({ event: "OBJECT_INFO_GATE_FAILOPEN", lineUserIdPrefix: userId.slice(0, 8) }));
        } catch { /* ignore */ }
      }
      return false;
    }
    pending = JSON.parse(raw);
  } catch {
    return false;
  }

  const t = String(text || "").trim();
  try {
    if (t === "ข้ามก่อน รับผลเลย" && pending.isPaid) {
      await supabase.from("object_owner_info").insert({
        line_user_id: userId, scan_result_id: pending.scanResultId || null,
        object_key: pending.objectKey, lane: pending.lane, skipped: true, unknown: true,
      });
      await clearDedupeKey(pendingKey(userId));
      await clearDedupeKey(backupKey(userId));
      await reEnqueueHeldReport(userId, pending);
      await client.replyMessage(event.replyToken, { type: "text", text: "ได้เลยครับ ส่งผลให้ทันที (ว่าง ๆ ค่อยบอกข้อมูลองค์นี้เพิ่มก็ได้นะครับ)" });
      return true;
    }
    if (/^ไม่ทราบ/.test(t)) {
      await supabase.from("object_owner_info").insert({
        line_user_id: userId, scan_result_id: pending.scanResultId || null,
        object_key: pending.objectKey, lane: pending.lane, unknown: true, raw_text: t,
      });
      await clearDedupeKey(pendingKey(userId));
      await clearDedupeKey(backupKey(userId));
      await reEnqueueHeldReport(userId, pending);
      await client.replyMessage(event.replyToken, { type: "text", text: "ไม่เป็นไรครับ อาจารย์ส่งผลให้เลย" });
      return true;
    }

    const parsed = await parseOwnerInfo(t, pending.lane);
    if (!parsed || parsed.isObjectInfo !== true) {
      // ไม่ใช่ข้อมูลชิ้น → วนเตือนนุ่ม ๆ (กติกากบ: วนจนกว่าจะได้)
      await client.replyMessage(event.replyToken, {
        type: "text",
        text: "อาจารย์รอส่งผลอยู่ครับ ขอข้อมูลชิ้นนี้ก่อนนิดเดียว — เป็นพระอะไร วัดไหน รุ่น/ปีอะไร (หรือชนิดหิน) พิมพ์บอกได้เลย ไม่แน่ใจกดปุ่มไม่ทราบได้ครับ",
        quickReply: { items: [{ type: "action", action: { type: "message", label: "ไม่ทราบข้อมูลชิ้นนี้", text: "ไม่ทราบข้อมูลชิ้นนี้" } }] },
      });
      return true;
    }

    // ขัดกับที่ตัวจำแนกเห็นไหม (เก็บ+ธง ไม่เถียงลูกค้า)
    const form = String(pending.objectForm || "");
    const saysStone = Boolean(parsed.stoneType) && !parsed.objectName;
    const conflict =
      (pending.lane === "amulet" && saysStone) ||
      (pending.lane === "bracelet" && /^พระ|^เหรียญ|^ตะกรุด/.test(String(parsed.objectName || "")));

    await supabase.from("object_owner_info").insert({
      line_user_id: userId,
      scan_result_id: pending.scanResultId || null,
      object_key: pending.objectKey,
      lane: pending.lane,
      raw_text: t.slice(0, 2000),
      object_name: parsed.objectName || null,
      temple: parsed.temple || null,
      era_year: parsed.eraYear || null,
      stone_type: parsed.stoneType || null,
      parse_confidence: Number(parsed.confidence) || null,
      conflict_flag: conflict,
    });
    await clearDedupeKey(pendingKey(userId));
      await clearDedupeKey(backupKey(userId));
    await reEnqueueHeldReport(userId, pending);

    // คำถามต่อยอดไม่บล็อก: พกเพื่ออะไร (ตอบก็ได้ไม่ตอบก็ได้ — รายงานส่งแล้ว)
    await setLargeValueWithTtl(`objinfo:purpose:${userId}`, JSON.stringify({ objectKey: pending.objectKey }), PURPOSE_TTL_SEC);
    await client.replyMessage(event.replyToken, {
      type: "text",
      text: "บันทึกเข้าทะเบียนคลังของคุณแล้วครับ อาจารย์ส่งผลให้เลย — ชิ้นนี้ตั้งใจพกเพื่ออะไรเป็นหลักครับ (ตอบหรือไม่ตอบก็ได้)",
      quickReply: {
        items: PURPOSE_CHOICES.map((c) => ({ type: "action", action: { type: "message", label: c, text: `พกเพื่อ${c}` } })),
      },
    });
    console.log(JSON.stringify({ event: "OBJECT_INFO_SAVED", lineUserIdPrefix: userId.slice(0, 8), conflict, hasName: Boolean(parsed.objectName) }));
    return true;
  } catch (e) {
    console.log(JSON.stringify({ event: "OBJECT_INFO_GATE_ERROR", step: "answer", msg: String(e?.message || e).slice(0, 140) }));
    // พังกลางทาง: ปล่อยรายงานออก อย่าให้ลูกค้าค้าง
    try {
      await clearDedupeKey(pendingKey(userId));
      await clearDedupeKey(backupKey(userId));
      await reEnqueueHeldReport(userId, pending);
    } catch { /* ignore */ }
    return true;
  }
}

/** ปุ่ม "พกเพื่อX" หลังส่งผล — อัปเดตแถวล่าสุดของชิ้น */
export async function maybeHandlePurposeAnswer({ client, event, userId, text }) {
  const m = String(text || "").trim().match(/^พกเพื่อ(.+)$/);
  if (!m || !PURPOSE_CHOICES.includes(m[1])) return false;
  try {
    const raw = await getValue(`objinfo:purpose:${userId}`);
    if (!raw) return false;
    const { objectKey } = JSON.parse(raw);
    const { data } = await supabase
      .from("object_owner_info")
      .select("id")
      .eq("line_user_id", userId)
      .eq("object_key", objectKey)
      .order("created_at", { ascending: false })
      .limit(1);
    if (data?.[0]?.id) {
      await supabase.from("object_owner_info").update({ purpose: m[1] }).eq("id", data[0].id);
    }
    await clearDedupeKey(`objinfo:purpose:${userId}`);
    await client.replyMessage(event.replyToken, { type: "text", text: "รับทราบครับ อาจารย์จะจำไว้เวลาแนะนำการพกชิ้นนี้" });
    return true;
  } catch {
    return false;
  }
}
