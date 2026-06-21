import { deriveAmuletOwnerPowerProfile } from "./amuletOwnerProfile.util.js";
import { POWER_ORDER } from "./amuletScores.util.js";

/**
 * @param {number} v
 */
export function clamp0100(v) {
  if (!Number.isFinite(v)) return 50;
  return Math.min(100, Math.max(0, Math.round(v)));
}

/**
 * @param {Record<string, number>} objectP
 */
export function sortPowerKeysByObjectDesc(objectP) {
  return [...POWER_ORDER].sort((a, b) => {
    const db = (Number(objectP[b]) || 0) - (Number(objectP[a]) || 0);
    if (db !== 0) return db;
    return POWER_ORDER.indexOf(a) - POWER_ORDER.indexOf(b);
  });
}

/**
 * เลือกระหว่าง top1/top2 ของวัตถุว่าแกนไหนเข้ากับเจ้าของมากที่สุด (คะแนนห่างน้อยสุด)
 * @param {Record<string, number>} ownerP
 * @param {Record<string, number>} objectP
 * @param {string[]} ord
 */
export function pickAlignKeyAmongTopTwo(ownerP, objectP, ord) {
  const a = ord[0];
  const b = ord[1];
  const da = Math.abs(ownerP[a] - objectP[a]);
  const db = Math.abs(ownerP[b] - objectP[b]);
  return da <= db ? a : b;
}

/**
 * ลำดับแกนจากคะแนนวัตถุ + แกนที่ส่งกับเจ้าของมากที่สุดในสองอันดับแรก
 * @param {import("../services/reports/reportPayload.types.js").ReportPayload} payload
 */
export function computeAmuletOrdAndAlignFromPayload(payload) {
  const av = payload?.amuletV1;
  if (!av || typeof av !== "object") return null;
  const pc =
    av.powerCategories && typeof av.powerCategories === "object"
      ? av.powerCategories
      : {};

  /** @type {Record<string, number>} */
  const objectP = {};
  for (const k of POWER_ORDER) {
    const e = pc[k];
    const sc =
      e && typeof e === "object" && e.score != null ? Number(e.score) : NaN;
    objectP[k] = clamp0100(sc);
  }

  /**
   * Owner-fit profile must be STABLE per (owner, object) so "เข้ากับคุณที่สุด" does NOT flip when
   * the same amulet is re-scanned from another angle. It used `payload.scanId` (unique per scan)
   * → the owner profile re-rolled every scan and the alignment axis flipped even though the object
   * scores were identical. Seed it on the object's own score signature instead (same object →
   * same scores, incl. on baseline reuse → same seed). Prefer an explicit stable id if present.
   */
  const objSig = POWER_ORDER.map((k) => objectP[k]).join(",");
  const seed =
    String(
      payload?.stableFeatureSeed || objSig || payload?.scanId || payload?.reportId || "seed",
    ).trim() || "seed";
  const ownerProf = deriveAmuletOwnerPowerProfile(payload?.birthdateUsed, seed);

  /** @type {Record<string, number>} */
  const ownerP = {};
  for (const k of POWER_ORDER) {
    ownerP[k] = clamp0100(Number(ownerProf.ownerPower[k]) || 50);
  }

  const ord = sortPowerKeysByObjectDesc(objectP);
  const alignKey = pickAlignKeyAmongTopTwo(ownerP, objectP, ord);

  return { ord, alignKey, objectP, ownerP, ownerProf };
}
