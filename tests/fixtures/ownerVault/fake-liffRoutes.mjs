// controller dynamic-import liff.routes เพื่อ teaser/daily pick เท่านั้น
export async function buildDailyPickTeaserForLineUser(lineUserId) {
  globalThis.__ownerVaultCalls?.push(["teaser", lineUserId]);
  return globalThis.__ownerVaultFixtures?.teaser ?? null;
}
export async function listDailyPickRankedForLineUser() { return globalThis.__ownerVaultFixtures?.dailyPick ?? null; }
export async function buildLiffReadingFactsForChat() { return null; }
export const liffRouter = null;
export function setLiffLineClient() {}
export async function resolveLiffRights() { return { unavailable: true }; }
