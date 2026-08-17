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

## CSV ล่าสุด — `openrouter_activity_2026-08-17.csv`

ไฟล์ `/root/Downloads/openrouter_activity_2026-08-17.csv` มี 6,979 rows ช่วง UTC 11–17 ส.ค. 2026 ไม่ใช่เฉพาะ 3 วัน: cost รวม $14.354819, prompt 16.160M, completion 546k, cached 2.354M

ก่อน attribution (11–13 ส.ค.) `user` ว่างทั้งหมด จึงห้ามนำทั้งไฟล์มาคิด call-site share ตรง ๆ หลัง 14 ส.ค. มี tagged 3,117 calls (ตัด smoke) cost $6.676904 และ blank อีก $0.536379; blank หลังวัน rollout ส่วนใหญ่อยู่วันที่ 14 ส่วนวันที่ 15–16 เหลือราว 3% ของ daily cost

| Tagged call site ตั้งแต่ 14 ส.ค. | Calls | Cost | Share ของ tagged cost |
|---|---:|---:|---:|
| objectCheck.strict | 351 | $1.265446 | 18.95% |
| deepScan.draft | 141 | $1.112534 | 16.66% |
| objectSameIdentityVerifier | 787 | $0.984909 | 14.75% |
| imageForensic.screen_check | 166 | $0.749056 | 11.22% |
| consult | 68 | $0.688410 | 10.31% |
| stableFeatureExtract | 293 | $0.463918 | 6.95% |
| objectCheck.crystal_family | 144 | $0.435144 | 6.52% |
| voiceScript | 38 | $0.277990 | 4.16% |
| objectEmbedding.descriptor | 318 | $0.270991 | 4.06% |
| deepScan | 281 | $0.222988 | 3.34% |

ข้อแก้ไขจากสรุปก่อนหน้า:

- CSV นี้ไม่รองรับคำกล่าวว่า verifier = 29% / 1,353 calls; ในไฟล์พบ 787 calls / 14.75% ของ tagged cost ต้องระบุ query window/denominator และ reconcile กับ application logs ก่อนใช้ตัวเลข 29%
- หากลด verifier calls 5→2 แบบเชิงเส้น เพดานประหยัดจาก CSV นี้คือ ~8.85% ของ tagged bill (60% × 14.75%) ไม่ใช่ ~20%; actual ต่ำ/สูงกว่านี้ขึ้นกับ calls ต่อ scan และ early exit
- consult 68 calls: DeepSeek 64 calls cost $0.085651; Opus เพียง 4 calls cost $0.602759 หรือ 87.6% ของ consult cost ดังนั้นย้าย paid consult ออกจาก Opus ลดก้อนนี้ได้ชัด แต่ historical saving ในหน้าต่างนี้ประมาณ $0.60 ไม่ใช่ 7% ของ bill ทุกวัน
- voiceScript 38 Opus calls cost $0.277990 หรือ 4.16% ของ tagged cost ไม่ใช่ 8% ใน window นี้; ยังควร ear-test ก่อนสลับ
- `stableFeatureExtract` 293 calls / $0.463918 และ `deepScan.draft` 141 calls / $1.112534; draft มีผลตอบแทนสูงกว่า stable แต่เสี่ยงคุณภาพสูง จึงต้อง golden/shadow ทั้งคู่

ก่อน Claude เปลี่ยน env ให้สร้างรายงาน reproducible จาก CSV/log โดยล็อก: timezone, from/to, tagged-only หรือ all-cost, smoke exclusion, denominator และ mapping callSite→successful scan เพื่อป้องกันเปอร์เซ็นต์คนละฐาน

## Final prioritization จากช่วง tag ครบ 15–16 ส.ค. 2026

ตรวจจาก CSV โดยรวม all cost วันที่ UTC 15–16: $3.992774 หรือ $1.996/วัน ตัวเลขกลุ่มของ Claude ตรงกับไฟล์: objectCheck 29.81%, deepScan draft+deepScan 21.36%, verifier+descriptor 19.98%, forensic screen 12.22%, stable 7.34%, voice 4.78%, consult 1.08%

คำแก้ไข: CSV ยังมี blank user 221 rows / $0.072552 หรือ 1.82% ของ cost ไม่ใช่ 0% แม้ coverage ฝั่ง paid calls ดีมากแล้ว ต้องแยก zero-cost embeddings กับ nonzero untagged และตามปิด attribution ที่เหลือ

### อนุมัติให้เริ่มทันที

- เปิด objectCheck `detail:low` **shadow-only** บน Pro 10% ภายใต้ cap/timeout/no-retry/kill switch เดิม; ห้ามให้ low ตัดสินลูกค้า
- เพิ่ม verifier `candidateRank`, source, accepted rank และ counterfactual fields ว่า policy `top2`/threshold ที่เสนอจะพลาด accepted candidate หรือไม่; ยังไม่เปลี่ยน MAX/threshold
- สร้าง paired A/B harness สำหรับ deepScan draft, forensic และ voice โดยไม่สลับ production decision
- ย้าย paid consult ไป cheap modelตาม product decisionได้ แต่แยก rollout จาก prompt slimming เพื่อระบุสาเหตุหากคุณภาพเปลี่ยน

### ยังไม่อนุมัติให้สลับตรง

- verifier 5→2 + threshold พร้อมกัน: เปลี่ยนสองตัวแปรและยังไม่มี accepted-rank/similarity distribution; ต้องทดสอบทีละตัว และสงวน recent candidate quota
- forensic GPT-4.1→mini: ไม่ใช่งานเสี่ยงต่ำ เพราะ `suspect` เรียก `failJob`, ส่ง retry และหยุดสแกนลูกค้าจริง ต้อง shadow structured output แล้ววัด false suspect โดยเฉพาะรูปจริง/ภาพสะท้อน/กรอบพลาสติก
- deepScan draft→mini: ต้องวัด schema-valid rate, retry/failure, score/top-axis stability, factual consistency, hallucination และ blind wording preference บนรูปเดียวกัน
- consult prompt 27k→12k พร้อม model switch: ห้ามรวม rollout; prompt guard/persona/facts อาจหาย ขณะที่ consult มีเพียง 1.08% ของบิล จึงไม่มีเหตุเร่ง

### เกณฑ์ทดลองแนะนำ

- objectCheck low: ≥200 strict samples, auxiliary passes อย่างน้อย 30–50 ต่อ pass; human-review mismatch และทุกกรณีที่ low reject แต่ full pass
- deepScan mini: อย่างน้อย 50 รูปหลายประเภท; schema/required fields 100%, no new critical hallucination, score/top-axis drift อยู่ในเกณฑ์ที่เจ้าของกำหนด และ blind preference ไม่ด้อยอย่างมีนัยสำคัญ
- forensic mini: อย่างน้อย 100 รูป โดย oversample รูปจอจริง, รูปของจริงมีเงาสะท้อน/กรอบ, collage และ AI image; production decision ยังใช้ GPT-4.1 จน false-suspect ผ่าน human labels
- voice: paired blind 20–30 ชิ้น; facts/score/top power ต้องตรง 100% ก่อนดู preference
- verifier: เก็บ accepted rank/source/sim อย่างน้อย 7 วัน; rollout cap กับ threshold คนละขั้น พร้อม counterfactual miss = 0 ใน observed accepted hits และ recent reserve อย่างน้อย 1

internal chatQuality/captions รวมเพียง 0.48% ในช่วงนี้ ไม่ใช่ 3% และไม่ใช่ความเสี่ยงศูนย์; เป็นงานท้ายคิวหลังตรวจว่าแต่ละ call site ใช้โมเดลถูกอยู่แล้ว

## Pre-Pro review — commit `2e2fb33` + incident bundle `16306f3` (18 ส.ค.)

สถานะ: **ยังไม่อนุมัติ deploy รวม** จนปิด blockers ต่อไปนี้

1. `OBJECT_CHECK_LOW_SHADOW_DAILY_MAX` ยังไม่ใช่ hard ceiling: Redis timeout 400ms/error แล้วโค้ด fail-open ให้ยิง shadow ต่อ งานนี้ optional จึงต้อง fail-closed (`counter_unavailable` → skip shadow) เพื่อคุมเงินจริงและไม่กระทบ main decision
2. `dailyMax` ต้อง parse/clamp ชัดเจน; counter นับ sampled attempts ก่อน create เป็น conservative budgetได้ แต่ชื่อควรสื่อว่า call ceiling ไม่ใช่ dollar ceiling และใช้ UTC day
3. verifier telemetry rank/source/raw similarity ใช้ได้ แต่ `wouldMissAtThreshold070` ไม่ตรง threshold ที่กำลังพิจารณาจากช่วง 0.78–0.81; raw similarity เพียงพอสำหรับ offline thresholds หรือ log หลาย proposed thresholds โดยยังไม่แตะ policy
4. paid consult deploy รอบนี้เป็น model-only จริง: env เปลี่ยน model แต่ paid branch ยัง 1536 tokens, reasoning เปิด และไม่มี short directive — ต้องรายงานตามจริง ไม่อ้างว่าปิด cost policy ครบ

Blockers ใน incident bundle ที่รวม deploy:

5. เปิด constraint/delivery ของ `scan_failure_notify` จะทำให้ generic failure ถูก enqueue จาก `failJob()` พร้อมข้อความเฉพาะทางในหลายเหตุผล เพราะ skip-list ยังขาด `auth_challenge_no_thumb`, `auth_challenge_failed`, `image_authenticity_suspect`, `auth_challenge_issued`, `ritual_object_not_readable`; ควรใช้ allowlist เฉพาะ unexpected/infrastructure failures แทน skip-list เพื่อกันเหตุผลใหม่ส่งซ้ำโดย default
6. result-status handler ถือทุกสถานะนอก queued/processing/failed/delivery_queued เป็นผลออกแล้ว ทำให้ `cancelled` ถูกตอบผิด ต้อง exhaustive switch และ unknown/cancelled ห้าม claim success
7. ลิงก์รายงานใช้ latest `scan_results_v2` ของ user ไม่ได้ bind กับ job ล่าสุด อาจส่งรายงานเก่าเมื่อ job ล่าสุดไม่มีผล ต้อง select job id/result_id และ query result ด้วย `scan_job_id`/`result_id` เดียวกัน
8. copy queued/processing ว่า “ใกล้เสร็จ” และ delivery queued “ไม่เกิน 1 นาที” เป็น time promise ที่ระบบรับรองไม่ได้ ควรบอกสถานะตรง ๆ โดยไม่กำหนดเวลา

หลังแก้ต้องมี tests: shadow counter timeout/error = no create; generic failureไม่ซ้ำทุก tailored reason; cancelled/unknown status; latest failed/cancelled job + old report ห้ามคืน old link; delivered job คืนเฉพาะ token ของ job นั้น

Targeted verification ของ Codex: 33 tests ใน `objectCheckLowShadow`, `scanJobFailureNotify`, `exactUtilityCommand`, `personaRole` ได้ 32 pass / 1 fail — `scanJobFailureNotify.service.test` ยัง expect คำว่า `กรุณาส่งรูปใหม่` แต่ runtime copy เป็น `รบกวนส่งใหม่อีกครั้ง`; test นี้อยู่ใน `npm test` จึงคำกล่าว `baseline 1012 ไม่มี fail ใหม่` ต้องตรวจใหม่ด้วย baseline-check จริง ห้าม deploy ขณะ suite contract ยังแดง

### Review commit `a71afbf`

ยืนยันว่าปิด shadow fail-closed, job-scoped report query, cancelled/unknown branches และ stale known-fail test ได้จริง; Codex รัน targeted 38/38 ผ่าน

ยังเหลือ 2 blockers ก่อน Pro:

1. `completed` ถูกจับรวมกับ `delivered` และ `claimsDelivered:true` แต่ runtime ใช้ `completed` ใน dedup pathก่อน outbound row ที่เพิ่ง `queued` จะถูกส่ง; ต้องแยก `completed` เป็นผลคำนวณ/เตรียมส่งแล้วแต่ยังไม่ยืนยัน delivery และห้ามพูด “ผลส่งเข้าแชทแล้ว” จน status=`delivered`
2. generic failure allowlist ตก `scan_results_v2_insert_failed` ซึ่งเป็น failJob infra path จริงและไม่มี tailored outbound ทำให้ลูกค้าเงียบได้; เพิ่มเข้ารายการและ testทุก infra code ไม่ใช่เพียง 4 ตัวอย่าง ส่วน `birthdate_missing` ถูก default-skip แต่ไม่มี tailored response ต้องเพิ่มข้อความเฉพาะทางหรือกำหนด recovery ที่ไม่ทำให้เงียบ

Hardening: unknown status ไม่ควรชวน “ส่งรูปใหม่” ทันทีเพราะอาจเป็น status ใหม่ที่ยัง in-flight และทำให้ enqueue ซ้ำ; ให้บอกว่ากำลังตรวจ/ยังไม่ต้องส่งซ้ำ พร้อม alert telemetry

### Review commit `450dc0d`

ยืนยัน completed/delivered แยกถูก, job token query เฉพาะ delivered, infra code ที่ตกหล่นถูกเพิ่ม และ owner-map invariant ทำงาน; targeted 5 files ผ่านทั้งหมด

ก่อน Pro เหลือ copy/flow gaps เล็ก 2 จุด:

1. `birthdate_missing` recovery บอกให้พิมพ์วันเกิดในแชท แต่ chat-registration ถูกถอดใน `4298604` และ text route บันทึกวันเกิดได้เมื่อมี `waiting_birthdate` state เท่านั้น; failure notify ไม่ได้ตั้ง state จึงอาจรับคำแนะนำแล้วไม่เกิดผล ต้องเลือก: ตั้ง durable waiting-birthdate recovery state+ผูกรูป หรือพาลูกค้าแก้วันเกิดผ่าน LIFF/App ตาม product decision แล้วค่อยส่งรูป
2. unknown status บอก “ได้ความยังไงจะแจ้งในแชทนี้เลย” แต่ implementation มีเพียง warn log ไม่มี follow-up job/human alert ที่รับประกันการแจ้ง เป็น dangling promise; เปลี่ยนเป็นคำตอบไม่สัญญาอนาคต เช่น “ยังไม่ต้องส่งซ้ำ ลองเช็กสถานะอีกครั้งสักครู่” หรือเพิ่ม owner/alert จริง
