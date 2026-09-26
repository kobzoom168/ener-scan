// สถานะจ่ายเงินตาม fixture — หน้าดูของเดิมต้องให้ผลเหมือนกันไม่ว่าค่านี้เป็นอะไร
export async function hasRecentPaidAccess(lineUserId) {
  globalThis.__ownerVaultCalls?.push(["hasRecentPaidAccess", lineUserId]);
  return globalThis.__ownerVaultFixtures?.paid?.get(String(lineUserId)) === true;
}
export async function hasEverPaid(lineUserId) { return hasRecentPaidAccess(lineUserId); }
