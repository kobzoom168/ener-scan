export * from "../../../src/services/reports/crystalBraceletLibrary.service.js?real";
export async function buildCrystalBraceletLibraryForLineUser(lineUserId) {
  globalThis.__ownerVaultCalls?.push(["braceletLibrary", lineUserId]);
  return globalThis.__ownerVaultFixtures?.libraries?.get(String(lineUserId))?.bracelet ?? null;
}
