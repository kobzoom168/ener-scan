/**
 * Map payment access gate reason to scan_jobs.access_source.
 * @param {{ allowed?: boolean, reason?: string } | null | undefined} accessDecision
 * @returns {"paid"|"free"|"admin_comp"|null}
 */
export function mapAccessDecisionToSource(accessDecision) {
  if (!accessDecision?.allowed) return null;
  const r = String(accessDecision.reason || "");
  if (r === "paid") return "paid";
  if (r === "free") return "free";
  return "free";
}
