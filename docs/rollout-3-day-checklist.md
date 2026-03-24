# Ener Scan — แผน 3 วัน (Stability → Rollout → Wording)

ข้อจำกัด: ไม่เพิ่ม feature ใหญ่ · ไม่รื้อ scan logic · `ReportPayload` เป็น source of truth

---

## Day 1 — Stabilize + Test

### Automated
- [ ] `npm test` ผ่านทั้งหมด (รวม `dateTime.util`, `flex.summaryFirst`, `scanFlexReply.builder`)
- [ ] CI / pre-deploy รัน test script เดียวกับ local

### Manual QA (แนะนำ 8–10 เคส)
- [ ] สแกนปกติ + มีรายงาน HTML + มีรูป / ไม่มีรูป
- [ ] เปิดลิงก์รายงานจาก LINE (full report load)
- [ ] ประวัติ / stats ใน LINE — เวลาตรงกับ HTML hero date
- [ ] Admin dashboard — คอลัมน์วันที่ตรงกับ Bangkok เหมือน LINE/HTML
- [ ] Payload เก่า / partial JSON — รายงานยัง render ได้

### Logs ที่ควรเห็น
| Event / pattern | ความหมาย |
|-----------------|----------|
| `REPORT_RENDER_TIMEZONE_OK` | render HTML ใช้ `Asia/Bangkok` + `generatedAtBangkok` |
| `SCAN_RESULT_FLEX_ROLLOUT` (หรือ telemetry ที่ log หลัง reply scan) | `flexPresentationMode`, `reportLinkPlacement`, `hasObjectImage`, `schemaVersion` |
| `REPORT_PAGE_OPEN` | ตาม route/analytics ที่มีอยู่ |
| `FLEX_SUMMARY_FIRST_FAIL` + `fallback_legacy` | summary-first พัง → legacy flex (ไม่ควรบ่อย) |

### Time alignment
- [ ] เปรียบเทียบเวลาเดียวกัน (ISO เดียวกัน) บน LINE text / HTML hero / admin — วัน+เวลา Bangkok สอดคล้องกัน

---

## Day 2 — Soft Rollout + Telemetry

- [ ] ตั้ง `FLEX_SCAN_SUMMARY_FIRST=true` + `FLEX_SCAN_SUMMARY_FIRST_ROLLOUT_PCT=10`–`20` (ดู **`docs/day2-soft-rollout.md`**)
- [ ] ตรวจ log: `SCAN_RESULT_FLEX_ROLLOUT`, `REPORT_PAGE_OPEN`, `REPORT_RENDER_TIMEZONE_OK`, `FLEX_SUMMARY_FIRST_FAIL` + `schemaVersion` **4**
- [ ] สรุป metric: `flexScanSummaryFirstSelected`, report open rate, `hasObjectImage`, fallback count
- [ ] Rollback: `ROLLBACK_PCT=0` หรือ `FLEX_SCAN_SUMMARY_FIRST=false` — ไม่รื้อ scan logic

---

## Day 3 — Tune Meaning / Naming

- [ ] QA จริง 10–15 เคส
- [ ] ปรับ hero naming, summary distillation, headline/bullets (Flex), HTML opening line — อย่าแตะ scan pipeline
- [ ] Tune goal mapping ตาม energy type + score tier (copy layer / payload fields)
- [ ] ลดความ generic
- [ ] เก็บ before/after 5 เคสเป็น benchmark (ข้อความ + screenshot optional)

---

## ไฟล์ที่เกี่ยวกับ Day 1 tests (อ้างอิง)

- `tests/dateTime.util.test.js` — UTC ISO → Bangkok, invalid → `-`, date-only / time-only
- `tests/flex.summaryFirst.test.js` — 2 หน้า, ไม่มี `reportUrl` fallback
- `tests/scanFlexReply.builder.test.js` — fallback legacy เมื่อ summary-first throw
- `src/services/flex/scanFlexReply.builder.js` — logic เดียวกับ `replyScanResult` (refactor เพื่อทดสอบ)
