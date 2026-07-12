/**
 * Circuit breaker กันฟีเจอร์เสริมลากด่านหลักล้ม (บทเรียนพายุ rate-limit 12 ก.ค. 2026:
 * forensic ถล่ม OpenAI quota → object gate ตอบไม่ทัน → ปัดลูกค้าจริง 62% ทั้งวัน).
 *
 * ใช้แบบ in-process ต่อ worker: ล้มติดกันถึงเกณฑ์ในหน้าต่างเวลา → วงจร "เปิด" =
 * ฟีเจอร์นั้นหยุดตัวเองชั่วคราว แล้วค่อยลองใหม่หลัง cooldown — ไม่ต้องรอคนมาปิด env
 */

/**
 * @param {{ name: string, failureThreshold?: number, windowMs?: number, cooldownMs?: number }} p
 */
export function createCircuitBreaker({
  name,
  failureThreshold = 4,
  windowMs = 120_000,
  cooldownMs = 300_000,
}) {
  /** @type {number[]} timestamps of recent failures */
  let failures = [];
  let openUntil = 0;

  function prune(now) {
    failures = failures.filter((t) => now - t <= windowMs);
  }

  return {
    /** ฟีเจอร์นี้ควรทำงานตอนนี้ไหม (false = วงจรเปิด ให้ข้ามแบบ fail-open) */
    allow() {
      const now = Date.now();
      if (now < openUntil) return false;
      return true;
    },
    /** บันทึกความล้มเหลว (429/timeout) — ถึงเกณฑ์ = เปิดวงจร */
    recordFailure(reason = "") {
      const now = Date.now();
      prune(now);
      failures.push(now);
      if (failures.length >= failureThreshold && now >= openUntil) {
        openUntil = now + cooldownMs;
        failures = [];
        console.warn(
          JSON.stringify({
            event: "CIRCUIT_BREAKER_OPEN",
            name,
            reason: String(reason).slice(0, 120),
            cooldownMs,
          }),
        );
      }
    },
    recordSuccess() {
      failures = [];
    },
    isOpen() {
      return Date.now() < openUntil;
    },
  };
}

/**
 * วงจรรวมของ "งานเสริมที่ยิง OpenAI" (forensic ฯลฯ) — ด่านหลัก (object gate/deep scan)
 * ไม่เคยถูกบล็อกโดยตัวนี้ แต่จะ "รายงานอาการ" เข้ามา: ถ้าด่านหลักเริ่ม timeout/429
 * แปลว่า quota ตึง → งานเสริมต้องหลบทันที = การจอง quota ให้ด่านหลักโดยพฤตินัย
 */
export const openaiAuxBreaker = createCircuitBreaker({
  name: "openai_aux",
  failureThreshold: 3,
  windowMs: 120_000,
  cooldownMs: 300_000,
});
