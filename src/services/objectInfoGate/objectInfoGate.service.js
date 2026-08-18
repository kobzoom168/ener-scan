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
const askCooldownKey = (uid) => `objinfo:ask_cooldown:${uid}`;
// เว้นช่วงการถามต่อคน (เคส 10 ส.ค.: whale สแกนรัว โดนถามทุกชิ้นทุก 2-3 นาที รวม 30 รอบติด)
const ASK_COOLDOWN_SEC = () =>
  Math.max(60, Number(process.env.OBJECT_INFO_ASK_COOLDOWN_SEC ?? 1800) || 1800);

/** ปล่อยรายงานที่ค้างโดยไม่มีข้อมูล (ปฏิเสธ/เตือนครบ/ข้าม) — บันทึกแถว skipped กันถามชิ้นเดิมซ้ำ */
async function releaseHeldWithoutInfo(userId, pending, rawText) {
  try {
    await supabase.from("object_owner_info").insert({
      line_user_id: userId,
      scan_result_id: pending.scanResultId || null,
      object_key: pending.objectKey,
      lane: pending.lane,
      skipped: true,
      unknown: true,
      raw_text: String(rawText || "").slice(0, 400) || null,
    });
  } catch { /* บันทึกไม่ได้ก็ยังต้องปล่อยรายงาน */ }
  await clearDedupeKey(pendingKey(userId));
  await clearDedupeKey(backupKey(userId));
  await reEnqueueHeldReport(userId, pending);
}

/**
 * เรียกจาก deliverOutbound ก่อนส่ง scan_result — คืน true = เกตยึดไว้แล้ว (ส่งคำถามแทน อย่าส่งรายงาน)
 * @param {object} p { client, lineUserId, payload (outbound payload_json ทั้งก้อน) }
 */
export async function maybeHoldReportForObjectInfo({ client, lineUserId, payload }) {
  if (!objectInfoGateEnabled()) return false;
  try {
    if (payload?.error) return false;
    // โหมด summary_link ไม่แนบ reportPayload ใน outbound (เป็น JSON null) → โหลดจาก DB ด้วย token
    let rp = payload?.reportPayload || null;
    if (!rp && payload?.publicToken) {
      const { data: srow } = await supabase
        .from("scan_results_v2")
        .select("id,report_payload_json")
        .eq("html_public_token", String(payload.publicToken))
        .maybeSingle();
      rp = srow?.report_payload_json || null;
      if (srow?.id && !payload.scanResultId) payload.scanResultId = String(srow.id);
    }
    if (!rp) {
      console.log(JSON.stringify({ event: "OBJECT_INFO_GATE_SKIP", reason: "no_report_payload" }));
      return false;
    }
    if (rp.precheckMode) return false; // ชิ้นเช็คก่อนเช่า — ไม่ใช่ของลูกค้า ไม่ถาม
    const objectKey = objectKeyFromReportPayload(rp);
    if (!objectKey) return false;
    if (await hasInfoForObject(lineUserId, objectKey)) return false;

    // กันสแปม+รายงานหาย (เคส 10 ส.ค.): ยึดได้ทีละชิ้นต่อคน — มีคำถามค้างอยู่
    // หรือเพิ่งถามไปไม่นาน → ชิ้นนี้ส่งรายงานปกติ ไม่ยึดเพิ่ม (pending เดิมห้ามโดนทับ)
    if (await getValue(pendingKey(lineUserId))) {
      console.log(JSON.stringify({ event: "OBJECT_INFO_GATE_SKIP", reason: "pending_exists", lineUserIdPrefix: lineUserId.slice(0, 8) }));
      return false;
    }
    if (await getValue(askCooldownKey(lineUserId))) {
      console.log(JSON.stringify({ event: "OBJECT_INFO_GATE_SKIP", reason: "ask_cooldown", lineUserIdPrefix: lineUserId.slice(0, 8) }));
      return false;
    }

    const lane = laneFromReportPayload(rp);
    // ปุ่มข้าม = เฉพาะคนเคยจ่ายอย่างน้อย 1 ครั้ง (กบ: ไม่เคยจ่ายเลยต้องใส่ ห้ามข้าม)
    const { hasEverPaid } = await import("../everPaid.service.js");
    const isPaid = await hasEverPaid(lineUserId).catch(() => false);

    const pending = {
      objectKey,
      lane,
      isPaid,
      objectForm: String(rp.object?.objectUnderstanding?.objectForm || ""),
      scanResultId: String(payload.scanResultId || rp.scanId || ""),
      outboundPayload: payload,
      heldAt: Date.now(),
    };
    // token ฟอร์ม HTML (กรอกแยกฟิลด์) — อายุเท่าคีย์สำรอง
    const formToken = crypto.randomBytes(10).toString("hex");
    pending.formToken = formToken;
    await setLargeValueWithTtl(`objinfo:form:${formToken}`, lineUserId, PENDING_TTL_SEC * 2);
    await setLargeValueWithTtl(pendingKey(lineUserId), JSON.stringify(pending), PENDING_TTL_SEC);
    // สำรองกันรายงานหาย: pending หมดอายุโดยไม่มีคำตอบ → ข้อความถัดไปของลูกค้าจะปล่อยรายงานออก
    await setLargeValueWithTtl(backupKey(lineUserId), JSON.stringify(pending), PENDING_TTL_SEC * 2);

    const base = String(process.env.APP_BASE_URL || "").replace(/\/+$/, "");
    const formUrl = `${base}/obj-info/${formToken}`;
    const POSTER_URL = String(
      process.env.OBJECT_INFO_POSTER_URL ||
        "https://pub-66a3e24b05f44d809106818ceb606936.r2.dev/brand/objinfo-ask-v3.png",
    ).trim();
    const askText =
      lane === "bracelet"
        ? "อาจารย์อ่านพลังเสร็จแล้วครับ ก่อนส่งผล ขอข้อมูลชิ้นนี้นิดเดียว เพื่อให้อาจารย์อ่านพลังได้ตรงทางที่สุด เป็นหิน/กำไลชนิดไหนครับ พิมพ์ตอบในแชทนี้ได้เลย หรือกดกรอกแบบละเอียดด้านล่าง"
        : "อาจารย์อ่านพลังเสร็จแล้วครับ ก่อนส่งผล ขอข้อมูลองค์นี้นิดเดียว เพื่อให้อาจารย์อ่านพลังได้ตรงทางที่สุด เป็นพระอะไร วัดไหน รุ่น/ปีอะไร พิมพ์ตอบในแชทนี้ได้เลย รู้เท่าไหนบอกเท่านั้นได้";
    const items = [
      { type: "action", action: { type: "message", label: "ไม่ทราบข้อมูลชิ้นนี้", text: "ไม่ทราบข้อมูลชิ้นนี้" } },
    ];
    if (isPaid) {
      items.push({ type: "action", action: { type: "message", label: "ข้ามก่อน รับผลเลย", text: "ข้ามก่อน รับผลเลย" } });
    }
    const formButtonFooter = {
      type: "box", layout: "vertical", backgroundColor: lane === "amulet" ? "#0c241a" : "#14110C",
      paddingAll: "12px",
      contents: [{
        type: "button", style: "primary", color: "#B8871B", height: "sm",
        action: { type: "uri", label: "กรอกข้อมูลแบบละเอียด", uri: formUrl },
      }],
    };
    const flexAsk = {
      type: "flex",
      altText: "ขอข้อมูลชิ้นนี้ก่อนส่งผลครับ",
      contents:
        lane === "amulet"
          ? {
              type: "bubble", size: "mega",
              hero: { type: "image", url: POSTER_URL, size: "full", aspectRatio: "1080:1300", aspectMode: "fit" },
              footer: formButtonFooter,
            }
          : {
              type: "bubble", size: "kilo",
              body: {
                type: "box", layout: "vertical", backgroundColor: "#14110C", paddingAll: "16px", spacing: "md",
                contents: [
                  { type: "text", text: "ก่อนส่งผล ขอข้อมูลชิ้นนี้ครับ", weight: "bold", size: "md", color: "#E8C547", wrap: true },
                  { type: "text", text: askText, size: "sm", color: "#F5EDD8", wrap: true },
                  { type: "text", text: "ข้อมูลจะถูกเก็บเข้าทะเบียนคลังของคุณ (บันทึกแบบ \"เจ้าของแจ้ง\")", size: "xs", color: "#CBB98A", wrap: true },
                ],
              },
              footer: formButtonFooter,
            },
      quickReply: { items },
    };
    {
      const { pushToCustomer } = await import("../lineOutbound/customerPush.gateway.js");
      const pushed = await pushToCustomer(client, lineUserId, flexAsk, { source: "object_info_gate_ask" });
      if (pushed.suppressedBanned) return { asked: false, suppressedBanned: true };
    }
    await setLargeValueWithTtl(askCooldownKey(lineUserId), "1", ASK_COOLDOWN_SEC()).catch(() => {});
    try {
      const { insertLineConversationMessage } = await import("../../stores/conversationMessages.db.js");
      void insertLineConversationMessage(lineUserId, "bot", askText, { speakerRole: "admin", replyType: "object_info_gate_ask", source: "worker" });
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
    `{"isObjectInfo":boolean,"objectName":string|null,"temple":string|null,"eraYear":string|null,"stoneType":string|null,"normalizedName":string|null,"confidence":number}\n` +
    `- isObjectInfo=true เมื่อข้อความบอกชนิด/ชื่อ/วัด/รุ่น/ปี ของพระหรือหิน (แม้บอกแค่บางส่วน)\n` +
    `- isObjectInfo=false เมื่อเป็นทักทาย/คำถาม/เรื่องอื่น\n` +
    `- objectName=ชื่อพิมพ์หรือชนิด เช่น "พระขุนแผน" "เหรียญหลวงพ่อคูณ" · stoneType เฉพาะหิน/กำไล\n` +
    `- normalizedName=ชื่อมาตรฐานกลางสำหรับจัดกลุ่ม (ตัดคำฟุ่มเฟือย/สะกดมาตรฐาน เช่น "พระสมเด็จ วัดระฆัง") · confidence 0-1 · ห้ามเดาข้อมูลที่ไม่ได้พูดถึง ให้ null`;
  try {
    const model = getGeminiFlashModel({ callSite: "objectInfoParse" });
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
      await client.replyMessage(event.replyToken, { type: "text", text: "ได้ครับ รับผลพลังได้ทันทีครับ" });
      return true;
    }
    if (/^ไม่ทราบ/.test(t)) {
      const partial = pending.partial || {};
      await supabase.from("object_owner_info").insert({
        line_user_id: userId, scan_result_id: pending.scanResultId || null,
        object_key: pending.objectKey, lane: pending.lane,
        unknown: !partial.objectName && !partial.stoneType,
        raw_text: (pending.rawSoFar ? pending.rawSoFar + " | " : "") + t,
        object_name: partial.objectName || null,
        temple: partial.temple || null,
        era_year: partial.eraYear || null,
        stone_type: partial.stoneType || null,
        parse_confidence: partial.confidence || null,
      });
      await clearDedupeKey(pendingKey(userId));
      await clearDedupeKey(backupKey(userId));
      await reEnqueueHeldReport(userId, pending);
      await client.replyMessage(event.replyToken, { type: "text", text: "ไม่เป็นไรครับ อาจารย์ส่งผลให้เลย" });
      return true;
    }

    // ปฏิเสธ/ขอผ่าน (เคส 10 ส.ค. quality report: ลูกค้าตอบ "ไว้ก่อน" แต่โดนวนถามซ้ำ)
    // → ปล่อยรายงานเลย บันทึกแบบข้าม ไม่ดันต่อ
    if (/^(ไว้ก่อน|ยังก่อน|ไว้ค่อย|เดี๋ยวค่อย|ยังไม่|ไม่บอก|ไม่สะดวก|ไม่อยากบอก|ไม่ตอบ|ขอข้าม|ข้าม|ไม่เอา)/.test(t)) {
      await releaseHeldWithoutInfo(userId, pending, t);
      await client.replyMessage(event.replyToken, {
        type: "text",
        text: "ได้ครับ เดี๋ยวอาจารย์ส่งผลให้เลย ข้อมูลชิ้นนี้ไว้สะดวกค่อยบอกก็ได้ครับ",
      });
      console.log(JSON.stringify({ event: "OBJECT_INFO_GATE_RELEASED", reason: "declined", lineUserIdPrefix: userId.slice(0, 8) }));
      return true;
    }

    const parsed = await parseOwnerInfo(t, pending.lane);
    if (!parsed || parsed.isObjectInfo !== true) {
      // ไม่ใช่ข้อมูลชิ้น → เตือนนุ่ม ๆ ไม่เกิน 2 รอบ — ครบแล้วปล่อยรายงานเงียบ ๆ
      // แล้วคืน false ให้ข้อความนี้ไหลไปแชทปกติ (ลูกค้าจะได้คำตอบเรื่องที่ถามจริง)
      const reminded = Number(pending.remindCount || 0);
      if (reminded >= 2) {
        await releaseHeldWithoutInfo(userId, pending, t);
        console.log(JSON.stringify({ event: "OBJECT_INFO_GATE_RELEASED", reason: "remind_cap", lineUserIdPrefix: userId.slice(0, 8) }));
        return false;
      }
      pending.remindCount = reminded + 1;
      await setLargeValueWithTtl(pendingKey(userId), JSON.stringify(pending), PENDING_TTL_SEC);
      await setLargeValueWithTtl(backupKey(userId), JSON.stringify(pending), PENDING_TTL_SEC * 2);
      const remindItems = [
        { type: "action", action: { type: "message", label: "ไม่ทราบข้อมูลชิ้นนี้", text: "ไม่ทราบข้อมูลชิ้นนี้" } },
      ];
      if (pending.isPaid) {
        remindItems.push({ type: "action", action: { type: "message", label: "ข้ามก่อน รับผลเลย", text: "ข้ามก่อน รับผลเลย" } });
      }
      await client.replyMessage(event.replyToken, {
        type: "text",
        text: "อาจารย์รอส่งผลอยู่ครับ ขอข้อมูลชิ้นนี้ก่อนนิดเดียว เป็นพระอะไร วัดไหน รุ่น/ปีอะไร (หรือชนิดหิน) พิมพ์บอกได้เลย ไม่แน่ใจกดปุ่มไม่ทราบได้ครับ",
        quickReply: { items: remindItems },
      });
      return true;
    }

    // รวมกับข้อมูลรอบแรก (กรณีถามซ้ำช่องที่ขาด)
    const prev = pending.partial || {};
    const merged = {
      objectName: parsed.objectName || prev.objectName || null,
      temple: parsed.temple || prev.temple || null,
      eraYear: parsed.eraYear || prev.eraYear || null,
      stoneType: parsed.stoneType || prev.stoneType || null,
      confidence: Number(parsed.confidence) || prev.confidence || null,
    };
    const rawAll = (pending.rawSoFar ? pending.rawSoFar + " | " : "") + t.slice(0, 800);

    // ยังไม่ครบ + ยังไม่เคยถามซ้ำ → ถามเฉพาะช่องที่ขาดอีก 1 รอบเดียว (ครบขึ้นโดยไม่วนไม่รู้จบ)
    if (pending.stage !== 2 && pending.lane === "amulet" && merged.objectName && (!merged.temple || !merged.eraYear)) {
      const missing = [];
      if (!merged.temple) missing.push("วัดไหน");
      if (!merged.eraYear) missing.push("รุ่น/ปีอะไร");
      pending.stage = 2;
      pending.partial = merged;
      pending.rawSoFar = rawAll;
      await setLargeValueWithTtl(pendingKey(userId), JSON.stringify(pending), PENDING_TTL_SEC);
      await setLargeValueWithTtl(backupKey(userId), JSON.stringify(pending), PENDING_TTL_SEC * 2);
      await client.replyMessage(event.replyToken, {
        type: "text",
        text: `ขอบคุณครับ ${merged.objectName} แล้วพอทราบไหมครับว่า${missing.join(" ")} (ไม่ทราบกดปุ่มได้เลย เดี๋ยวอาจารย์ส่งผลให้ทันที)`,
        quickReply: { items: [{ type: "action", action: { type: "message", label: "ไม่ทราบครับ", text: "ไม่ทราบครับ" } }] },
      });
      return true;
    }

    // ขัดกับที่ตัวจำแนกเห็นไหม (เก็บ+ธง ไม่เถียงลูกค้า)
    const saysStone = Boolean(merged.stoneType) && !merged.objectName;
    const conflict =
      (pending.lane === "amulet" && saysStone) ||
      (pending.lane === "bracelet" && /^พระ|^เหรียญ|^ตะกรุด/.test(String(merged.objectName || "")));

    await supabase.from("object_owner_info").insert({
      line_user_id: userId,
      scan_result_id: pending.scanResultId || null,
      object_key: pending.objectKey,
      lane: pending.lane,
      raw_text: rawAll.slice(0, 2000),
      object_name: merged.objectName,
      temple: merged.temple,
      era_year: merged.eraYear,
      stone_type: merged.stoneType,
      parse_confidence: merged.confidence,
      normalized_tag: parsed.normalizedName || null,
      conflict_flag: conflict,
    });
    await clearDedupeKey(pendingKey(userId));
      await clearDedupeKey(backupKey(userId));
    await reEnqueueHeldReport(userId, pending);

    await client.replyMessage(event.replyToken, {
      type: "text",
      text: "บันทึกเข้าทะเบียนคลังของคุณแล้วครับ อาจารย์ส่งผลให้เลยครับ",
    });
    // คำถาม "พกเพื่ออะไร" ส่งหลังรายงานถึงมือ (~7 วิ) — ส่งพร้อมกันปุ่ม quickReply จะโดน
    // การ์ดรายงานดันหาย (กบ 7 ส.ค. "ยังไม่ทันเลือกคำตอบ")
    await setLargeValueWithTtl(`objinfo:purpose:${userId}`, JSON.stringify({ objectKey: pending.objectKey }), PURPOSE_TTL_SEC);
    setTimeout(() => {
      import("../lineOutbound/customerPush.gateway.js")
        .then((g) => g.pushToCustomer(client, userId, {
          type: "text",
          text: "ถามเพิ่มนิดเดียวครับ ชิ้นนี้ตั้งใจพกเพื่ออะไรเป็นหลัก (ตอบหรือไม่ตอบก็ได้)",
          quickReply: {
            items: PURPOSE_CHOICES.map((c) => ({ type: "action", action: { type: "message", label: c, text: `พกเพื่อ${c}` } })),
          },
        }, { source: "object_info_purpose_ask" }))
        .catch(() => {});
    }, 7000);
    console.log(JSON.stringify({ event: "OBJECT_INFO_SAVED", lineUserIdPrefix: userId.slice(0, 8), conflict, hasName: Boolean(merged.objectName) }));
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

/** ฟอร์ม HTML: หา pending จาก formToken — คืน { uid, pending } หรือ null */
export async function getPendingByFormToken(formToken) {
  const tok = String(formToken || "").trim();
  if (!/^[a-f0-9]{20}$/.test(tok)) return null;
  const uid = await getValue(`objinfo:form:${tok}`);
  if (!uid) return null;
  const raw = (await getValue(pendingKey(uid))) || (await getValue(backupKey(uid)));
  if (!raw) return null;
  try {
    return { uid, pending: JSON.parse(raw) };
  } catch {
    return null;
  }
}

/** ฟอร์ม HTML submit: บันทึกแยกฟิลด์ตรง ๆ (ไม่ผ่าน LLM) + ปล่อยรายงาน */
export async function submitOwnerInfoForm(formToken, fields) {
  const found = await getPendingByFormToken(formToken);
  if (!found) return { ok: false, reason: "expired" };
  const { uid, pending } = found;
  const f = fields || {};
  const clean = (v, n = 200) => String(v || "").trim().slice(0, n) || null;
  const unknownAll = !clean(f.objectName) && !clean(f.temple) && !clean(f.eraYear) && !clean(f.stoneType);
  await supabase.from("object_owner_info").insert({
    line_user_id: uid,
    scan_result_id: pending.scanResultId || null,
    object_key: pending.objectKey,
    lane: pending.lane,
    raw_text: clean(JSON.stringify({ src: "form", ...f }), 2000),
    object_name: clean(f.objectName),
    temple: clean(f.temple),
    era_year: clean(f.eraYear, 40),
    stone_type: clean(f.stoneType),
    purpose: clean(f.purpose, 40),
    origin_story: clean([f.origin, f.story].filter(Boolean).join(" — "), 1000),
    parse_confidence: 1,
    unknown: unknownAll,
    source: "owner_form",
  });
  await clearDedupeKey(pendingKey(uid));
  await clearDedupeKey(backupKey(uid));
  await clearDedupeKey(`objinfo:form:${String(formToken).trim()}`);
  await reEnqueueHeldReport(uid, pending);
  console.log(JSON.stringify({ event: "OBJECT_INFO_SAVED", via: "form", lineUserIdPrefix: uid.slice(0, 8) }));
  return { ok: true };
}

/** ปุ่ม "พกเพื่อX" หลังส่งผล — อัปเดตแถวล่าสุดของชิ้น */
export async function maybeHandlePurposeAnswer({ client, event, userId, text }) {
  const t = String(text || "").trim();
  let choice = null;
  const m = t.match(/^พกเพื่อ(.+)$/);
  if (m && PURPOSE_CHOICES.includes(m[1])) choice = m[1];
  try {
    const raw = await getValue(`objinfo:purpose:${userId}`);
    if (!raw) return false;
    if (!choice) {
      // ตอบเป็นข้อความอิสระแทนกดปุ่ม (เคส GopGap 8 ส.ค.: "อยากใส่เสริมเรื่องงาน"
      // หลุดไป consult แล้วโดนเสนอขาย) — จับคำสำคัญเอง ไม่เข้าเค้าค่อยปล่อยไปแชทปกติ
      const KEYMAP = [
        [/งาน|เจ้านาย|หัวหน้า|ประชุม|สัมภาษณ์/, "งาน"],
        [/เงิน|ขาย|ค้า|ธุรกิจ|ลูกค้า|รวย/, "การเงิน"],
        [/รัก|แฟน|คู่|เสน่ห|นัด|คนชอบ/, "ความรัก"],
        [/คุ้มครอง|ปลอดภัย|เดินทาง|แคล้ว|กันภัย/, "คุ้มครอง"],
        [/โชค|หวย|ลาภ|เสี่ยง/, "เสี่ยงโชค"],
        [/สะสม|บูชา|เก็บไว้/, "สะสมบูชา"],
      ];
      for (const [re, c] of KEYMAP) {
        if (re.test(t)) { choice = c; break; }
      }
      if (!choice) return false;
    }
    const { objectKey } = JSON.parse(raw);
    const { data } = await supabase
      .from("object_owner_info")
      .select("id")
      .eq("line_user_id", userId)
      .eq("object_key", objectKey)
      .order("created_at", { ascending: false })
      .limit(1);
    if (data?.[0]?.id) {
      await supabase.from("object_owner_info").update({ purpose: choice }).eq("id", data[0].id);
    }
    await clearDedupeKey(`objinfo:purpose:${userId}`);
    await client.replyMessage(event.replyToken, {
      type: "text",
      text: `รับทราบครับ ชิ้นนี้พกเพื่อ${choice} อาจารย์จะจำไว้เวลาแนะนำการพกครับ`,
    });
    return true;
  } catch {
    return false;
  }
}
