/**
 * Supabase Storage `remove()` sometimes errors when the object is already gone.
 * Treat as success so retention can mark DB without retry loops.
 * @param {unknown} error
 * @returns {boolean}
 */
export function isSupabaseStorageObjectAlreadyRemovedError(error) {
  if (error == null) return false;
  const err = /** @type {{ message?: string, statusCode?: number|string, status?: number|string }} */ (
    error
  );
  const status = err.statusCode ?? err.status;
  if (status === 404 || status === "404" || Number(status) === 404) return true;
  const msg = String(err.message || "").toLowerCase();
  if (
    /not\s*found|does\s*not\s*exist|object\s*not\s*found|no\s*such|unknown\s*error.*404|bucket\s*not\s*found/.test(
      msg,
    )
  ) {
    return true;
  }
  return false;
}
