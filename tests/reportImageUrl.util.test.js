import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeHttpsPublicImageUrl } from "../src/utils/reports/reportImageUrl.util.js";
import { normalizeReportPayloadForRender } from "../src/utils/reports/reportPayloadNormalize.util.js";

test("sanitizeHttpsPublicImageUrl: https kept", () => {
  const u = "https://example.com/path/to/img.jpg?x=1";
  assert.equal(sanitizeHttpsPublicImageUrl(u), u);
});

test("sanitizeHttpsPublicImageUrl: strips non-https", () => {
  assert.equal(sanitizeHttpsPublicImageUrl("http://evil.com/x.png"), "");
  assert.equal(sanitizeHttpsPublicImageUrl("javascript:alert(1)"), "");
  assert.equal(sanitizeHttpsPublicImageUrl("data:image/png;base64,xxx"), "");
});

test("normalizeReportPayloadForRender: objectImageUrl only https", () => {
  const { payload } = normalizeReportPayloadForRender({
    summary: { summaryLine: "t" },
    sections: {},
    trust: {},
    actions: {},
    object: {
      objectImageUrl: "javascript:alert(1)",
    },
  });
  assert.equal(payload.object.objectImageUrl, "");
  const { payload: ok } = normalizeReportPayloadForRender({
    summary: { summaryLine: "t" },
    sections: {},
    trust: {},
    actions: {},
    object: {
      objectImageUrl: "https://cdn.example.com/a.png",
    },
  });
  assert.equal(ok.object.objectImageUrl, "https://cdn.example.com/a.png");
});
