# QA: Scan copy (`scanCopy.generator.js`)

Production path: **`src/services/flex/flex.service.js`** → `generateScanCopy` → `buildSummaryBubble({ scanCopy })`.

Legacy entry **`src/services/flex.service.js`** re-exports the same `buildScanFlex` — no duplicate copy path.

## 1. Main card (`summary.mainEnergyLine1` / `Line2`)

- [ ] อ่านแล้วรู้ความหมายครบ ไม่ตัดความรู้สึกแห้งเกินไป
- [ ] บรรทัด 2 อธิบายบริบทการใช้จริง (ไม่ใช่แค่หัวข้อสั้นๆ)
- [ ] **แถบใต้คะแนน** ใช้ `summary.mainEnergyLabel` (เดียวกับสรุปจาก `scanCopy`) — ไม่ใช่แค่ `getEnergyShortLabel` แบบเก่า

## 2. Trait boxes (`traits.feelShort`, `useCaseShort`, `effectShort`)

- [ ] เข้าใจทันที ไม่ใช่ศัพท์เทคนิค
- [ ] สามบรรทัดในแต่ละสแกน **ไม่ซ้ำโทนกันเกินไป** (feel = ความรู้สึก, use = เหมาะเมื่อไหร่, effect = ได้อะไร)
- [ ] สลับ **energy type** แล้วความหมาย **ต่างกันชัด** (ปกป้อง vs สมดุล vs ดึงดูด ฯลฯ)

## 3. Alt text (`buildScanFlexAltText`)

- [ ] ใช้ `summary.mainEnergyLabelAlt` ก่อน (สั้น พอดีแจ้งเตือน) แล้วจึง `mainEnergyLabel`
- [ ] ยังเห็นคะแนน `/10` ชัดใน prefix `ผลตรวจพลัง:`

## 4. Regression

- [ ] ไม่แตะ scoring / layout Flex JSON
- [ ] หลังแก้ template ให้รัน smoke บนเครื่องจริงอย่างน้อย 1 ครั้งต่อ release

## Quick script (local)

```bash
node --input-type=module -e "
import { generateScanCopy } from './src/services/flex/scanCopy.generator.js';
const types = ['พลังปกป้อง','พลังสมดุล','พลังอำนาจ','พลังเมตตา','พลังดึงดูด','พลังโชคลาภ','พลังทั่วไป'];
for (const m of types) {
  const c = generateScanCopy({ mainEnergy: m, scoreNumeric: 7.5, personality:'-', tone:'-', hidden:'-', display:{} });
  console.log(m, '=>', c.traits);
}
"
```
