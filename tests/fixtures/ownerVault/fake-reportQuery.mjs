export * from "../../../src/services/reports/reportQuery.service.js?real";
const F = () => globalThis.__ownerVaultFixtures;
export async function getReportByPublicToken(publicToken) {
  const r = F()?.reports?.get(String(publicToken));
  if (!r) return { payload: null, loadSource: "fixture", accessError: { httpStatus: 404, code: "REPORT_NOT_FOUND" } };
  if (r.accessError) return { payload: null, loadSource: "fixture", accessError: r.accessError };
  return { payload: r.payload, loadSource: "fixture", accessError: null };
}
export async function resolvePublicReportPayload(publicToken) {
  const r = F()?.reports?.get(String(publicToken));
  return r && !r.accessError ? r.payload : null;
}
