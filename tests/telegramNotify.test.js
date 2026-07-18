import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkTelegramText } from "../src/services/telegramNotify.service.js";

test("chunkTelegramText: สั้นก้อนเดียว ยาวตัดตามบรรทัด ไม่หายสักบรรทัด", () => {
  assert.deepEqual(chunkTelegramText("สวัสดี"), ["สวัสดี"]);
  assert.deepEqual(chunkTelegramText("  "), []);
  const lines = Array.from({ length: 300 }, (_, i) => `บรรทัดที่ ${i} ${"x".repeat(30)}`);
  const chunks = chunkTelegramText(lines.join("\n"));
  assert.ok(chunks.length > 1);
  for (const c of chunks) assert.ok(c.length <= 3900);
  assert.equal(chunks.join("\n"), lines.join("\n"));
  // บรรทัดเดียวยาวเกินลิมิต → หั่นดิบ ไม่ค้าง
  const huge = "ก".repeat(9000);
  const hugeChunks = chunkTelegramText(huge);
  assert.ok(hugeChunks.length >= 3);
  assert.equal(hugeChunks.join(""), huge);
});
