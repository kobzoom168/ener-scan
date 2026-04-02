import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const processScanJobPath = join(
  __dirname,
  "../src/services/scanV2/processScanJob.service.js",
);

test("processScanJob: reportPublicationId declared at top (avoids ReferenceError)", () => {
  const src = readFileSync(processScanJobPath, "utf8");
  const fn = src.indexOf("export async function processScanJob");
  assert(fn >= 0);
  const decl = src.indexOf("let reportPublicationId", fn);
  assert(decl >= 0, "expected let reportPublicationId in processScanJob");
  const enqueueStart = src.indexOf("SCAN_RESULT_OUTBOUND_ENQUEUE_START", fn);
  assert(enqueueStart >= 0);
  assert(
    decl < enqueueStart,
    "reportPublicationId must be declared before SCAN_RESULT_OUTBOUND_ENQUEUE_START",
  );
});

test("processScanJob: missing publication id fails with known error code string", () => {
  const src = readFileSync(processScanJobPath, "utf8");
  assert(
    src.includes("publication_id_missing_after_upsert"),
    "expected failJob code for missing publication id",
  );
  assert(
    src.includes("SCAN_V2_REPORT_PUBLICATION_ID_MISSING"),
    "expected telemetry event for missing publication id",
  );
});
