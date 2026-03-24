import { loadActiveScanOffer } from "../services/scanOffer.loader.js";

/**
 * LINE push text after admin resets free trial (quota from active scan offer config).
 * @returns {{ text: string, freeQuotaPerDay: number, offerLabel: string, configVersion: string }}
 */
export function buildAdminFreeResetConfirmationPayload() {
  const offer = loadActiveScanOffer();
  const { freeQuotaPerDay, label, configVersion } = offer;
  const text = `รีเซ็ตสิทธิ์ทดลองใช้ฟรีเรียบร้อยแล้วครับ ตอนนี้สามารถใช้สิทธิ์ฟรีได้อีก ${freeQuotaPerDay} ครั้ง`;
  return {
    text,
    freeQuotaPerDay,
    offerLabel: label,
    configVersion,
  };
}
