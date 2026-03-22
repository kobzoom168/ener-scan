# QA: Scan copy (`scanCopy.generator.js`)

**Voice:** All template copy must follow **`docs/ENER_SYSTEM_TONE_GUIDE.md`** (one system voice).  
**Edit copy in:** `src/services/flex/scanCopy.config.js` (not in the generator).

**Config version:** `SCAN_COPY_CONFIG_VERSION` in `scanCopy.config.js` — bump when copy changes materially (QA logs, rollout notes; separate from `SCAN_CACHE_PROMPT_VERSION`).

Production path: **`src/services/flex/flex.service.js`** → `generateScanCopy` → `buildSummaryBubble({ scanCopy })`.  
Logs: **`[FLEX_PARSE]`** includes `scanCopyConfigVersion`, `scanCopySummary`, `scanCopyTraits`.

Legacy entry **`src/services/flex.service.js`** re-exports the same `buildScanFlex` — no duplicate copy path.

---

## Real-device QA matrix (energy × tier)

**Tiers:** high ≥ 7.5 · medium ≥ 5 · low &lt; 5 (same as `resolveScoreTier`).

| Energy (พลังหลัก) | high | medium | low |
|-------------------|------|--------|-----|
| ปกป้อง | 1 case | 1 case | 1 case |
| สมดุล | 1 | 1 | 1 |
| อำนาจ | 1 | 1 | 1 |
| เมตตา | 1 | 1 | 1 |
| ดึงดูด | 1 | 1 | 1 |
| โชคลาภ | 1 | 1 | 1 |
| เสริมพลัง | 1 | 1 | 1 |

On device: each cell = one scan → check summary bubble + 3 trait rows + alt notification; no truncation, readable.

**Optional:** vary `personality` / `tone` / `hidden` in parser output to confirm `pickFeel` / `pickUseCase` / `pickEffect` overrides still feel distinct.

### Focus for each cell (7×3)

1. **Summary** — `mainEnergyLine1` + `mainEnergyLine2` read as **one thought** (not two unrelated tags).
2. **Traits** — **feel** vs **useCase** vs **effect** stay **role-distinct** (not three paraphrases of the same idea).
3. **Across energies** — copy does not feel **generically repeated** between types (each energy should sound like its own voice).
4. **Logs** — every run’s server log line **`[FLEX_PARSE]`** includes **`scanCopyConfigVersion`** (must match `SCAN_COPY_CONFIG_VERSION` in `scanCopy.config.js` for that deploy).

**Release rule:** If **wording** in `scanCopy.config.js` ships, bump **`SCAN_COPY_CONFIG_VERSION`** only (no extra architecture). Prompt/cache versioning stays separate (`SCAN_CACHE_PROMPT_VERSION`).

---

## 1. Main card (`summary`)

| Field | Role |
|-------|------|
| `mainEnergyLabel` | Short headline under score (one idea) |
| `mainEnergyLine1` + `mainEnergyLine2` | One **story** (context + consequence), not two slogans |

- [ ] อ่านแล้วรู้ความหมายครบ ไม่ตัดความรู้สึกแห้งเกินไป
- [ ] บรรทัด 2 อธิบายบริบทการใช้จริง (ไม่ใช่แค่หัวข้อสั้นๆ)
- [ ] **แถบใต้คะแนน** ใช้ `summary.mainEnergyLabel` (เดียวกับสรุปจาก `scanCopy`) — ไม่ใช่แค่ `getEnergyShortLabel` แบบเก่า

---

## 2. Trait boxes — **must not collapse to one meaning**

| Field | Intended role | Starts with (typical) |
|-------|----------------|------------------------|
| `feelShort` | ความรู้สึก / ในใจ ตอนนี้ | ช่วยให้… |
| `useCaseShort` | เหมาะเมื่อไหร่ / สถานการณ์ | เหมาะกับ… |
| `effectShort` | ผลหลังใช้ / ได้อะไร | ทำให้… |

- [ ] สามบรรทัด **ไม่พูดเรื่องเดียวกันสามแบบ** (ไม่ใช่ paraphrase ซ้ำ)
- [ ] สลับ **energy type** แล้วความหมาย **ต่างกันชัด** (ปกป้อง vs สมดุล vs ดึงดูด ฯลฯ)
- [ ] เทียบกับ **summary 2 บรรทัด** — ไม่ซ้ำประโยคเดิมใน trait (คนละบทบาท)

---

## 3. Alt text (`buildScanFlexAltText`)

- [ ] ใช้ `summary.mainEnergyLabelAlt` ก่อน (สั้น พอดีแจ้งเตือน) แล้วจึง `mainEnergyLabel`
- [ ] ยังเห็นคะแนน `/10` ชัดใน prefix `ผลตรวจพลัง:`

---

## 4. Regression

- [ ] ไม่แตะ scoring / layout Flex JSON
- [ ] หลังแก้ `scanCopy.config.js` → bump **`SCAN_COPY_CONFIG_VERSION`** และรัน smoke บนเครื่องจริงอย่างน้อย 1 ครั้งต่อ release

---

## Quick script (local)

```bash
node --input-type=module -e "
import { generateScanCopy, SCAN_COPY_CONFIG_VERSION } from './src/services/flex/scanCopy.generator.js';
console.log('SCAN_COPY_CONFIG_VERSION', SCAN_COPY_CONFIG_VERSION);
const types = ['พลังปกป้อง','พลังสมดุล','พลังอำนาจ','พลังเมตตา','พลังดึงดูด','พลังโชคลาภ','พลังทั่วไป'];
for (const m of types) {
  const c = generateScanCopy({ mainEnergy: m, scoreNumeric: 7.5, personality:'-', tone:'-', hidden:'-', display:{} });
  console.log(m, '=>', c.summary, c.traits);
}
"
```
