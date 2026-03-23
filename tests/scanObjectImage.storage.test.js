import { test } from "node:test";
import assert from "node:assert/strict";
import { guessImageContentType } from "../src/services/storage/scanObjectImage.storage.js";

test("guessImageContentType: jpeg png gif webp", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff]);
  assert.equal(guessImageContentType(jpeg).ext, "jpg");
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  assert.equal(guessImageContentType(png).ext, "png");
  const gif = Buffer.from([0x47, 0x49, 0x46, 0x38]);
  assert.equal(guessImageContentType(gif).ext, "gif");
  const webp = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  assert.equal(guessImageContentType(webp).ext, "webp");
});
