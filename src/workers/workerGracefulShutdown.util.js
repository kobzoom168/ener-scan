/**
 * Poll until `getActiveCount()` is 0 or `timeoutMs` elapses.
 * @param {{ getActiveCount: () => number, timeoutMs: number, pollMs?: number }} p
 * @returns {Promise<"clean"|"timeout">}
 */
export async function waitForGracefulDrain({
  getActiveCount,
  timeoutMs,
  pollMs = 500,
}) {
  const deadline = Date.now() + Math.max(0, timeoutMs);
  const step = Math.max(50, pollMs);
  while (Date.now() < deadline) {
    if (getActiveCount() <= 0) return "clean";
    await new Promise((r) => setTimeout(r, step));
  }
  return getActiveCount() <= 0 ? "clean" : "timeout";
}
