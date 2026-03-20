/**
 * Legacy DB history module.
 *
 * The project uses `public.scan_results` as the billing/source-of-truth for used scans.
 * Older history writes to a legacy `scans` table are obsolete and can break deployments.
 *
 * This module is kept to preserve imports, but it no longer writes/reads from DB.
 * Runtime scan history UX is served from the in-memory store (`scanHistory.store.js`).
 */

export async function addScanHistory(_userId, _input) {
  return true; // no-op (legacy table removed/obsolete)
}

export async function getScanHistory(_userId, _limit = 20) {
  return [];
}

export async function getLatestScanHistory(_userId) {
  return null;
}

export async function getScanHistoryCount(_userId) {
  return 0;
}

export async function clearScanHistory(_userId) {
  return true;
}

export async function clearAllScanHistory() {
  return true;
}
