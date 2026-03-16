const scanStartedAt = Date.now();
console.log("[SCAN_TIMING] startedAt:", scanStartedAt);

// ... หลัง generate เสร็จ

const scanEndedAt = Date.now();
console.log("[SCAN_TIMING] endedAt:", scanEndedAt);
console.log("[SCAN_TIMING] elapsedMs:", scanEndedAt - scanStartedAt);
console.log(
  "[SCAN_TIMING] elapsedSec:",
  ((scanEndedAt - scanStartedAt) / 1000).toFixed(2)
);