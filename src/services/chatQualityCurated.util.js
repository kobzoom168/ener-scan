/**
 * ชั้นคัดกรองรายงานคุณภาพแชทตามเกณฑ์กบ — ย้ายจาก hermes cron เข้ามาคุมเอง
 * (incident 20 ส.ค. 2026: OpenRouter 504 ทุก retry + hermes ไม่มี model fallback
 * → รายงานคัดกรองทั้งวันหาย เหลือแต่ failure message ซ้ำ ๆ)
 *
 * กติกาชั้นนี้:
 * - แต่ละ model ใน chain มี timeout ของตัวเอง · ผลเป็น typed outcome เสมอ
 *   (model / latencyMs / failureReason) — timeout ต้องออกมาเป็น provider_timeout
 *   ไม่ใช่ exception ทะลุไปฆ่ารายงานทั้งวัน
 * - ทุก model ล้ม → คนเรียกต้องสร้าง degraded report จากรายงานดิบ (ห้ามทิ้งทั้งวัน)
 */

/** เกณฑ์ตัดสินของกบ (ตรงกับ prompt เดิมใน hermes job ener_chat_quality) */
export const CURATOR_SYSTEM = `คุณคือผู้ช่วยตรวจคุณภาพแชทของ Ener Scan (LINE OA อาจารย์เอเนอร์) ผู้ใช้จะส่งรายงานดิบที่ระบบสร้างตอน 6 โมงเช้า (ข้อมูลเต็มวันเมื่อวาน 00:00-23:59) มาให้คัดกรอง

บริบทธุรกิจ: Ener Scan เป็นบริการสายความเชื่อ อ่านพลังงานพระเครื่องและเครื่องราง ตัวละคร อาจารย์ คือ AI ที่ตั้งใจให้ลูกค้าเชื่อว่าเป็นอาจารย์มนุษย์ชายวัย 41 สุขุม มีบารมี เป้าหมายเดียวคือ คุยกับลูกค้ารู้เรื่อง ไม่หลุดบท ลูกค้าต้องไม่รู้ว่าเป็น AI

เกณฑ์ตัดสินที่กบกำหนด:
- การเล่นบทอาจารย์สายพลังงาน เช่น เข้าสมาธิ เพ่งพลัง อาจารย์ดูให้ = ถูกต้อง ไม่ใช่ปัญหา
- ปัญหาจริง: 1) หลุดบทเผยความเป็น AI ระบบ บอท 2) มโนตัวเลขหรือผลอ่านที่ยังไม่ได้คำนวณจริง 3) ตอบไม่ตรงคำถามหรือขัด flow 4) ภาษาดูเป็น AI คือมีเครื่องหมายคำพูดครอบคำ หรือขีดคั่นประโยคแบบ em dash 5) โทนผิด คือประจบตามใจลูกค้าเกินเหตุ ตื่นเต้นเว่อร์ เล่นมุก ไม่สมกับอาจารย์วัย 41 6) ลูกค้าทักภาษาอังกฤษแต่บอทตอบไทย

หน้าที่: ส่งรายงานให้กบครบถ้วน เรียงเคสตามความรุนแรงตามเกณฑ์ข้างบน เคสไหนเป็นการเล่นบทถูกต้องให้ระบุว่าไม่ใช่ปัญหาพร้อมเหตุผลสั้น ๆ คงเวลา LINE userId เต็ม และ quote ข้อความบอทครบเพื่อให้กบ copy ไปสั่งแก้ ปิดท้ายความเห็น 1-2 ประโยคว่าควรแก้อะไรก่อน ถ้าไม่มีปัญหาสรุปบรรทัดเดียวว่าวันนี้แชทเรียบร้อย ตอบเป็นข้อความธรรมดาภาษาไทย (plain text สำหรับ Telegram)`;

/** จำแนก error จาก LLM call เป็น typed failureReason */
export function classifyLlmFailure(e) {
  const msg = String(e?.message || e || "");
  if (/timeout|timed?[ _-]?out|idle|504/i.test(msg)) return "provider_timeout";
  if (/compat_http_4\d\d/i.test(msg)) return "provider_rejected";
  if (/compat_http_5\d\d/i.test(msg)) return "provider_error";
  if (/model_unavailable|not.?found|no such model/i.test(msg)) return "model_unavailable";
  return "provider_error";
}

/**
 * ไล่ chain ทีละ model — แต่ละตัว timeout ของตัวเอง + typed outcome ต่อ attempt
 * @param {string} baseReport
 * @param {{ models: Array<{ model: string, timeoutMs: number }>,
 *   callModel: (model: string, prompt: string, timeoutMs: number) => Promise<string>,
 *   log?: (event: string, extra: object) => void }} deps
 * @returns {Promise<{ ok: boolean, text?: string, failureType?: string,
 *   attempts: Array<{ model: string, latencyMs: number, ok?: boolean, failureReason?: string }> }>}
 */
export async function curateWithFallback(baseReport, deps) {
  const attempts = [];
  const log = deps.log || ((event, extra) => console.log(JSON.stringify({ event, ...extra })));
  for (const m of deps.models || []) {
    const t0 = Date.now();
    let attempt;
    try {
      const text = String((await deps.callModel(m.model, baseReport, m.timeoutMs)) || "").trim();
      const latencyMs = Date.now() - t0;
      if (!text) {
        attempt = { model: m.model, latencyMs, failureReason: "empty_response" };
      } else {
        attempt = { model: m.model, latencyMs, ok: true };
        attempts.push(attempt);
        log("CHAT_QUALITY_CURATE_ATTEMPT", attempt);
        return { ok: true, text, attempts };
      }
    } catch (e) {
      attempt = { model: m.model, latencyMs: Date.now() - t0, failureReason: classifyLlmFailure(e) };
    }
    attempts.push(attempt);
    log("CHAT_QUALITY_CURATE_ATTEMPT", attempt);
  }
  // failureType รวม: ถ้ามี timeout อย่างน้อยหนึ่ง = provider_timeout (สื่อสาเหตุหลักของ incident)
  const failureType = attempts.some((a) => a.failureReason === "provider_timeout")
    ? "provider_timeout"
    : attempts[0]?.failureReason || "no_models_configured";
  return { ok: false, attempts, failureType };
}

/**
 * รายงานสำรองเมื่อ LLM คัดกรองล้มทุกตัว — เนื้อหาจากรายงานดิบ (deterministic
 * checks ไม่ใช้ AI + ผลตรวจต่อบทสนทนาที่สำเร็จไปแล้วตอน 6 โมง) ห้ามทิ้งทั้งวัน
 */
export function buildDegradedReport({ reportDateTH, baseText, convCount, deterministicIncidents, attempts }) {
  const tried = (attempts || [])
    .map((a) => `${a.model}: ${a.failureReason || "ok"} (${a.latencyMs}ms)`)
    .join(" · ");
  return [
    `⚠️ รายงานคุณภาพแชท ${reportDateTH} — วิเคราะห์เชิง AI (คัดกรองตามเกณฑ์) ไม่สำเร็จ`,
    `LLM ที่ลองแล้วล้มทั้งหมด: ${tried || "ไม่มี model ใน chain"}`,
    `ข้อมูลไม่สูญหาย: บทสนทนา ${Number(convCount) || 0} ราย · incident จาก detector ไม่ใช้ AI ${Number(deterministicIncidents) || 0} รายการ`,
    `ด้านล่างคือรายงานดิบฉบับเต็มจากระบบ:`,
    "",
    String(baseText || ""),
  ].join("\n");
}
