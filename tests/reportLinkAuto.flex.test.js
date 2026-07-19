import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectSingleReportLink,
  buildReportLinkAutoFlex,
} from "../src/services/flex/reportLinkAuto.flex.js";

test("detectSingleReportLink: จับลิงก์เดียว ไม่จับหลายลิงก์/ไม่มีลิงก์", () => {
  const one = detectSingleReportLink(
    "ชิ้นเด่นคือเนื้อผง 8.4\nhttps://test.my-ener.uk/r/rpt_YhUqFWK7X8IdXen1b4-rOKUh\nพกติดตัวได้",
  );
  assert.ok(one);
  assert.equal(one.token, "rpt_YhUqFWK7X8IdXen1b4-rOKUh");
  // ลิงก์เดียวกันซ้ำ 2 ที่ = ชิ้นเดียว → ยังจับ
  assert.ok(
    detectSingleReportLink(
      "ดู https://x.uk/r/rpt_aaaabbbb และ https://x.uk/r/rpt_aaaabbbb".replace("rpt_aaaabbbb", "rpt_aaaabbbb"),
    ),
  );
  // สองชิ้น (ลิสต์ประวัติ) → ไม่แปลง
  assert.equal(
    detectSingleReportLink("1) https://x.uk/r/rpt_aaaabbbb 2) https://x.uk/r/rpt_ccccdddd"),
    null,
  );
  assert.equal(detectSingleReportLink("สวัสดีครับ ไม่มีลิงก์"), null);
});

test("buildReportLinkAutoFlex: ข้อความคงเดิม ลิงก์ดิบหาย มีปุ่ม + รูปเมื่อ https", () => {
  const msg = buildReportLinkAutoFlex({
    text: "ชิ้นเด่นด้านโชคลาภคือเนื้อผง 8.4\nhttps://test.my-ener.uk/r/rpt_YhUq\nเดือนนี้ดวงการเงินกำลังมา",
    reportUrl: "https://test.my-ener.uk/r/rpt_YhUq",
    img: "https://cdn.example.com/pic.jpg",
  });
  assert.equal(msg.type, "flex");
  const json = JSON.stringify(msg.contents);
  assert.ok(json.includes("ชิ้นเด่นด้านโชคลาภ"));
  assert.ok(json.includes("เดือนนี้ดวงการเงินกำลังมา"));
  assert.ok(!JSON.stringify(msg.contents.body).includes("https://test.my-ener.uk/r/"));
  assert.ok(json.includes("เปิดรายงานเต็ม"));
  assert.equal(msg.contents.hero.url, "https://cdn.example.com/pic.jpg");
  // ไม่มีรูป → ไม่มี hero แต่การ์ดยังสมบูรณ์
  const noImg = buildReportLinkAutoFlex({ text: "ดูได้ที่ https://x.uk/r/rpt_zz11yy22", reportUrl: "https://x.uk/r/rpt_zz11yy22", img: null });
  assert.equal(noImg.contents.hero, undefined);
});
