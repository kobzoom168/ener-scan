# OpenRouter Cost Audit — 13 ส.ค. 2026

สถานะ: วิเคราะห์จาก CSV + โค้ดเท่านั้น ยังไม่แก้ runtime และไม่ deploy  
ข้อมูล: `/root/Downloads/openrouter_activity_2026-08-13.csv` ช่วง 10–13 ส.ค. 2026

## Baseline

- 5,479 generations · ค่าใช้จ่ายรวม **$12.5125** ในประมาณ 4 วัน
- เฉลี่ย **$3.13/วัน** · ถ้าปริมาณคงเดิมประมาณ **$94/30 วัน**
- prompt 12.16M tokens · completion 426.5k · cached 1.37M

| Model | Calls | Cost | สัดส่วน |
|---|---:|---:|---:|
| GPT-4.1 | 1,388 | $6.1750 | 49.4% |
| GPT-4.1-mini | 2,683 | $3.1888 | 25.5% |
| Claude Opus 4.8 | 159 | $2.9318 | 23.4% |
| Gemini/DeepSeek/embedding อื่น ๆ | 1,249 | $0.2169 | 1.7% |

ข้อสรุป: 98.3% ของค่าใช้จ่ายอยู่ที่ GPT-4.1 + GPT-4.1-mini + Opus; เปลี่ยน DeepSeek/Gemini ไม่ช่วยมาก

## Findings

### P0 — Opus consult prompt ใหญ่ผิดจาก comment

- `geminiConsultPrompt.js` ยาวจริงประมาณ **68,079 chars** ไม่ใช่ ~14k charsตาม comment
- Ener Scan Opus 12 calls มี prompt 28–30k tokens และใช้ $1.8587
- cache hit เพียง 2/12; cache miss ส่วนใหญ่ประมาณ $0.17–0.18/call ส่วน hitประมาณ $0.047
- prompt รวม knowledge ทุก category ทุก turn แม้ลูกค้าถามเรื่องเดียว ทั้งที่มี `kbContext` retrieval อยู่แล้ว

ข้อเสนอ:

1. แยก `PERSONA_CORE` สั้นและนิ่ง: role, safety, tone, money boundary, output contract
2. เอา `CONSULT_KNOWLEDGE` ทั้งก้อนออกจาก system; inject เฉพาะ category/KB ที่ retrieve ได้ใน user context
3. ย้าย edge-case copy จำนวนมากไป deterministic guard/tests ไม่ส่งให้ Opus ทุกครั้ง
4. ทำ prompt-size budget test เช่น system ≤18k chars และ total estimated tokens ≤8k สำหรับ consult ปกติ
5. log cache hit/miss + prompt chars ต่อ call; ห้ามอาศัย comment

ผลคาด: ลดค่า Opus customer consult ประมาณ $1.2–1.5 ต่อ 4 วัน โดยยังใช้ Opus เหมือนเดิม

### P0 — แยกต้นทุนตาม call site ก่อนเปลี่ยนโมเดล

CSV มี `app_name` ว่าง 4,733/5,479 calls และไม่มี user/call-site tag จึงยังแยก GPT cost ว่ามาจาก object gate, draft, rewrite, forensic, embedding descriptor หรือ verifier เท่าไรไม่ได้

ข้อเสนอ:

- ทุก AI wrapper ใส่ `callSite` เช่น `scan.object_check.strict`, `scan.object_check.permissive`, `scan.deep_draft`, `scan.deep_rewrite`, `scan.stable_feature`, `chat.consult`, `monitor.daily`
- log generation id, model, callSite, scanJobId แบบ hash/opaque, prompt/completion/cached tokens, latency, retry และ outcome
- ทำ daily Telegram cost report: cost/scan, cost/paid chat, calls/scan, cache-hit rate และ top call sites
- แยก OpenRouter API key หรืออย่างน้อย X-Title ระหว่าง Ener Scan กับ Ener-AI เพื่อ attribution ชัด

### P1 — GPT-4.1 ด่านภาพเป็นรูใหญ่สุด ต้อง shadow cascade

- GPT-4.1 ใช้ $6.175 หรือ 49.4% ของทั้งหมด
- `objectCheck.service.js` default เป็น GPT-4.1 เพราะ mini เคย false-reject crystal bracelet
- ห้ามเปลี่ยนกลับ mini ตรง ๆ เพราะจะคืนบั๊กเดิม

ข้อเสนอ shadow:

1. cheap/local first pass: existing vision signal หรือ mini/Gemini classifier แบบ structured
2. ให้ผ่านทันทีเฉพาะ confidence สูงและ label ไม่เสี่ยง
3. escalate GPT-4.1 เฉพาะ ambiguous, unsupported, unclear, multiple, bracelet/jewelry conflict หรือ confidence ต่ำ
4. เก็บ gold set รูปจริง + false reject/false accept เทียบ GPT-4.1 ก่อนเปิด
5. rollout 0% shadow → 10% → 50% → 100% พร้อม kill switch

เป้าหมาย: ลด GPT-4.1 calls 60–80% โดย false reject ไม่แย่กว่า baseline; potential saving ประมาณ $3–4 ต่อ 4 วัน

### P1 — ลดจำนวน mini calls ต่อ scan ด้วย contract เดียว

- GPT-4.1-mini 2,683 calls / GPT-4.1 1,388 calls ≈ 1.93 mini calls ต่อ GPT call
- โค้ดมีหลายจุด: deep draft, optional rewrite/scoring/improve, stable feature, object identity verifier, embedding descriptor, forensic ฯลฯ
- ต้องรู้ live flags/call-site ก่อนตัด

ข้อเสนอ:

- รวม fields ที่ deterministic ได้หรือ vision draft เห็นอยู่แล้วเข้า extractor contract เดียว
- rewrite เปิดเฉพาะ validation fail/quality ต่ำ ไม่ใช้ทุก scan
- embedding descriptor สร้างหลัง dedupe miss และเฉพาะ feature เปิดจริง
- stable feature / taxonomy / description ห้ามเรียกซ้ำกับข้อมูลที่ draft คืนแล้ว
- ตั้ง budget `maxAiCallsPerFreshScan` และ telemetry เมื่อเกิน

เป้าหมายแรก: ลด mini calls 25–40% โดย report quality/golden fixtures ไม่ถอย; potential saving $0.8–1.3 ต่อ 4 วัน

### P1 — Ener-AI brainstorm ใช้ Opus ซ้ำเกินจำเป็น

- โค้ด `ener-ai/app/agents/brainstorm.py` ใช้ Opus ทั้ง strategist และ final synth; council มี 2 rounds และ synth retryได้ 2 ครั้ง + fallback Opus
- CSV มี Opus 147 calls promptเล็ก app_name ว่าง cost $1.073; ต้องยืนยัน generation-id/log attribution แต่รูปแบบสอดคล้องกับ internal agent มากกว่า customer consult

ข้อเสนอ:

- ใช้ Opus เฉพาะ final synthesis หนึ่งครั้ง
- strategist ใช้ Sonnet/DeepSeek; synth JSON fail ให้ repair JSON deterministically หรือใช้ model ถูก ไม่ retry Opus
- ลด council 2 rounds → round 2 เฉพาะเมื่อ disagreement สูง
- ใช้ cache/topic dedupe ไม่ brainstorm หัวข้อเดิมซ้ำ

potential saving สูงสุดราว $0.7–1.0 ต่อ 4 วัน ถ้ายืนยันว่า 147 calls มาจาก Ener-AI จริง

## สิ่งที่ไม่ควรทำทันที

- ไม่เปลี่ยน object check GPT-4.1 → mini 100% โดยไม่มี shadow/gold set
- ไม่ลด deep-scan draft model ก่อนแยก costตาม call siteและวัด report quality
- ไม่เสียเวลาจูน DeepSeek/embedding ก่อน เพราะรวมกันไม่ถึง 1% ของ bill
- ไม่ปิด cache; ต้องลด promptและทำ cache hit ให้ดีขึ้นพร้อมกัน

## Rollout ที่แนะนำ

### Phase A — observability + prompt diet (เสี่ยงต่ำ)

- call-site cost telemetry + daily report
- slim Opus consult system prompt + prompt budget test
- ลด Opus ใน Ener-AI councilหลังยืนยัน attribution
- เป้าลด bill 25–35%

### Phase B — scan call consolidation (shadow)

- map calls/fresh scan จาก telemetry
- รวม extractor fields, conditional rewrite/descriptor/verifier
- เป้าลด mini 25–40%

### Phase C — object gate cascade (shadow + gold set)

- cheap-first/escalate GPT-4.1
- เกณฑ์เปิด: false reject/accept ไม่แย่ลง, latencyดีขึ้น, GPT-4.1 escalation ≤30–40%
- เป้ารวมลด bill 45–60%; aggressive caseอาจสูงกว่า แต่ห้ามเคาะก่อนข้อมูลจริง

## KPI หลังแก้

- USD/day และ USD/successful fresh scan
- calls per fresh scan แยก model/callSite
- Opus system chars, input tokens, cache hit rate
- object gate escalation rate + false reject/accept
- report validation fail/retry/rewrite rate
- consult guard retry/fallback rate และ customer complaint rate

