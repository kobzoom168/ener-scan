# Day 3 — Wording depth (4 surfaces only)

**Scope:** Copy / meaning only. **Do not** change rollout logic, feature flags, or scan pipeline.  
**Source of truth:** `ReportPayload` — Flex and HTML should **share one core meaning**, expressed at different depths.

---

## Design principles

| Surface | Role |
|---------|------|
| **Hero naming** | Identity label: class + feel + role — **no** exact model/temple unless data supports it |
| **Flex headline** | One sentence: **good for what** + **when most useful** — teaser only |
| **Bullets (×2)** | (1) what it gives · (2) when it shines — **no** copy-paste of headline |
| **HTML opening** | 1–2 lines under hero: **calmer, slightly deeper** than Flex — premium, not “raw AI” |

**Cross-surface:** Same dominant energy + same “job” for the user; Flex stays short; HTML carries the artifact.

---

## 1) Hero naming

**Pattern:** `[broad object class]` + `[dominant energy feel]` + `[life role]`  
**Avoid as default:** “วัตถุมงคลชิ้นนี้”, “พระเครื่ององค์นี้” (unless fallback tier).  
**Do not:** Invent temple, exact model, or lineage when confidence is low.

### Three variants (examples — swap slots from payload)

| Variant | Example (Thai) |
|---------|----------------|
| **A — protective / นิ่ง** | พระแนวคุ้มครองที่ให้ใจนิ่ง |
| **B — balance / รับแรง** | เหรียญสมดุลที่ช่วยรับแรงกระแทกของวัน |
| **C — draw / จังหวะ** | ชิ้นเสริมจังหวะดึงดูดเมื่อต้องเปิดทางใหม่ |

### Safe fallback (low confidence / sparse payload)

1. **Tier 1 — has `mainEnergyLabel` + `energyLevelLabel`:**  
   `ชิ้นในรายงานนี้ · {mainEnergyLabel}` (existing template pattern) **or**  
   `{กว้าง ๆ จาก objectType หรือ objectLabel ที่ไม่ generic} · {mainEnergyLabel}`

2. **Tier 2 — energy only:**  
   `ชิ้นที่เน้นพลัง{mainEnergyLabel}ในรายงานนี้`

3. **Tier 3 — minimal:**  
   `ชิ้นในรายงานนี้` + rely on summary card for detail (already in product)

**Stop rule:** If `objectLabel` is user-specific and non-generic, **prefer it** over synthetic hero text.

---

## 2) Flex headline (1 sentence)

**Must convey:** what it’s good for **+** when it’s most useful.  
**Avoid:** “ช่วยได้หลายด้าน”, long clauses, duplicate of bullets.

### Three variants

| Variant | Example (Thai) |
|---------|----------------|
| **A** | เด่นเรื่องคุ้มครองใจในช่วงที่แรงกดดันสูง |
| **B** | ทำหน้าที่พยุงจังหวะให้นิ่งเมื่อต้องตัดสินใจเรื่องสำคัญ |
| **C** | เปิดพื้นที่ให้โฟกัสกลับมาที่ตัวเองในวันที่วุ่นภายนอก |

### Safe fallback

- Use **`sections.messagePoints[0]`** trimmed to one sentence if present and non-generic.
- Else **distilled first clause** of `summary.summaryLine` (before `—`), max ~88 chars — already aligned with `distillSummaryLine` in code.
- Else neutral one-liner:  
  `สรุปใน LINE สั้นมาก — ฉบับเต็มเล่าจังหวะและบทบาทของชิ้นนี้`  
  (use sparingly; signals “read HTML”.)

---

## 3) Bullets (max 2)

**Bullet 1** = what it gives · **Bullet 2** = when it shines.  
**Do not** repeat the Flex headline verbatim; keep each line short.

### Three variant pairs

| Variant | Bullet 1 (gives) | Bullet 2 (shines) |
|---------|------------------|-------------------|
| **A** | เสริมความนิ่งเมื่อใจถูกรบกวน | เด่นในช่วงที่ต้องตัดสินใจภายใต้แรงกดดัน |
| **B** | ค้ำจุนความมั่นใจแบบไม่ฟูมฟาย | ชัดเมื่อต้องยืนหยัดท่ามกลางความคาดหวังของคนอื่น |
| **C** | พยุงสมาธิสั้น ๆ ให้กลับมาอยู่กับตัวเอง | โดดเด่นในวันที่ต้องเลือกมากกว่าหนึ่งทาง |

### Safe fallback

- **From payload:** `sections.whatItGives[0]`, `whatItGives[1]` — shorten if long.
- If only one line: duplicate **role** from `bestUseCases[0]` as bullet 2.
- If empty: omit second bullet in Flex builder or use **one** generic-but-honest pair:  
  - `เสริมแรงจากพลังที่สแกนได้` / `อ่านฉบับเต็มสำหรับจังหวะใช้จริง`  
  (second line points to HTML — acceptable as last resort.)

---

## 4) HTML opening line (1–2 lines)

**Role:** Emotional entry under hero — **deeper than Flex**, still **not** a second report.  
**Tone:** Premium, calm, specific; avoid listy AI tone.

### Three variants

| Variant | Example (Thai) |
|---------|----------------|
| **A** | ชิ้นนี้เด่นเรื่องการประคองใจให้กลับมามั่นคง ในวันที่ภายนอกดึงความรู้สึกออกจากแกนของตัวเอง |
| **B** | น้ำหนักของชิ้นอยู่ที่การกลับมาตั้งหลัก — เหมาะกับช่วงที่ต้องเลือกท่ามกลางเสียงรอบทิศ |
| **C** | แรงของชิ้นไม่ได้ช่วยให้ทุกอย่างง่ายขึ้นในทันที แต่ช่วยให้ยืนได้นานขึ้นเมื่อสถานการณ์กดจริง |

### Safe fallback

- Prefer **`sections.messagePoints[0]`** or first line of **`whatItGives[0]`** expanded slightly (still ≤2 lines).
- If thin: one calm sentence + optional second half-sentence from `guidanceTips[0]`.
- Never invent miracle outcomes; **underclaim** vs hallucination.

---

## Shared meaning from `ReportPayload` (mapping)

| Intent | Fields to align (priority) |
|--------|----------------------------|
| Dominant energy / band | `summary.mainEnergyLabel`, `summary.energyLevelLabel` |
| One-line thesis | `summary.summaryLine` (distill for Flex; slightly longer for HTML) |
| “What it gives” | `sections.whatItGives[]`, `sections.messagePoints[]` |
| “When it shines” | `sections.bestUseCases[]`, `sections.guidanceTips[]` |

**Rule:** Pick **one** dominant thread across all four surfaces; if fields conflict, prioritize **summary + whatItGives** and trim the rest.

---

## Before → after (rationale)

| Before (generic) | After (direction) |
|------------------|-------------------|
| “วัตถุมงคลชิ้นนี้” / “พระเครื่ององค์นี้” as default | Class + feel + role **or** real `objectLabel` when non-generic |
| “ช่วยได้หลายด้าน” | One clear **use** + one clear **timing** in Flex headline |
| Bullets repeat headline | Bullet 1 = benefit · Bullet 2 = moment; wording **varied** |
| HTML repeats Flex | HTML opening = **same meaning**, **warmer / one layer deeper** |

**Why this works:** Users get a **consistent story** in LINE and on the web; Flex stays a **teaser**; HTML remains the **artifact** without duplicate walls of text.

---

## Starter set (coherent example — from product brief)

Use as **Variant A** across all four surfaces when energy is protective / pressure-heavy:

- **Hero:** พระแนวคุ้มครองที่ให้ใจนิ่ง  
- **Flex headline:** เด่นเรื่องคุ้มครองใจในช่วงที่แรงกดดันสูง  
- **Bullets:** เสริมความนิ่งเมื่อใจถูกรบกวน · เด่นในช่วงที่ต้องตัดสินใจภายใต้แรงกดดัน  
- **HTML opening:** ชิ้นนี้เด่นเรื่องการประคองใจให้กลับมามั่นคง ในวันที่ภายนอกดึงความรู้สึกออกจากแกนของตัวเอง  

---

## Implementation note (when coding later)

Wire these patterns into existing builders **without** changing rollout: `mobileReport.template.js` (hero + opening), `flex.summaryFirst.js` (headline + bullets from payload). **This document** is the spec; code changes are a separate PR.

---

## Energy family × surface matrix (7 × 4)

**Purpose:** One coherent line of meaning per family across Flex + HTML. Use when `mainEnergyLabel` / scan output maps to a **family** (string match, tag, or classifier — implementation TBD).  
**Score tier (life meaning):** Same copy works across tiers; adjust **intensity** in implementation only: higher score → slightly firmer verbs / clearer “when”; lower score → softer “ช่วยพยุง / ค่อย ๆ” (do not duplicate full matrix per tier here).

**Rollout priority (starter):** `protect_anchor` → `open_path` → `kindness_metta` → `restore_strength` → then `rebalance`, `confidence_lead`, `action_push`.

**Confidence:** All examples avoid temple/model names. If payload is thin, apply **Safe fallback** sections above — never force a family-specific line.

| Family | Meaning (internal) |
|--------|---------------------|
| `protect_anchor` | คุ้มครองแกนใจ · ตั้งหลักท่ามกลางแรงกดดัน |
| `open_path` | เปิดทาง · โอกาส · ลดช่องว่างระหว่างตั้งใจกับลงมือ |
| `kindness_metta` | เมตตา · อ่อนโยน · ความสัมพันธ์และน้ำเสียงภายใน |
| `rebalance` | สมดุล · ปรับจังหวะ · ลดปีนป่วงของวัน |
| `restore_strength` | พักฟื้น · แรงกลับ · ความทรงตัวหลังอ่อนล้า |
| `confidence_lead` | ทรงตัวนำ · ชัดเจน · ยืนหยัดในที่เปิดเผย |
| `action_push` | ขยับ · ตัดสินใจ · จังหวะลงมือ |

---

### 1) `protect_anchor`

| Surface | Copy (Thai) |
|---------|----------------|
| **Hero naming** | พระแนวคุ้มครองที่ยึดใจให้ตั้งหลัก |
| **Flex headline** | เด่นเรื่องพยุงแกนใจให้นิ่งเมื่อแรงกดดันสูงและทางเลือกเยอะ |
| **Bullet 1** | เสริมความมั่นคงภายในท่ามกลางเสียงรบกวน |
| **Bullet 2** | ชัดในช่วงต้องตัดสินใจเรื่องสำคัญภายใต้เวลาจำกัด |
| **HTML opening** | ชิ้นนี้ทำหน้าที่ประคองให้ใจกลับมาอยู่กับแกนของตัวเอง ในวันที่ภายนอกดึงความรู้สึกไปจนหลุดโฟกัส — ไม่ใช่การปิดปัญหา แต่เป็นการยืนให้ตรงพอจะเลือกได้ |

---

### 2) `open_path`

| Surface | Copy (Thai) |
|---------|----------------|
| **Hero naming** | เหรียญเปิดทางที่คลายช่องว่างระหว่างตั้งใจกับลงมือ |
| **Flex headline** | ช่วยให้จังหวะ “เริ่ม” กลับมาชัดเมื่อติดอยู่กับทางแยกหรือความลังเล |
| **Bullet 1** | เสริมโมเมนตัมเล็ก ๆ ให้ก้าวแรกไม่ฝืน |
| **Bullet 2** | เด่นเมื่อต้องเปิดประตูใหม่หรือสร้างทางเลือกจริง |
| **HTML opening** | แรงของชิ้นอยู่ที่การคลายติดขัด — ให้ทางเดินที่เคยมองไม่เห็นกลายเป็นขั้นตอนที่ทำได้ทีละนิ่ง ไม่ใช่การรับประกันโชค แต่คือการจัดลำดับใจให้พร้อมขยับ |

---

### 3) `kindness_metta`

| Surface | Copy (Thai) |
|---------|----------------|
| **Hero naming** | พระเมตตาที่นุ่มน้ำเสียงภายในและความสัมพันธ์รอบตัว |
| **Flex headline** | เด่นเรื่องอ่อนโยนและให้อภัยจังหวะเมื่อใจแข็งเกินไปหรือคุยกับคนรอบข้างหนัก |
| **Bullet 1** | เสริมความอ่อนลงโดยไม่เสียแกน |
| **Bullet 2** | ชัดในวันที่ต้องคุยยากหรือตั้งขอบเขตอย่างสุภาพ |
| **HTML opening** | ชิ้นนี้หนุนให้ความเมตตาไปถึงตัวเองก่อน — แล้วจึงถึงคนอื่นอย่างนิ่ง ๆ ไม่ใช่การยอมทุกอย่าง แต่คือการพูดและฟังจากที่ไม่แตก |

---

### 4) `rebalance`

| Surface | Copy (Thai) |
|---------|----------------|
| **Hero naming** | เหรียญสมดุลที่ปรับจังหวะวันให้ไม่ปีนป่วงเกินไป |
| **Flex headline** | ช่วยคืนจังหวะกลางเมื่อหลายเรื่องแย่งความสนใจหรืออารมณ์สวิงแรง |
| **Bullet 1** | เสริมการกลับมาอยู่กับลมหายใจของงานจริง |
| **Bullet 2** | เด่นในช่วงเปลี่ยนบทบาทหรือสลับบทบาทบ่อย |
| **HTML opening** | น้ำหนักของชิ้นอยู่ที่การจัดลำดับใหม่ — ไม่ใช่ให้ทุกอย่างเท่ากัน แต่ให้สิ่งที่สำคัญได้ที่ยืน ในวันที่หัวปั่นแต่ต้องตัดสินใจ |

---

### 5) `restore_strength`

| Surface | Copy (Thai) |
|---------|----------------|
| **Hero naming** | พระพักฟื้นที่คืนความทรงตัวหลังใจและกายอ่อนล้า |
| **Flex headline** | เด่นเรื่องช่วยเก็บแรงและฟื้นฟูจังหวะเมื่อรู้สึกไหลหรือหมดไฟ |
| **Bullet 1** | พยุงให้พักเป็นระบบ ไม่ใช่แค่ฝืนทน |
| **Bullet 2** | ชัดหลังช่วงทำงานหนักหรือใช้หัวต่อเนื่อง |
| **HTML opening** | ชิ้นนี้ไม่ได้สัญญาว่าจะหายเหนื่อยในคืนเดียว แต่ช่วยให้รู้ว่าตรงไหนควรถอยเพื่อให้แรงกลับมาเป็นของตัวเองอีกครั้ง — แบบเงียบ ๆ แต่จับได้ |

---

### 6) `confidence_lead`

| Surface | Copy (Thai) |
|---------|----------------|
| **Hero naming** | เหรียญทรงตัวนำที่ให้น้ำหนักคำพูดและท่าทีชัดในที่เปิดเผย |
| **Flex headline** | เด่นเรื่องยืนหยัดและสื่อสารให้จบเมื่อต้องรับผิดชอบต่อหน้าคนอื่น |
| **Bullet 1** | เสริมความชัดของเสียงภายในก่อนพูดออกไป |
| **Bullet 2** | เด่นในประชุม การนำทีม หรือช่วงต้องตัดสินใจแบบเปิด |
| **HTML opening** | แรงของชิ้นอยู่ที่ความนิ่งของผู้นำที่ไม่ต้องเสียงดัง — ให้ที่ยืนเมื่อต้องพูดแทนคนอื่นหรือแทนตัวเองอย่างมีเกียรติ |

---

### 7) `action_push`

| Surface | Copy (Thai) |
|---------|----------------|
| **Hero naming** | พระขยับจังหวะที่ให้ลงมือได้จริงโดยไม่สะดุดกับความลังเล |
| **Flex headline** | เด่นเรื่องผลักให้เริ่มและปิดงานเมื่อรู้แล้วแต่ยังไม่กล้าขยับ |
| **Bullet 1** | เสริมจังหวะตัดสินใจสั้น ๆ ให้ลงมือได้ |
| **Bullet 2** | ชัดในช่วงเดดไลน์ใกล้หรือมีของค้างคา |
| **HTML opening** | ชิ้นนี้ไม่ได้เร่งให้เร็วผิดจังหวะ แต่ช่วยให้เห็นขั้นตอนถัดไปชัดพอจะขยับได้ — เหมาะกับวันที่รู้อยู่แล้วว่าต้องทำ แต่ใจยังหาจุดลงไม่เจอ |

---

### Matrix quick reference (one block per family)

| Family | Hero (short) | Flex (one sentence) |
|--------|----------------|----------------------|
| `protect_anchor` | พระแนวคุ้มครองที่ยึดใจให้ตั้งหลัก | เด่นเรื่องพยุงแกนใจให้นิ่งเมื่อแรงกดดันสูงและทางเลือกเยอะ |
| `open_path` | เหรียญเปิดทางที่คลายช่องว่างระหว่างตั้งใจกับลงมือ | ช่วยให้จังหวะ “เริ่ม” กลับมาชัดเมื่อติดอยู่กับทางแยกหรือความลังเล |
| `kindness_metta` | พระเมตตาที่นุ่มน้ำเสียงภายในและความสัมพันธ์รอบตัว | เด่นเรื่องอ่อนโยนและให้อภัยจังหวะเมื่อใจแข็งเกินไปหรือคุยกับคนรอบข้างหนัก |
| `rebalance` | เหรียญสมดุลที่ปรับจังหวะวันให้ไม่ปีนป่วงเกินไป | ช่วยคืนจังหวะกลางเมื่อหลายเรื่องแย่งความสนใจหรืออารมณ์สวิงแรง |
| `restore_strength` | พระพักฟื้นที่คืนความทรงตัวหลังใจและกายอ่อนล้า | เด่นเรื่องช่วยเก็บแรงและฟื้นฟูจังหวะเมื่อรู้สึกไหลหรือหมดไฟ |
| `confidence_lead` | เหรียญทรงตัวนำที่ให้น้ำหนักคำพูดและท่าทีชัดในที่เปิดเผย | เด่นเรื่องยืนหยัดและสื่อสารให้จบเมื่อต้องรับผิดชอบต่อหน้าคนอื่น |
| `action_push` | พระขยับจังหวะที่ให้ลงมือได้จริงโดยไม่สะดุดกับความลังเล | เด่นเรื่องผลักให้เริ่มและปิดงานเมื่อรู้แล้วแต่ยังไม่กล้าขยับ |

---

### Alignment with Ener direction (summary)

- **Goal mapping:** Family → life meaning (table **Meaning** column); **score tier** only modulates tone (stronger/softer), not a different story per tier in this doc.
- **Less-generic hero:** Class + feel + role per family; still subject to **Stop rule** (real `objectLabel` wins when specific).
- **Sharper distillation:** Flex headline = one job + one timing; bullets split **gives / shines**; HTML opening = same thread, **+1 layer** emotional specificity — per **Safe fallback** if payload disagrees or is thin.

---

## Clarity levels (L1 / L2 / L3) × energy family

**Clarity = how strongly the scan can state the story** (not a different meaning). Only **wording strength, certainty, and emotional weight** change across L1 → L3.

| Level | Label | Tone |
|-------|--------|------|
| **L1** | มีแนวโน้ม | นุ่ม มีข้อจำกัด ไม่ฟันธง — ใช้คำเช่น *น่าจะ*, *มีทิศทาง*, *ช่วยพยุง* |
| **L2** | ค่อนข้างชัด | กลาง — *ค่อนข้างชัด*, *โดดเด่นในด้าน*, *เชื่อมกับจังหวะ* |
| **L3** | เด่นชัด | ชัดที่สุดในกรอบนี้ — *เด่นชัด*, *เน้นที่*, *แรงของชิ้นอยู่ที่* — **ยังไม่** สัญญาปาฏิหาริย์หรือระบุรุ่นวัด |

**When to use which (suggested mapping — implementation TBD)**

| Situation | Clarity |
|-----------|---------|
| ขอบเขตสcore / คะแนนกลาง / โมเดลไม่มั่นใจ | **L1** |
| สัญญาณจาก payload + score พอสมควรสอดคล้อง | **L2** |
| สรุปสอดคล้องหลายชั้น / คะแนนสูง / ใช้หลัง QA ชุดนั้นผ่าน | **L3** |

**Bullets:** ใช้ **คู่ bullet จาก matrix 7×4 (family-level)** เดิมได้ทุกระดับ — ความหมายเดียวกัน หากอยากให้สอดคล้อง L1 มากขึ้น อาจเติมคำนำเช่น *น่าจะ* / *ช่วยพยุง* ที่ต้นบรรทัด (optional; ไม่บังคับ).

**Shared meaning:** ทุกระดับชี้ไปที่ **คอลัมน์ Meaning (internal)** เดิมของแต่ละ family — แตกต่างแค่ “แรงของคำพูด” เท่านั้น

**Fallback:** ถ้า payload บางหรือขัดแย้ง → กลับไปที่ **Safe fallback** ในหัวข้อ 1–4 ด้านบน ไม่บังคับใช้ L2/L3

---

### `protect_anchor`

| Level | Hero naming | Flex headline | HTML opening |
|-------|-------------|---------------|--------------|
| **L1** | พระแนวคุ้มครองที่มีแนวโน้มช่วยยึดใจให้ตั้งหลัก | มีทิศทางไปทางการพยุงแกนใจให้นิ่งขึ้นเมื่อแรงกดดันสูงและทางเลือกเยอะ | ชิ้นนี้ดูจะหนุนให้ใจกลับมาอยู่ใกล้แกนของตัวเองมากขึ้น ในวันที่ภายนอกดึงความรู้สึกแรง — ไม่ได้ปิดปัญหา แต่ช่วยให้ยืนได้พอจะเลือก |
| **L2** | พระแนวคุ้มครองที่ช่วยยึดใจให้ตั้งหลักได้ค่อนข้างชัด | ค่อนข้างชัดว่าเด่นเรื่องพยุงแกนใจให้นิ่งเมื่อแรงกดดันสูงและทางเลือกเยอะ | ชิ้นนี้เชื่อมกับการประคองใจให้กลับมามั่นคง ในวันที่ภายนอกดึงความรู้สึกออกจากแกน — เป็นการยืนให้ตรงพอจะเลือก ไม่ใช่บังคับให้ทุกอย่างหายในทันที |
| **L3** | พระแนวคุ้มครองที่ยึดใจให้ตั้งหลัก | เด่นชัดเรื่องพยุงแกนใจให้นิ่งเมื่อแรงกดดันสูงและทางเลือกเยอะ | ชิ้นนี้ทำหน้าที่ประคองให้ใจกลับมาอยู่กับแกนของตัวเอง ในวันที่ภายนอกดึงความรู้สึกไปจนหลุดโฟกัส — ไม่ใช่การปิดปัญหา แต่เป็นการยืนให้ตรงพอจะเลือกได้ |

---

### `open_path`

| Level | Hero naming | Flex headline | HTML opening |
|-------|-------------|---------------|--------------|
| **L1** | เหรียญที่มีแนวโน้มช่วยคลายช่องว่างระหว่างตั้งใจกับลงมือ | น่าจะช่วยให้จังหวะ “เริ่ม” กลับมาชัดขึ้นเมื่อติดทางแยกหรือลังเล | แรงของชิ้นดูจะอยู่ที่การคลายติดขัด — ให้เห็นขั้นตอนเล็ก ๆ ที่ทำได้ ไม่ใช่การรับประกันโชค แต่คือการจัดลำดับใจให้พร้อมขยับ |
| **L2** | เหรียญเปิดทางที่คลายช่องว่างระหว่างตั้งใจกับลงมือได้ค่อนข้างชัด | ช่วยให้จังหวะ “เริ่ม” กลับมาชัดเมื่อติดอยู่กับทางแยกหรือความลังเล | แรงของชิ้นอยู่ที่การคลายติดขัด — ให้ทางเดินที่เคยมองไม่เห็นกลายเป็นขั้นตอนที่ทำได้ทีละนิ่ง เป็นการจัดลำดับใจให้พร้อมขยับ ไม่ใช่คำมั่นเรื่องโชค |
| **L3** | เหรียญเปิดทางที่คลายช่องว่างระหว่างตั้งใจกับลงมือ | เด่นชัดว่าช่วยให้จังหวะ “เริ่ม” กลับมาชัดเมื่อติดอยู่กับทางแยกหรือความลังเล | แรงของชิ้นอยู่ที่การคลายติดขัด — ให้ทางเดินที่เคยมองไม่เห็นกลายเป็นขั้นตอนที่ทำได้ทีละนิ่ง ไม่ใช่การรับประกันโชค แต่คือการจัดลำดับใจให้พร้อมขยับ |

---

### `kindness_metta`

| Level | Hero naming | Flex headline | HTML opening |
|-------|-------------|---------------|--------------|
| **L1** | พระแนวเมตตาที่มีแนวโน้มนุ่มน้ำเสียงภายในและความสัมพันธ์ | มีแนวโน้มจะช่วยให้อ่อนโยนและให้อภัยจังหวะได้ง่ายขึ้น เมื่อใจแข็งหรือคุยกับคนรอบข้างหนัก | ชิ้นนี้ดูจะหนุนให้ความเมตตาไปถึงตัวเองก่อน — แล้วจึงถึงคนอื่นอย่างนิ่ง ๆ ไม่ใช่การยอมทุกอย่างในทันที |
| **L2** | พระเมตตาที่นุ่มน้ำเสียงภายในและความสัมพันธ์รอบตัวได้ค่อนข้างชัด | เด่นในด้านอ่อนโยนและให้อภัยจังหวะเมื่อใจแข็งเกินไปหรือคุยกับคนรอบข้างหนัก | ชิ้นนี้หนุนให้ความเมตตาไปถึงตัวเองก่อน — แล้วจึงถึงคนอื่นอย่างนิ่ง ๆ ไม่ใช่การยอมทุกอย่าง แต่คือการพูดและฟังจากที่ไม่แตก |
| **L3** | พระเมตตาที่นุ่มน้ำเสียงภายในและความสัมพันธ์รอบตัว | เด่นชัดเรื่องอ่อนโยนและให้อภัยจังหวะเมื่อใจแข็งเกินไปหรือคุยกับคนรอบข้างหนัก | ชิ้นนี้หนุนให้ความเมตตาไปถึงตัวเองก่อน — แล้วจึงถึงคนอื่นอย่างนิ่ง ๆ ไม่ใช่การยอมทุกอย่าง แต่คือการพูดและฟังจากที่ไม่แตก |

---

### `rebalance`

| Level | Hero naming | Flex headline | HTML opening |
|-------|-------------|---------------|--------------|
| **L1** | เหรียญสมดุลที่มีแนวโน้มช่วยให้จังหวะวันไม่ปีนป่วงเกินไป | มีแนวโน้มจะช่วยคืนจังหวะกลางเมื่อหลายเรื่องแย่งความสนใจหรืออารมณ์สวิง | น้ำหนักของชิ้นดูจะอยู่ที่การจัดลำดับใหม่ — ให้สิ่งสำคัญได้ที่ยืนในวันที่หัวปั่น โดยไม่สัญญาว่าทุกอย่างจะเท่ากันในทันที |
| **L2** | เหรียญสมดุลที่ปรับจังหวะวันให้ไม่ปีนป่วงเกินไปได้ค่อนข้างชัด | ช่วยคืนจังหวะกลางเมื่อหลายเรื่องแย่งความสนใจหรืออารมณ์สวิงแรง | น้ำหนักของชิ้นอยู่ที่การจัดลำดับใหม่ — ไม่ใช่ให้ทุกอย่างเท่ากัน แต่ให้สิ่งที่สำคัญได้ที่ยืน ในวันที่หัวปั่นแต่ต้องตัดสินใจ |
| **L3** | เหรียญสมดุลที่ปรับจังหวะวันให้ไม่ปีนป่วงเกินไป | เด่นชัดว่าช่วยคืนจังหวะกลางเมื่อหลายเรื่องแย่งความสนใจหรืออารมณ์สวิงแรง | น้ำหนักของชิ้นอยู่ที่การจัดลำดับใหม่ — ไม่ใช่ให้ทุกอย่างเท่ากัน แต่ให้สิ่งที่สำคัญได้ที่ยืน ในวันที่หัวปั่นแต่ต้องตัดสินใจ |

---

### `restore_strength`

| Level | Hero naming | Flex headline | HTML opening |
|-------|-------------|---------------|--------------|
| **L1** | พระแนวพักฟื้นที่มีแนวโน้มคืนความทรงตัวหลังอ่อนล้า | มีแนวโน้มจะช่วยเก็บแรงและฟื้นฟูจังหวะเมื่อรู้สึกไหลหรือหมดไฟ | ชิ้นนี้ไม่ได้สัญญาว่าจะหายเหนื่อยในคืนเดียว แต่ดูจะช่วยให้เห็นจุดที่ควรถอยเพื่อให้แรงกลับมาเป็นของตัวเองอีกครั้ง |
| **L2** | พระพักฟื้นที่คืนความทรงตัวหลังใจและกายอ่อนล้าได้ค่อนข้างชัด | เด่นในด้านช่วยเก็บแรงและฟื้นฟูจังหวะเมื่อรู้สึกไหลหรือหมดไฟ | ชิ้นนี้ไม่ได้สัญญาว่าจะหายเหนื่อยในคืนเดียว แต่ช่วยให้รู้ว่าตรงไหนควรถอยเพื่อให้แรงกลับมาเป็นของตัวเองอีกครั้ง — แบบเงียบ ๆ แต่จับได้ |
| **L3** | พระพักฟื้นที่คืนความทรงตัวหลังใจและกายอ่อนล้า | เด่นชัดเรื่องช่วยเก็บแรงและฟื้นฟูจังหวะเมื่อรู้สึกไหลหรือหมดไฟ | ชิ้นนี้ไม่ได้สัญญาว่าจะหายเหนื่อยในคืนเดียว แต่ช่วยให้รู้ว่าตรงไหนควรถอยเพื่อให้แรงกลับมาเป็นของตัวเองอีกครั้ง — แบบเงียบ ๆ แต่จับได้ |

---

### `confidence_lead`

| Level | Hero naming | Flex headline | HTML opening |
|-------|-------------|---------------|--------------|
| **L1** | เหรียญทรงตัวนำที่มีแนวโน้มให้น้ำหนักคำพูดและท่าทีชัดขึ้นในที่เปิดเผย | มีแนวโน้มจะช่วยให้ยืนหยัดและสื่อสารได้จบขึ้นเมื่อต้องรับผิดชอบต่อหน้าคนอื่น | แรงของชิ้นดูจะอยู่ที่ความนิ่งของผู้นำที่ไม่ต้องเสียงดัง — ให้ที่ยืนเมื่อต้องพูดแทนตัวเองหรือคนอื่นอย่างมีเกียรติ |
| **L2** | เหรียญทรงตัวนำที่ให้น้ำหนักคำพูดและท่าทีชัดในที่เปิดเผยได้ค่อนข้างชัด | เด่นในด้านยืนหยัดและสื่อสารให้จบเมื่อต้องรับผิดชอบต่อหน้าคนอื่น | แรงของชิ้นอยู่ที่ความนิ่งของผู้นำที่ไม่ต้องเสียงดัง — ให้ที่ยืนเมื่อต้องพูดแทนคนอื่นหรือแทนตัวเองอย่างมีเกียรติ |
| **L3** | เหรียญทรงตัวนำที่ให้น้ำหนักคำพูดและท่าทีชัดในที่เปิดเผย | เด่นชัดเรื่องยืนหยัดและสื่อสารให้จบเมื่อต้องรับผิดชอบต่อหน้าคนอื่น | แรงของชิ้นอยู่ที่ความนิ่งของผู้นำที่ไม่ต้องเสียงดัง — ให้ที่ยืนเมื่อต้องพูดแทนคนอื่นหรือแทนตัวเองอย่างมีเกียรติ |

---

### `action_push`

| Level | Hero naming | Flex headline | HTML opening |
|-------|-------------|---------------|--------------|
| **L1** | พระขยับจังหวะที่มีแนวโน้มให้ลงมือได้จริงมากขึ้นโดยไม่สะดุดกับความลังเล | มีแนวโน้มจะช่วยผลักให้เริ่มและปิดงานได้ดีขึ้นเมื่อรู้แล้วแต่ยังไม่กล้าขยับ | ชิ้นนี้ดูจะช่วยให้เห็นขั้นตอนถัดไปชัดขึ้น — ไม่ได้เร่งให้เร็วผิดจังหวะ แต่ให้จุดลงมือที่พอจับได้ |
| **L2** | พระขยับจังหวะที่ให้ลงมือได้จริงโดยไม่สะดุดกับความลังเลได้ค่อนข้างชัด | เด่นในด้านผลักให้เริ่มและปิดงานเมื่อรู้แล้วแต่ยังไม่กล้าขยับ | ชิ้นนี้ไม่ได้เร่งให้เร็วผิดจังหวะ แต่ช่วยให้เห็นขั้นตอนถัดไปชัดพอจะขยับได้ — เหมาะกับวันที่รู้อยู่แล้วว่าต้องทำ แต่ใจยังหาจุดลงไม่เจอ |
| **L3** | พระขยับจังหวะที่ให้ลงมือได้จริงโดยไม่สะดุดกับความลังเล | เด่นชัดเรื่องผลักให้เริ่มและปิดงานเมื่อรู้แล้วแต่ยังไม่กล้าขยับ | ชิ้นนี้ไม่ได้เร่งให้เร็วผิดจังหวะ แต่ช่วยให้เห็นขั้นตอนถัดไปชัดพอจะขยับได้ — เหมาะกับวันที่รู้อยู่แล้วว่าต้องทำ แต่ใจยังหาจุดลงไม่เจอ |

---

### Quick reference: L3 only (shortest labels for QA)

ใช้ตารางนี้เทียบกับ matrix 7×4 เดิม — แถว L3 สอดคล้องกับตัวอย่าง “เด่นชัด” ในบล็อก family เดิม

| Family | L3 Hero (first 6 words) | L3 Flex (first 6 words) |
|--------|-------------------------|-------------------------|
| `protect_anchor` | พระแนวคุ้มครองที่ยึดใจให้ตั้งหลัก | เด่นชัดเรื่องพยุงแกนใจให้นิ่งเมื่อ… |
| `open_path` | เหรียญเปิดทางที่คลายช่องว่าง… | เด่นชัดว่าช่วยให้จังหวะ “เริ่ม”… |
| `kindness_metta` | พระเมตตาที่นุ่มน้ำเสียง… | เด่นชัดเรื่องอ่อนโยนและให้อภัย… |
| `rebalance` | เหรียญสมดุลที่ปรับจังหวะวัน… | เด่นชัดว่าช่วยคืนจังหวะกลาง… |
| `restore_strength` | พระพักฟื้นที่คืนความทรงตัว… | เด่นชัดเรื่องช่วยเก็บแรงและฟื้นฟู… |
| `confidence_lead` | เหรียญทรงตัวนำที่ให้น้ำหนัก… | เด่นชัดเรื่องยืนหยัดและสื่อสารให้จบ… |
| `action_push` | พระขยับจังหวะที่ให้ลงมือได้จริง… | เด่นชัดเรื่องผลักให้เริ่มและปิดงาน… |
