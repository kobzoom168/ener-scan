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

#### Correction หลังตรวจข้อเสนอ Claude

- **prompt cache ไม่ได้พัง:** ใน 12 Ener Scan consult calls มี cache hit 2 ครั้งที่เกิดภายในไม่กี่นาทีหลัง cache write; รูปแบบ `system` block + `cache_control: { type: "ephemeral" }` ใน `geminiFlash.api.js` ถูกต้อง
- default Anthropic/OpenRouter cache มีอายุประมาณ 5 นาที จึงเป็นเรื่องปกติที่บทสนทนาซึ่งห่างกันเป็นชั่วโมงจะ miss; ห้ามสรุปจาก `2/159` ว่าเป็น formatting bug
- 159 Opus calls ไม่ใช่ customer consult ทั้งหมด: 12 calls มี `app_name=Ener Scan` และ input 28–30k tokens; อีก 147 calls มี prompt ราว 713 tokensและ `app_name` ว่าง ต้อง attribution ก่อนแก้
- ไม่ควรเปิด cache TTL 1 ชั่วโมงทันที: cache write แพงขึ้นและ traffic ที่กระจายห่างอาจไม่คุ้ม ให้ลด static prompt 68k chars ก่อน แล้วคำนวณ break-even จาก turn spacing จริง

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

#### ทดลอง `detail: "low"` ก่อนสร้าง cascade

- request ปัจจุบันส่ง `input_image.image_url` โดยไม่ระบุ `detail` และส่ง base64 จากรูปต้นฉบับตรง ๆ
- ห้ามเปิด low 100% ทันที เพราะ gate ไม่ใช่ binary อย่างเดียว: แยก `single_supported`, `multiple`, `unclear`, `unsupported` และมี permissive second pass; ภาพยันต์ ตัวหนังสือเล็ก ขอบเขตหลายชิ้น และกำไล/คริสตัลอาจเสียสัญญาณที่ 512px
- ทำ shadow A/B ด้วยรูปเดียวกัน: baseline ปัจจุบันเทียบ low แล้ววัด label agreement โดยเฉพาะ false reject; ช่วงแรก low ห้ามเป็นผู้ hard-reject เพียงลำพัง
- ถ้า low ตอบ uncertain/reject หรืออยู่กลุ่มเสี่ยง ให้ escalate request ปัจจุบัน; ทดสอบก่อนว่า OpenRouter Responses bridge ส่งและคิด token ตาม `detail` จริง
- 1,388 GPT-4.1 calls ยังห้ามเท่ากับ 1,388 scans เพราะ `checkSingleObjectGated` มี strict first pass และ permissive second pass รวมถึง crystal/bracelet checks; ต้อง tag pass/call site ก่อนคำนวณบาทต่อ scan

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

หมายเหตุ `stableFeatureExtract`: ไม่ควรใช้ low ทั้ง contract โดยตรง แม้ prompt ระบุให้ดู overall composition เพราะผลมี motif/material/inscription/texture ที่พึ่งรายละเอียดเล็ก ควรแยก field ราคาถูก เช่น dominant color/outline ไป low และคง auto/high สำหรับ motif/อักขระ/ผิววัสดุ หรือทำ A/B golden fixtures ก่อน

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
- ไม่อ้างต้นทุน 4–6 บาท/scan หรือเป้าลด 60–70% จนกว่าจะมี successful-scan denominator และ call-site attribution; จากข้อมูลปัจจุบัน 45–60% เป็นเป้ารวมที่สมเหตุผลกว่า ส่วน 60–70% เป็น stretch goal
- ไม่จูน embeddings: 515 calls รวมประมาณ $0.000009 แทบไม่มีผลต่อบิล

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

## Snapshot เพิ่มเติม — CSV 14 ส.ค. 2026

ไฟล์: `/root/Downloads/openrouter_activity_2026-08-14.csv` (ช่วงในไฟล์ 12–14 ส.ค.; วันที่ 14 เป็น partial ถึงประมาณ 08:10 น. ไทยตามภาพหน้าเว็บ)

- 1,970 calls · รวม **$4.073127** · prompt 4.554M · completion 152.5k · cached 693.9k
- 12 ส.ค. $2.1734 / 831 calls
- 13 ส.ค. $1.5373 / 908 calls
- 14 ส.ค. partial $0.3625 / 231 calls — ห้าม extrapolate เป็นเต็มวันโดยตรง

| Model | Calls | Cost | Share |
|---|---:|---:|---:|
| GPT-4.1 | 488 | $2.0751 | 51.0% |
| GPT-4.1-mini | 964 | $1.1196 | 27.5% |
| Opus 4.8 | 31 | $0.7462 | 18.3% |
| อื่น ๆ | 487 | $0.1322 | 3.2% |

Opus ยังเห็นรูปแบบเดิม: 3 Ener Scan calls ขนาดใหญ่ ≥10k prompt tokens ใช้ $0.5420; 28 calls ขนาดเล็ก <2k tokensและ app ว่างใช้ $0.2042

ข้อจำกัด attribution ของ snapshot นี้:

- `user` ว่างทั้ง 1,970 rows จึงยังไม่มี call-site tag ใน export ชุดนี้
- `app_name` ว่าง 1,660 rows ($3.3990), Ener Scan 305 rows ($0.6203), Hermes Agent 5 rows ($0.0538)
- ข้อมูลส่วนใหญ่เกิดก่อน/คาบเกี่ยว instrumentation rollout จึงใช้เป็น **pre-attribution baseline** เท่านั้น ยังใช้ตัดสินผล optimization ไม่ได้
- หน้า OpenRouter ยังแสดง GPT rows เป็น App `Unknown` สอดคล้องกับ CSV; ต้องรอ export หลัง client/header rollout จริงก่อนสรุปว่า X-Title/user attribution ทำงานบน production/staging path ใด

## Telemetry rollout — 14 ส.ค. 2026

- `23bdf2e` รายงานว่า deploy telemetry-only ขึ้น production แล้ว; web และ 3 containers healthy
- production ไม่มี `OBJECT_CHECK_LOW_SHADOW_ENABLED` จึงไม่มี low-detail shadow cost/behavior บนลูกค้าจริง
- smoke application log: `callSite=smoke.telemetryCheck`, prompt 6 tokens, completion 1 token
- ยังต้องยืนยัน smoke/real row ฝั่ง OpenRouter ว่าคอลัมน์ `user` มี callSite จริงก่อนถือว่า attribution window เริ่มครบวงจร
- รอบวิเคราะห์ถัดไปต้องใช้ CSV หลัง rollout 2–3 วัน และแยก smoke calls ออกจาก cost/customer metrics

## Review telemetry 3 วันบน Pro — 17 ส.ค. 2026

ข้อมูลที่ Claude สรุปจาก call-site attribution: objectSameIdentityVerifier 29%, stableFeatureExtract 14%, voiceScript 8%, objectCheck.strict 8%, consult 7%, deepScan รวม 13%; verifier 1,353 candidate calls และ `same=true` 21 calls (1.6%)

### ข้อสรุป Codex

1. **ยังไม่อนุมัติ verifier `MAX_CANDIDATES 5→2` พร้อมยก similarity threshold แบบ blind**
   - 1.6% เป็นอัตราต่อ candidate call ไม่ใช่ recall หรือ hit ต่อ scan
   - ต้องแจกแจง 21 true hits ตาม `candidate rank`, `recallSource`, similarity และ confidence ก่อน ตั้ง threshold จาก distribution ของตัวที่ถูก ไม่ใช่จากช่วง similarity ของตัวที่แพ้
   - โค้ด `mergeVerifierCandidates()` เติม embedding ก่อน recent และใช้ cap เดียวกัน หาก embedding เต็ม cap จะไม่มี recency safety-net; ลด cap เป็น 2 จึงเสี่ยงตัด true object ที่ rank 3–5 และ recency
   - ทางที่ปลอดภัยกว่าคือแยก quota เช่น embedding top 1–2 + recent reserve 1, short-circuit เมื่อผ่าน และทำ shadow replay จาก candidate logs ก่อน rollout
   - เพดานประหยัดจากลดจำนวน calls 5→2 แบบเชิงเส้นคือไม่เกิน 60% ของก้อน 29% หรือ ~17.4% ของบิล ก่อนคิด early exit/overlap จึงยังไม่ควรสัญญา -20% จากข้อนี้

2. **Consult cheap model ทุก tier ทำได้ตาม product decision แต่ไม่ใช่ env-only**
   - ปัจจุบัน paid branch ยังเลือก `LLM_CONSULT_MODEL`, maxTokens 1536, ไม่ disable reasoning และไม่ได้เติม short-answer directive
   - ต้องแก้ code ให้ model/512/disableReasoning/short directive ใช้ร่วมทุก tier หรือยุบ tier branchจริง
   - คง exception เมื่อลูกค้าขอรายละเอียดหรือถามหลายข้อ และ monitor truncation, guard retry/fallback, complaint; 512 เป็นเพดานทดลองที่เหมาะกับคำตอบ 1–2 ประโยค

3. **VoiceScript: ทำ paired blind ear-test ก่อนสลับ**
   - ใช้รูป/รายงานเดียวกันอย่างน้อย 20–30 เคสหลากชนิด, สุ่มลำดับ A/B และวัดความถูกต้องต่อรายงาน, ความเป็นอาจารย์, การออกเสียง, ความยาว ไม่ตัดสินจาก 2–3 ตัวอย่าง

4. **ObjectCheck low shadow บน Pro 10% อนุมัติแบบ observability-only**
   - main decision เดิม 100%, concurrency cap 2, timeout, no retry และ kill switch เดิม
   - เก็บตามจำนวนตัวอย่าง ไม่ใช่แค่จำนวนวัน: อย่างน้อย 200 sampled calls และจำนวนขั้นต่ำต่อ pass; agreement เป็นเพียงเทียบ full model ต้อง human-label mismatches/กลุ่ม reject ก่อนสลับจริง
   - จำกัด daily extra cost/latency และเฝ้า `busy/error/timeout`; timeout ปล่อย upstream promise ทำงานต่อได้จึงต้องดูจำนวน in-flight ฝั่ง provider ด้วย

5. **stableFeatureExtract/deepScan.draft→mini ยังเป็น shadow/golden only** เพราะกระทบคะแนนและรายงานลูกค้าโดยตรง

6. **Cache consult 5 นาทีปิดประเด็นได้** จาก median spacing 1,484 วินาที โดยเฉพาะเมื่อย้ายออกจาก Opus; ไม่ต้องลงทุน refactor ตอนนี้

### ลำดับที่แนะนำ

1. ทำ consult cheap+short ทุก tier พร้อม telemetry/truncation guard
2. เปิด objectCheck low shadow Pro 10% แบบมี budget/kill switch
3. เพิ่ม verifier telemetry `candidateRank` และทำ rank/source/similarity table; จากนั้นทดลอง quota แยก embedding/recent ไม่ใช้ cap=2 ตรง ๆ
4. ทำ voice paired blind test
5. ทดลอง stable/deep draft บน staging/golden

เป้า -35% ยังเป็นเป้าทดลอง ไม่ใช่คำรับรอง จนกว่าจะวัด USD ต่อ successful scan หลัง rollout แต่ละข้อแยกกัน
