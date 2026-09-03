# Discovery "หิ้ง/คลังของฉัน" — read-only (3 ก.ย. 2026 · ไม่แก้โค้ด ไม่ deploy)

> ข้อค้นพบใหญ่สุด: **ระบบมีของมากกว่าที่ AI ภายนอกทั้งสองตัวรู้เยอะมาก** — หน้า "ผลสแกนของฉัน" มีแล้ว · ฟอร์มเติมข้อมูลมีแล้ว · ระบบจัดชุด (Synergy) LIVE แล้ว · เครื่องปั๊มการ์ดภาพมีแล้ว · และมีสเปก "ทะเบียนเกียรติคลัง" (docs/ai/plans/ener-collector-rank.md) ที่สังเคราะห์ 3 AI ไว้ตั้งแต่ ก.ค. ครอบเรื่องยศ/ตรา/กันปั๊มลึกกว่าคำตอบรอบนี้ → MVP คือการ "ประกอบของเดิม" ไม่ใช่สร้างใหม่

## 1. ข้อมูลที่มีพร้อมแล้วสำหรับการ์ดสะสม (วัดจาก Pro DB จริง)

| ข้อมูล | แหล่ง | ความครอบคลุมจริง |
|---|---|---|
| รูป (thumbnail) | global_object_baselines.thumbnail_path + รูปในรายงาน | ครบทุกชิ้นที่ enroll |
| รายงานเต็ม | scan_results_v2.report_payload_json + `html_public_token` (หน้า public มีแล้ว) | **4,369 results / 261 users** |
| ชื่อพระ/วัด/รุ่นปี/จุดประสงค์ | **object_owner_info** (เจ้าของแจ้ง — เกตเก็บอยู่แล้วทุกวัน) | 1,158 แถว/136 users: ชื่อ 822 · วัด 622 · ปี 414 · จุดประสงค์ 595 → **"% ข้อมูลครบ" คำนวณได้จาก SQL ล้วนวันนี้เลย** |
| เอกลักษณ์ชิ้นไม่ซ้ำ (กันนับสแกนซ้ำ) | baselines: sha256+phash+object_group_id (ระบบ dedup + Re-ID มีแล้ว) | พร้อม — กติกา "ชิ้นไม่ซ้ำ" ของแผน collector-rank ใช้ได้ทันที |
| แกนพลัง/เกรด (สำหรับตราชั้นสูง เฟสหลัง) | axis_scores_json, peak_power_key | ครบ |
| เจ้าของ + วันที่สแกน | line_user_id / app_user_id + created_at | ครบ |
| สถานะเผยแพร่ | ยังไม่มี flag opt-in share ต่อชิ้น → **ต้องเพิ่ม** | — |

**ขนาดตลาดภายใน**: ลูกค้ามีผลสแกน ≥3 ชิ้น = **152 คน** · ≥5 ชิ้น = 119 คน → หิ้งไม่ว่างเปล่าแน่สำหรับกลุ่มเป้า (ความเสี่ยง "หิ้งโล่ง" ต่ำกว่าที่ AI ภายนอกกังวล)

## 2. หน้า/Route เดิมที่ reuse ได้

| ของเดิม | สถานะ | ใช้ทำอะไรใน MVP |
|---|---|---|
| **GET /myscans/:token** (myScansPage.service.js ~260 บรรทัด ธีมดำทอง + การ์ด flex "ผลสแกนของฉัน" ในแชท + token ต่อ user ใน DB แล้ว) | LIVE | **คือหน้าหิ้งเวอร์ชัน 0** — อัปเกรดเป็นกริด + % ครบ + ตรา |
| **GET /obj-info/:tok** (ฟอร์มเติม ชื่อ/วัด/รุ่น/ปี/จุดประสงค์ แยกฟิลด์) | LIVE | ปุ่ม "เติมข้อมูล" — **มีอยู่แล้วทั้งฟอร์มและตัวเซฟ** |
| **GET /synergy/:token** (จัดชุดจากคลัง + ฉายาคลัง + gap line "ยังขาดสาย…") | LIVE | หน้า "จัดชุด" + gap = ตัวกระตุ้นซื้อ ที่ AI ภายนอกเสนอ — **มีแล้ว** |
| photo-card generator (fbShowcase, resvg PNG ดำทอง) | LIVE | การ์ดแชร์สวย — เปลี่ยน template ได้ |
| /liff SPA + LINE idToken auth + liff_profiles | LIVE | ถ้าอยากเป็น LIFF เต็ม (แต่ myscans token-link ก็พอสำหรับ MVP) |
| paywall/แพ็กในแชท + การ์ดโปร | LIVE | ปุ่ม "สแกนเพิ่ม/ซื้อแพ็ก" ลิงก์กลับแชท |

## 3. ต้องสร้างใหม่ (น้อยกว่าที่คิด)

1. **มุมมองกริด + % ครบ** ใน myscans (คำนวณจาก object_owner_info — SQL ล้วน)
2. **ตาราง user_badges** (uid, badge_key, earned_at) + evaluator ตอนเปิดหน้า (เกณฑ์จากข้อมูลที่มี — ไม่มี cron ก็ได้) — ใช้ชุดตรา/ชื่อยศจากแผน collector-rank (ผ่านการกรองคำต้องห้ามแล้ว: ห้าม เกม/แต้ม/เลเวล)
3. **หมวด/ชุดที่ผู้ใช้ตั้งเอง**: เฟสแรก derive จาก purpose ที่มี (595 แถว) — custom category = คอลัมน์เดียวใน object_owner_info หรือตารางเล็ก
4. **opt-in share flag ต่อชิ้น** + endpoint การ์ดแชร์ (ประกอบจาก generator เดิม)
5. **ตาราง page_events** สำหรับ funnel (โครงเดียวพอ: uid_prefix, event, meta, ts)

## 4. จำแนก AI ต่อกิจกรรม (ตามข้อกำหนด: หิ้งต้อง AI=0)

| กิจกรรม | AI |
|---|---|
| เปิดหิ้ง / ดูการ์ด / % ครบ / ตรา / จัดหมวด / แชร์การ์ด / ดูชุด synergy ที่ cache แล้ว | **0** (SQL + template ล้วน) |
| เติมข้อมูลผ่าน **ฟอร์ม** /obj-info | **0** (แยกฟิลด์อยู่แล้ว) — ให้ปุ่มในหิ้งชี้ฟอร์มเสมอ |
| เติมข้อมูลโดยพิมพ์ในแชท | flash-lite 1 call (objectInfoParse ~฿0.015) — เส้นทางรอง |
| สร้างชุด synergy ใหม่ (ครั้งแรก/คลังเปลี่ยน) | 1 call (มี cache ผูก vaultSig อยู่แล้ว) |
| สแกนชิ้นใหม่ | pipeline ปกติ (นี่คือจุดขายแพ็ก — ตามดีไซน์) |
| **กติกาเหล็กจากแผนเดิม**: สแกนซ้ำไม่ให้ตรา/ความคืบหน้า (dedup ตัดก่อนแล้วโดยระบบ) | บังคับโดยโครงสร้าง |

## 5. Funnel events (เสนอ)
`shelf_opened · item_opened · metadata_form_opened · metadata_completed(field_count) · badge_earned(badge_key) · category_set · share_created(item|shelf) · share_link_clicked(utm) · scan_cta_clicked · pay_cta_clicked · payment_approved(join payments) · returned_d7(derive จาก shelf_opened)` — เก็บลง page_events, ห้ามเก็บข้อความ/ชื่อ, uid เก็บ prefix+hash

## 6. MVP เล็กสุด + effort (ตรวจ repo แล้ว)

หน้าเดียว (อัปเกรด /myscans): กริดการ์ด → แตะเข้าการ์ด (รูป+ข้อมูล+%+ปุ่มเติมข้อมูล→ฟอร์มเดิม+ปุ่มรายงานเดิม) → แถบตรา 5 แบบ → ปุ่มแชร์ (opt-in) → ปุ่มสแกนเพิ่ม/ซื้อแพ็ก → บรรทัดชุดจาก synergy

| ส่วน | effort |
|---|---|
| กริด + % ครบ + การ์ดรายละเอียด (ต่อยอด myscans) | 1.5–2 วัน |
| user_badges + evaluator + แสดงตรา 5 แบบ | 1 วัน |
| share card endpoint + opt-in flag | 1–1.5 วัน |
| page_events + funnel + รายงาน | 1 วัน |
| ทดสอบ + staging + copy ตรวจคำต้องห้าม | 1 วัน |
| **รวม MVP** | **~5–6.5 วันทำงาน (≈1–1.5 สัปดาห์)** — เร็วกว่าที่ AI ภายนอกเดา (2–3 สัปดาห์) เพราะ reuse หนัก · ประมาณของเขาไม่ผิดถ้ารวมภารกิจ/อันดับ ซึ่งเราตัดไปเฟสหลังอยู่แล้ว |

Rollout: feature flag `SHELF_V1_ENABLED` + เปิดเฉพาะ uid list ทดลอง → staging smoke → pro เฉพาะกลุ่ม · rollback = ปิด flag (หน้าเดิมยังอยู่) · ไม่มี migration ทำลายล้าง (ตารางใหม่ 2 ตาราง + คอลัมน์ flag)

## 7. การทดลอง 30 วัน

- กลุ่มทดลอง: ลูกค้า active ที่มี ≥3 ชิ้น (152 คน) สุ่มครึ่ง: A ได้การ์ดเชิญเปิดหิ้ง / B ไม่แจ้ง (control — หน้าเดิมยังใช้ได้แต่ไม่โปรโมท)
- วัด: D7/D30 return (shelf_opened) · metadata_completed rate · share rate · free→paid conversion · purchase count/repeat · revenue per active · **AI cost per payer (มี cost puller แยก jobId/accessSource แล้ว — วัดได้จริงเป็นครั้งแรก)** · net contribution
- **GO**: net revenue เพิ่ม + AI/payer ไม่แย่ลง + (conversion หรือ repeat ขึ้นชัด) + ไม่มีข้อมูลหลุดโดยไม่ opt-in · **ADJUST**: เปิดหิ้งเยอะแต่ไม่ซื้อ → ปรับ CTA/แพ็ก · **STOP**: เปิดน้อย (<25% ของกลุ่ม A ใน 14 วัน) หรือ AI พุ่งไม่มีรายได้ตาม
- เป้ารายการซื้อเพิ่มใช้ของ Codex: **+25–30 รายการ/เดือน** (ไม่ใช่แค่จุดหยุดขาดทุน 14–18)

## 8. ตลาดผู้หญิง (ทดลองก่อน ไม่สร้างแยก)

ระบบรองรับ lane หิน/กำไลอยู่แล้ว (objectCheck.crystal_family / bracelet, synergy รองรับ) → ไม่ต้องสร้าง product แยก · ทดลอง = โฆษณา 2 ชุด (เครื่องราง / หิน-เครื่องประดับ, งบ 500–1,000฿/ชุด) → ลิงก์ add LINE ติด UTM → วัด click → add → first scan → first payment ด้วย page_events + payments · ตัดสินใจแยก UI หลังเห็นตัวเลข

## คำแนะนำ GO/NO-GO ของผม

**GO แบบมีเงื่อนไข**: ทำ MVP ตามข้อ 6 (ประกอบของเดิม ~1–1.5 สัปดาห์, AI=0 ทุกกิจกรรมหิ้ง) โดยใช้ศัพท์/กติกากันปั๊มจากแผน ener-collector-rank.md เดิม · **แต่ต้องต่อคิวหลังงานที่ค้างอยู่** (หน้าต่างวัด AI ถึง ~6-10 ก.ย. ห้ามแตะ verifier/model ระหว่างนี้ — งานหิ้งไม่ชนเพราะ AI=0 ทำคู่ได้) · ยังไม่แตะ Collector Pass/อันดับ/ภารกิจจนกว่า MVP พิสูจน์ D7+conversion
