/**
 * Thai explanation lines for compatibility v1 (HTML / expandable; Flex uses score+band only).
 */

/**
 * @typedef {Object} CompatibilityComputed
 * @property {number} score
 * @property {string} band
 * @property {string} formulaVersion
 * @property {{ elementScore: number, numberScore: number, objectSymbolScore: number, contextScore: number }} factors
 * @property {object} inputs
 */

/**
 * Four short bullets for `payload.compatibility.explain`
 * @param {CompatibilityComputed} computed
 * @returns {string[]}
 */
export function buildCompatibilityExplainBullets(computed) {
  const { inputs, factors } = computed;
  const oe = inputs.ownerElement;
  const ob = inputs.objectElement;

  const line1 =
    oe === ob
      ? "ธาตุเจ้าของกับธาตุวัตถุสอดคล้องในเชิงปรับสมดุล"
      : `ธาตุเจ้าของ (${oe}) เทียบกับธาตุวัตถุ (${ob}) ตามแนวปรับจังหวะภายใน`;

  const stable = Boolean(
    inputs &&
      typeof inputs === "object" &&
      /** @type {{ stableAnchors?: boolean }} */ (inputs).stableAnchors,
  );
  const line2 = stable
    ? factors.numberScore >= 70
      ? "เลขวันเกิดต่อกลุ่มพลังหลักได้ดี — จังหวะตัวเลขยึดจากสัญญาณวัตถุ+เจ้าของแบบคงที่ (ไม่ใช้เวลาสแกนจริง)"
      : factors.numberScore >= 55
        ? "เลขวันเกิดหนุนบางส่วนต่อพลังหลัก — จังหวะตัวเลขยึดแบบคงที่จากสัญญาณวัตถุ+เจ้าของ"
        : "เลขวันเกิดกับกลุ่มพลังหลักยังไม่เต็มจังหวะ — ยังปรับใช้ได้ด้วยความตั้งใจ"
    : factors.numberScore >= 70
      ? "เลขวันเกิดและเลขเวลาส่งอยู่ในกลุ่มพลังที่หนุนกัน"
      : factors.numberScore >= 55
        ? "เลขวันเกิดและเลขเวลาส่งหนุนบางส่วนต่อพลังหลักที่เลือก"
        : "เลขวันเกิดและเลขเวลาส่งอยู่คนละจังหวะกับกลุ่มพลังหลัก — ยังปรับใช้ได้ด้วยความตั้งใจ";

  const line3 =
    factors.objectSymbolScore >= 80
      ? "ลักษณะและพลังหลักของวัตถุหนุนความนิ่งและการใช้งานจริง"
      : "ลักษณะวัตถุและพลังหลักช่วยสะท้อนความเหมาะในระดับที่ใช้งานได้";

  const bucket = inputs.hourBucket;
  const line4 =
    bucket === "active_day"
      ? "ช่วงกลางวันต่อจังหวะพลังกลาง ๆ แบบใช้งานได้จริง"
      : bucket === "morning"
        ? "ช่วงเช้าต่อจังหวะเริ่มต้นและความสดใส"
        : bucket === "deep_night"
          ? "ช่วงดึกต่อจังหวะภายในและความนิ่ง"
          : bucket === "settling"
            ? "ช่วงบ่ายแก่ ๆ ต่อจังหวะสะสมและตั้งหลัก"
            : "ช่วงเย็นถึงกลางคืนต่อจังหวะพลังที่นุ่มและลดแรงปะทะ";

  void factors;
  return [line1, line2, line3, line4];
}
