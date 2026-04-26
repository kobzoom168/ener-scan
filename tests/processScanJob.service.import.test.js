import test from "node:test";

test("processScanJob.service.js dynamic import (no ReferenceError at load)", async () => {
  const url = new URL("../src/services/scanV2/processScanJob.service.js", import.meta.url);
  await import(url.href);
});
