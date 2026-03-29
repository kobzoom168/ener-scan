import { loadActiveScanOffer } from "../services/scanOffer.loader.js";

/** Fixed LINE copy after admin free reset (deterministic; not quota-dependent). */
export const ADMIN_FREE_RESET_CONFIRM_TEXT =
  "รีเซ็ตสิทธิ์สแกนฟรีให้แล้วครับ ตอนนี้ลองส่งภาพใหม่ได้เลย";

/**
 * Metadata for admin API + analytics; user-visible `text` is always {@link ADMIN_FREE_RESET_CONFIRM_TEXT}.
 * @returns {{ text: string, freeQuotaPerDay: number, offerLabel: string, configVersion: string }}
 */
export function buildAdminFreeResetConfirmationPayload() {
  const offer = loadActiveScanOffer();
  const { freeQuotaPerDay, label, configVersion } = offer;
  return {
    text: ADMIN_FREE_RESET_CONFIRM_TEXT,
    freeQuotaPerDay,
    offerLabel: label,
    configVersion,
  };
}
