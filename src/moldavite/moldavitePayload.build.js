import { fnv1a32, computeMoldaviteLifeAreaScoresDeterministicV1 } from "./moldaviteScores.util.js";

/** @typedef {import("./moldaviteScores.util.js").MoldaviteLifeAreaKey} MoldaviteLifeAreaKey */

const LIFE_AREA_THAI_SHORT = {
  work: "งาน",
  money: "การเงิน",
  relationship: "ความสัมพันธ์",
};

/**
 * Native-energy-first Flex copy (transition / acceleration / movement).
 * Life-area lines are secondary — used only in the second bullet.
 *
 * @param {MoldaviteLifeAreaKey} primary
 * @param {MoldaviteLifeAreaKey} secondary
 */
function buildFlexSurfaceCopy(primary, secondary) {
  const pairKey = [primary, secondary].slice().sort().join("|");
  const h = fnv1a32(`${pairKey}|moldavite_native_v2`);

  const headlines = [
    "มอลดาไวต์ — หินที่เด่นเรื่องการเร่งการเปลี่ยนแปลง",
    "มอลดาไวต์ — พลังโทนเร่งรอบ ดันให้ของเดิมขยับ",
    "มอลดาไวต์ — เข้ารอบใหม่ได้ไวขึ้นเมื่อพร้อมปล่อยของเก่า",
  ];
  const fitLines = [
    "ช่วยดันให้สิ่งที่ค้างอยู่ขยับ — ไม่ใช่แค่พลังสงบ แต่เป็นการขยับต่อ",
    "เหมาะกับช่วงที่ต้องตัดสินใจ ปล่อยของเดิม หรือเริ่มรอบใหม่",
    "โทนเร่งจังหวะเปลี่ยน — จบของเดิมได้ไวขึ้นเมื่อใจพร้อม",
  ];
  const nativeBullets = [
    "เด่นเรื่องการเร่งการเปลี่ยนแปลง — ดันให้เกิดการเคลื่อนไหวแทนการนิ่งเกินไป",
    "ช่วยให้จุดที่ติดขัดขยับ — อ่านเป็นพลังแปลงสภาพ ไม่ใช่แค่คำปลอบใจทั่วไป",
    "เหมาะใช้ในช่วงที่ต้องการเริ่มใหม่จริง ๆ ไม่ใช่แค่รอสิ่งดี ๆ มาเอง",
  ];

  const headline = headlines[h % headlines.length];
  const fitLine = fitLines[(h >> 3) % fitLines.length];
  const nativeBullet = nativeBullets[(h >> 6) % nativeBullets.length];

  const projectionByPair = {
    "money|relationship":
      "ตอนนี้โทนนี้อาจสะท้อนไปที่เรื่องการเงินและความสัมพันธ์ได้ชัดในช่วงนี้ — เป็นมุมรอง ไม่ใช่ใจกลางของพลังชิ้นนี้",
    "money|work":
      "ตอนนี้โทนนี้อาจสะท้อนไปที่เรื่องงานและการเงินได้ชัดในช่วงนี้ — เป็นมุมรอง ไม่ใช่ใจกลางของพลังชิ้นนี้",
    "relationship|work":
      "ตอนนี้โทนนี้อาจสะท้อนไปที่เรื่องงานและความสัมพันธ์ได้ชัดในช่วงนี้ — เป็นมุมรอง ไม่ใช่ใจกลางของพลังชิ้นนี้",
  };

  const projectionLine =
    projectionByPair[pairKey] ||
    `ตอนนี้โทนนี้อาจไปแตะเรื่อง${LIFE_AREA_THAI_SHORT[primary]}และ${LIFE_AREA_THAI_SHORT[secondary]}มากเป็นพิเศษ — เป็นมุมรอง ไม่ใช่ใจกลางของพลังชิ้นนี้`;

  const heroNamingLine = headline.includes(" — ")
    ? headline.split(" — ").slice(1).join(" — ").trim()
    : "หินที่เด่นเรื่องการเร่งการเปลี่ยนแปลง";

  const mainEnergyWordingLine =
    "มอลดาไวต์ — หินเทคไทต์โทนเร่งการเปลี่ยนแปลง ดันให้สิ่งที่ค้างขยับและเข้ารอบใหม่ได้เร็วขึ้นเมื่อพร้อม";

  return {
    headline,
    fitLine,
    bullets: [nativeBullet, projectionLine],
    mainEnergyShort: "มอลดาไวต์",
    heroNamingLine,
    mainEnergyWordingLine,
  };
}

/**
 * @param {object} p
 * @param {string} p.scanResultId
 * @param {{ reason: string, matchedSignals?: string[] }} p.detection
 * @param {string} p.seedKey
 * @param {number|null} [p.energyScore]
 * @param {string} [p.mainEnergyLabel]
 * @returns {import("../services/reports/reportPayload.types.js").ReportMoldaviteV1}
 */
export function buildMoldaviteV1Slice({
  scanResultId,
  detection,
  seedKey,
  energyScore = null,
  mainEnergyLabel = "",
}) {
  const scores = computeMoldaviteLifeAreaScoresDeterministicV1(seedKey);
  const flexSurface = buildFlexSurfaceCopy(
    scores.primaryLifeArea,
    scores.secondaryLifeArea,
  );

  return {
    version: "1",
    scoringMode: scores.scoringMode,
    detection: {
      reason: detection.reason,
      matchedSignals:
        "matchedSignals" in detection && Array.isArray(detection.matchedSignals)
          ? detection.matchedSignals
          : [],
    },
    lifeAreas: scores.lifeAreas,
    primaryLifeArea: scores.primaryLifeArea,
    secondaryLifeArea: scores.secondaryLifeArea,
    flexSurface,
    context: {
      scanResultIdPrefix: String(scanResultId || "").slice(0, 8),
      energyScoreSnapshot:
        energyScore != null && Number.isFinite(Number(energyScore))
          ? Number(energyScore)
          : null,
      mainEnergyLabelSnapshot: String(mainEnergyLabel || "").trim() || null,
    },
  };
}
