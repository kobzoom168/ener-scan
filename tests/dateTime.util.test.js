import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BANGKOK_TIME_ZONE,
  formatBangkokDate,
  formatBangkokDateTime,
  formatBangkokReportMetaDateTime,
  formatBangkokTime,
  TH_LOCALE,
} from "../src/utils/dateTime.util.js";

/** Fixed UTC instant → known Bangkok wall time (TH +7, no DST). */
const SAMPLE_JUN_UTC = "2024-06-15T03:00:00.000Z";

test("formatBangkokDateTime: UTC ISO → Bangkok (th-TH)", () => {
  assert.equal(formatBangkokDateTime(SAMPLE_JUN_UTC), "15/6/2567 10:00");
});

test("formatBangkokDate: date-only in Bangkok calendar", () => {
  assert.equal(formatBangkokDate(SAMPLE_JUN_UTC), "15/6/2567");
});

test("formatBangkokTime: time-of-day in Bangkok", () => {
  assert.equal(formatBangkokTime(SAMPLE_JUN_UTC), "10:00");
});

test("formatBangkok*: invalid / null / empty → \"-\"", () => {
  assert.equal(formatBangkokDateTime(null), "-");
  assert.equal(formatBangkokDateTime(undefined), "-");
  assert.equal(formatBangkokDateTime(""), "-");
  assert.equal(formatBangkokDateTime("not-a-date"), "-");
  assert.equal(formatBangkokDateTime(Number.NaN), "-");

  assert.equal(formatBangkokDate(null), "-");
  assert.equal(formatBangkokTime("invalid"), "-");
});

test("formatBangkokDateTime: Date object accepted", () => {
  const d = new Date(SAMPLE_JUN_UTC);
  assert.equal(formatBangkokDateTime(d), "15/6/2567 10:00");
});

test("formatBangkokReportMetaDateTime: Gregorian Thai month abbrev + Bangkok time", () => {
  assert.equal(
    formatBangkokReportMetaDateTime("2026-04-16T08:25:00.000Z"),
    "16 เม.ย. 2026 15:25",
  );
  assert.equal(formatBangkokReportMetaDateTime(SAMPLE_JUN_UTC), "15 มิ.ย. 2024 10:00");
  assert.equal(formatBangkokReportMetaDateTime(null), "-");
  assert.equal(formatBangkokReportMetaDateTime("not-a-date"), "-");
});

test("constants: timezone + locale", () => {
  assert.equal(BANGKOK_TIME_ZONE, "Asia/Bangkok");
  assert.equal(TH_LOCALE, "th-TH");
});
