import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolvePublicReportPayload,
  PHASE1_DEMO_PUBLIC_TOKEN,
} from "../src/services/reports/reportQuery.service.js";

test("resolvePublicReportPayload: Phase1 memory demo emits REPORT_PUBLIC_LOOKUP_START + HIT (memory)", async (t) => {
  const lines = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...args) => {
    lines.push(args.map(String).join(" "));
  };
  console.error = () => {};
  t.after(() => {
    console.log = origLog;
    console.error = origErr;
  });

  const r = await resolvePublicReportPayload(PHASE1_DEMO_PUBLIC_TOKEN);
  assert.equal(r.kind, "ok");
  if (r.kind !== "ok") return;

  const joined = lines.join("\n");
  assert.match(joined, /"event":"REPORT_PUBLIC_LOOKUP_START"/);
  assert.match(joined, /"event":"REPORT_PUBLIC_LOOKUP_HIT"/);
  assert.match(joined, /"sourceLayer":"memory"/);
  assert.equal(r.loadSource, "memory");
});
