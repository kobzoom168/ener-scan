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
