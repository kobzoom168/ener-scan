/**
 * Run: npm test
 * Node 18+ (node:test)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseBirthdateInput,
  looksLikeBirthdateInput,
} from "../src/utils/birthdateParse.util.js";

describe("parseBirthdateInput — CE / BE", () => {
  it("accepts CE 14/09/1995", () => {
    const r = parseBirthdateInput("14/09/1995");
    assert.equal(r.ok, true);
    assert.equal(r.yearCE, 1995);
    assert.equal(r.normalizedDisplay, "14/09/1995");
    assert.equal(r.isoDate, "1995-09-14");
  });

  it("accepts BE 2538 and normalizes to CE 1995", () => {
    const r = parseBirthdateInput("14/09/2538");
    assert.equal(r.ok, true);
    assert.equal(r.yearCE, 1995);
    assert.equal(r.yearBE, 2538);
    assert.equal(r.normalizedDisplay, "14/09/1995");
    assert.equal(r.normalizedDisplayBE, "14/09/2538");
  });

  it("accepts BE with single-digit month 14-9-2538", () => {
    const r = parseBirthdateInput("14-9-2538");
    assert.equal(r.ok, true);
    assert.equal(r.yearCE, 1995);
  });

  it("rejects impossible calendar date 31/02/2538", () => {
    const r = parseBirthdateInput("31/02/2538");
    assert.equal(r.ok, false);
    assert.equal(r.reason, "invalid_date");
  });
});

describe("looksLikeBirthdateInput — unrelated Thai / keywords", () => {
  it("does not treat pure Thai text as date attempt", () => {
    assert.equal(looksLikeBirthdateInput("สแกนพลังงาน"), false);
    assert.equal(looksLikeBirthdateInput("จ่ายเงิน"), false);
    assert.equal(looksLikeBirthdateInput("ประวัติ"), false);
    assert.equal(looksLikeBirthdateInput("สถิติ"), false);
  });

  it("does not treat เปลี่ยนวันเกิด as date attempt (Thai command)", () => {
    assert.equal(looksLikeBirthdateInput("เปลี่ยนวันเกิด"), false);
  });

  it("does not treat hello as date attempt", () => {
    assert.equal(looksLikeBirthdateInput("hello"), false);
  });
});

describe("looksLikeBirthdateInput — date-like", () => {
  it("true for slash dates", () => {
    assert.equal(looksLikeBirthdateInput("14/09/1995"), true);
    assert.equal(looksLikeBirthdateInput("14/09/2538"), true);
  });
});
