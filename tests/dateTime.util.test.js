import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BANGKOK_TIME_ZONE,
  formatBangkokDate,
  formatBangkokDateTime,
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

test("constants: timezone + locale", () => {
  assert.equal(BANGKOK_TIME_ZONE, "Asia/Bangkok");
  assert.equal(TH_LOCALE, "th-TH");
});
