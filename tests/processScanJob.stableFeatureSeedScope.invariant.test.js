import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const processScanJobPath = join(
  __dirname,
  "../src/services/scanV2/processScanJob.service.js",
);

test("processScanJob: stableFeatureSeed hoisted once (no ReferenceError at baseline hook)", () => {
  const src = readFileSync(processScanJobPath, "utf8");
  const lets = [...src.matchAll(/\blet stableFeatureSeed\b/g)];
  assert.equal(
    lets.length,
    1,
    "expected exactly one `let stableFeatureSeed` (hoisted at processScanJob top scope)",
  );
  const fnStart = src.indexOf("export async function processScanJob");
  assert.ok(fnStart >= 0);
  // Import line also contains the symbol; only the in-function call matters.
  const hookIdx = src.indexOf("void maybePersistGlobalObjectBaselineAfterScanV2", fnStart);
  assert.ok(hookIdx > fnStart);
  const declIdx = src.indexOf("let stableFeatureSeed = null;");
  assert.ok(declIdx > fnStart && declIdx < hookIdx, "declaration must precede baseline persist hook");
});
