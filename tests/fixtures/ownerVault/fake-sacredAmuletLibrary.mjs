export * from "../../../src/services/reports/sacredAmuletLibrary.service.js?real";
export async function buildSacredAmuletLibraryForLineUser(lineUserId) {
  globalThis.__ownerVaultCalls?.push(["amuletLibrary", lineUserId]);
  return globalThis.__ownerVaultFixtures?.libraries?.get(String(lineUserId))?.amulet ?? null;
}
