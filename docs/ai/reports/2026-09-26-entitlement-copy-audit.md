# ข้อความเรื่องสิทธิ์ทั้งระบบ — ก่อน→หลัง (26 ก.ย. 2026, staging `release/three-tasks`)

ใจความเดียวกันทุกหน้า: **ทดลองฟรี 2 ครั้งสำหรับลูกค้าใหม่ · เติมสิทธิ์เมื่อต้องการสแกนเพิ่ม · ของเดิมกลับมาดูได้เสมอ**

## นโยบายที่เปิดจริง (ตรวจจาก DB ไม่ใช่ภาพ)
| env | `new_customer_trial.enabled` | โหมดข้อความที่ระบบเลือก |
|---|---|---|
| staging | false | daily (ภาพ 15:16/15:21 ของกบจึงเป็นข้อความรายวัน = ถูกต้องตามนโยบายที่เปิด) |
| Pro | ไม่มี 057 | daily |

โมดูลกลาง `src/services/entitlementCopy.service.js`: `resolveEntitlementState(access)` → 9 สถานะ → `buildEntitlementStatusLine` / `buildPaywallCopy` · LINE และ LIFF เลือกจากสถานะเดียวกัน · `resolveFreePolicy()` อ่าน DB (ล้ม = `unknown` → ไม่สัญญาเรื่องฟรี)

## ตารางสถานะ → ข้อความ (เรนเดอร์จริงจาก build บน staging, offer `promo-2026-07-21-v2`)
| สถานะจริง | หัวข้อ | รายละเอียด |
|---|---|---|
| ลูกค้าใหม่ ยังไม่ใช้ | สิทธิ์ทดลองฟรีคงเหลือ 2 ครั้ง | สำหรับลูกค้าใหม่ รวม 2 ครั้งต่อบัญชี ไม่เติมใหม่รายวัน |
| ลูกค้าใหม่ ใช้แล้ว 1 | สิทธิ์ทดลองฟรีคงเหลือ 1 ครั้ง | (เดียวกัน) |
| ทดลองครบ | ใช้สิทธิ์ทดลองฟรีครบ 2 ครั้งแล้ว | หากต้องการสแกนองค์ใหม่ เลือกเติมสิทธิ์ด้านล่างได้เลย ส่วนรายงานที่เคยสแกนยังเปิดดูได้ตามเดิมครับ |
| ลูกค้าเดิม ไม่มีสิทธิ์ | เติมสิทธิ์เพื่อสแกนองค์ใหม่ / ยังไม่มีสิทธิ์สำหรับสแกนองค์ใหม่ | เลือกแพ็กสแกนด้านล่างได้เลยครับ คลังและรายงานเดิมของคุณยังเปิดดูได้โดยไม่ต้องซื้อแพ็ก |
| แพ็กหมดอายุ ไม่มีสิทธิ์อื่น | แพ็กสแกนหมดอายุแล้ว | เติมสิทธิ์เพื่อสแกนองค์ใหม่ได้ครับ … |
| มีสิทธิ์ซื้อ | สิทธิ์จากแพ็กคงเหลือ 4 ครั้ง | ใช้ได้ถึง 1 ต.ค. 07:00 น. (จาก paid_until จริง) |
| มีโบนัส | สิทธิ์โบนัสคงเหลือ 1 ครั้ง | โบนัสจากการชวนเพื่อน ใช้เมื่อไรก็ได้ |
| หลายสิทธิ์ | สิทธิ์จากแพ็ก 4 ครั้ง · ใช้ได้ถึง {วัน/เวลา} ⏎ สิทธิ์โบนัส 1 ครั้ง | คนละบรรทัด · วันหมดอายุผูกกับสิทธิ์ซื้อเท่านั้น · โบนัสไม่มีวันหมดอายุในระบบ (`app_users.bonus_scans` ไม่มีคอลัมน์หมดอายุ) จึงไม่แสดงวัน |
| daily เหลือ 1 (trial ปิด) | สิทธิ์ฟรีวันนี้คงเหลือ 1 ครั้ง | ฟรีวันละ 1 ครั้ง รีเซ็ตหลังเที่ยงคืน |
| daily ครบ (trial ปิด) | วันนี้ใช้สิทธิ์ฟรีครบแล้วครับ | เปิดพลังต่อได้เลยวันนี้ หรือพรุ่งนี้หลังเที่ยงคืนมีฟรีให้อีกครับ คลังและรายงานเดิมยังเปิดดูได้ |
| ตรวจสิทธิ์ไม่ได้ | ยังตรวจสอบสิทธิ์ไม่ได้ | กรุณาลองใหม่อีกครั้ง — ไม่แสดง 0 ไม่ชวนจ่าย |

แพ็ก (จาก config เท่านั้น): `สแกน 1 ครั้ง — 29 บาท · ใช้ได้ 24 ชม.` / `สแกน 4 ครั้ง — 49 บาท · ใช้ได้ 24 ชม.` / `สแกน 30 ครั้ง — 399 บาท · ใช้ได้ 30 วัน` · ปุ่ม Flex: **เลือกแพ็ก 49 บาท** (ข้อความที่ส่งเข้าแชทยังเป็น "จ่าย 49" ตาม routing เดิม) · ปุ่มรอง **ดูคลังของฉัน** (= ดูผลเก่า) · **ชวนเพื่อน รับโบนัส** เฉพาะเมื่อ `REFERRAL_ENABLED` ไม่ใช่ false (ตอนนี้เปิดทั้ง staging/Pro) · ไว้ก่อน

## จุดที่แก้ (ก่อน → หลัง)
| จุด | ก่อน | หลัง |
|---|---|---|
| paywall Flex หัว/รอง (`paywallOffer.flex.js`, `freeQuotaPaywallReply.service.js`) | "วันนี้ใช้สิทธิ์ฟรีครบแล้วครับ / …พรุ่งนี้หลังเที่ยงคืนมีฟรีให้อีกครับ" ตายตัวทุกโหมด | ตามสถานะ (ตาราง) · daily คงเดิม |
| ชื่อแพ็กใน Flex | จาก label การตลาด "ค่าครูเปิดคำอ่าน / ค่าครูเหมาชุด / ค่าครูดูแลคลังพลัง" | "สแกน N ครั้ง" + "ใช้ได้ …" |
| ปุ่ม | จ่าย 29/49/399 · ชวนเพื่อน ได้สแกนฟรี · ไว้ก่อน | เลือกแพ็ก N บาท · ดูคลังของฉัน · ชวนเพื่อน รับโบนัส (ถ้าเปิด) · ไว้ก่อน |
| ข้อความ paywall โหมดใหม่ (`buildTrialPaywallText` เดิม) | "ตอนนี้ไม่มีสิทธิ์สแกนที่ใช้ได้ครับ" (ไม่แยก trial ครบ/ลูกค้าเดิม/แพ็กหมดอายุ, ไม่มี Flex) | 3 สถานะแยกกัน + Flex + ของเดิมดูได้ |
| ท้ายผลสแกน (`deliverOutbound`) | คำนวณฟรีเอง, `freeQuotaPerDay \|\| 2`, "สิทธิ์สแกนวันนี้ครบแล้ว พรุ่งนี้หลังเที่ยงคืน…" ทุกโหมด | ใช้ `checkScanAccess` + สถานะเดียวกับ LIFF · daily คงข้อความเดิม · อ่านล้ม = เงียบ (ไม่โชว์เลข) |
| fatigue/intro/soft-close (`webhookText.util.js`) | "พรุ่งนี้ยังมีฟรีต่อได้อีกครับ" / "รอพรุ่งนี้ได้เลยครับ ฟรีจะกลับมา" / "ได้เลยครับ พรุ่งนี้ค่อยส่งมาใหม่" | รับ `policy`: daily คงเดิม · new_customer/unknown = "ได้เลยครับ พร้อมเมื่อไหร่ค่อยเลือกแพ็กสแกนได้ตลอด รายงานเดิมยังเปิดดูได้เสมอครับ" |
| template pools (`scanOffer.templates.th.js`) | offer_intro/free_quota_exhausted มี "พรุ่งนี้มีฟรีใหม่" | เพิ่ม `free_quota_low_trial` / `offer_intro_trial` / `existing_no_rights_trial` · เลือกตาม `freePolicy` · alternates daily ไม่หลุดในโหมดใหม่ |
| คำตอบ "เหลือกี่ครั้ง" (`packageQuestion.util.js`) | "สิทธิ์ทดลองสำหรับลูกค้าใหม่เหลือ N จากทั้งหมด 2 ครั้ง" / "ยังมีสิทธิ์โบนัสสแกนอยู่" / "ตอนนี้ไม่มีสิทธิ์สแกนที่ใช้ได้ครับ" | ชุดเดียวกับ LIFF (ตาราง) รวมหลายสิทธิ์ |
| AI facts (`customerFactsContext.util.js`) | บรรทัด trial ไม่มีโบนัส/ไม่มีคำสั่งห้าม | trial: ระบุใหม่/เดิม + โบนัส + ⛔️ ห้าม "ฟรีวันละครั้ง/วันนี้ใช้ฟรีครบ/พรุ่งนี้มีฟรี/รอหลังเที่ยงคืน" + ของเดิมดูได้ ห้ามชวนซื้อเพื่อดู · daily คงเดิม |
| AI prompt (`geminiConsultPrompt.js`) | "สิทธิ์ฟรีรายวัน รีเซ็ตหลังเที่ยงคืน…" ตายตัว · กติกาเบลอคลัง 19 ก.ค. + "ค่าครูดูแลคลังพลัง 399" · "⑤ ฟรีวันละ 1 ครั้ง" | ยึดข้อมูลลูกค้าในระบบ · เจ้าของดูคลังได้เสมอ ห้ามชวนซื้อเพื่อดูของเดิม · ⑤ ตามนโยบายในข้อมูล |
| welcome (follow) / howto ack / registration success | "ฟรีวันละ 1 ครั้ง/ชิ้น" ตายตัว | `buildFirstScanInviteLine(policy)`: daily "ฟรีวันละ N ครั้ง" · new_customer "ลูกค้าใหม่ทดลองฟรี 2 ครั้ง" · unknown "ทดลองอ่านพลังได้เลย" |
| landing `/yt` | "ฟรีวันละ 1 ครั้ง" (h + meta) | ตาม policy · meta ไม่อ้างฟรี |
| LIFF สถิติ/เติมสิทธิ์ (`liff.routes.js`) | "ค่าครู N / ฟรี N / โบนัส N" · zero-state "สิทธิ์ทดลองใช้ครบแล้ว" เดียว · "ตรวจสอบสิทธิ์ไม่ได้ กรุณาลองใหม่" · การ์ดแรก "วันนี้มีสิทธิ์ฟรี 2" | "จากแพ็ก N / ทดลอง\|ฟรีวันนี้ N / โบนัส N" · zero-state 3 แบบ (ทดลองครบ 2 / ยังไม่มีสิทธิ์ / แพ็กหมดอายุ) + "ของเดิมดูได้โดยไม่ต้องซื้อแพ็ก" · "ยังตรวจสอบสิทธิ์ไม่ได้ กรุณาลองใหม่อีกครั้ง" · การ์ดแรก "สิทธิ์ทดลองฟรี/ฟรีวันนี้ คงเหลือ –" |
| referral card | "ชวนเพื่อน ได้สแกนฟรี / เพื่อนใหม่ได้สแกนฟรี 1 ครั้ง" | "ชวนเพื่อน รับโบนัสสแกน / …โบนัสจากการชวนเพื่อน ใช้เมื่อไรก็ได้" (จำนวน +1 คงตามโค้ดจริง `referral.service.js` — env `REFERRAL_*_BONUS` ไม่ถูกอ่านในโค้ด) |
| upsell รายเดือน (`deliverOutbound`, `upgradeCredit`) | "ค่าครูดูแลคลังพลัง 399" | "แพ็กสแกน 30 ครั้ง 399 บาท" |
| รายงาน CTA ×3 + share card | "ส่งรูปให้อาจารย์อ่าน ฟรีวันละ 1 ชิ้น" / "สแกนฟรีวันละ 1 ชิ้น" | "ส่งรูปให้อาจารย์อ่านพลัง" (หน้าสาธารณะ ไม่รู้นโยบายผู้ชม) |
| `status.flex.js` (ไม่มีผู้เรียกแล้ว) | "🔒 วันนี้คุณใช้สิทธิ์ฟรีครบแล้ว" | "🔒 เติมสิทธิ์เพื่อสแกนองค์ใหม่" |

ไม่ได้แก้: `scanOffer.templates.th.js` pool daily · `customerFactsContext` สาขา daily · `scanOfferAccess.resolver` nextResetLabel (ใช้เฉพาะ daily) — ตามกติกา "รักษาโหมด daily"

## นอก repo — รายการให้กบแก้เอง (ยังไม่ครบจนกว่าจะทำ)
1. **Rich menu** (LINE OA Manager): ป้าย/ข้อความบนเมนู ถ้ามี "ฟรีวันละ…" หรือ "ค่าครูดูแลคลัง" ต้องเปลี่ยน — ผมเห็นไม่ได้จาก repo
2. **ข้อความต้อนรับใน OA Manager** (greeting message ของ LINE ไม่ใช่ follow event ของบอท) — ตรวจว่ามี "ฟรีวันละ 1 ครั้ง" ไหม
3. **`app_settings.scan_offer.packages[].label`** ใน DB (หน้า /admin/promo): ยังเป็น "29 บาท ค่าครูเปิดคำอ่าน…", "399 บาท ค่าครูดูแลคลังพลัง…" — ตอนนี้ไม่โผล่ในข้อความลูกค้าแล้ว (Flex/LIFF ใช้ชื่อจากจำนวนครั้ง) แต่ควรเปลี่ยน label ในหน้า admin ให้ตรง เพื่อไม่ให้แอดมินสับสน · Pro เป็นของกบ
4. คำอธิบายแอป LIFF / รูปปกใน LINE Developers ถ้ามีข้อความฟรีรายวัน
5. โพสต์/คลิป YouTube/FB เก่าที่พูด "ฟรีวันละ 1 ครั้ง" (นอกระบบ)

## ทดสอบ
`tests/entitlementCopy.behavior.test.js` 8 ชุด (เมทริกซ์สถานะ · ตารางข้อความ · หลายสิทธิ์ · paywall/Flex ทุกโหมด · builders รับ policy · pools · AI facts/prompt · จุดตายตัวถูกถอด) · `liffRights.consistency` ปรับตามข้อความใหม่ · `newCustomerTrial` ปรับ expectation · gate ✅

## ปุ่มจริง (Codex ข้อ 3) — หลักฐาน
- **เลือกแพ็ก N บาท** → ส่งข้อความ `จ่าย N` (คำสั่งเดิม) → routing `package_selected_shortcut` → `create_or_show_payment_qr` · หลักฐานสด staging 26 ก.ย. 08:21:54Z บัญชีกบกด "จ่าย 399" (log `PAYMENT_PAY_INTENT_CONSUMED … action:"create_or_show_payment_qr"` + `paywall_shown … qr_intro_image_slip`) · automated: `isPaymentCommand("จ่าย N")` = true ทุกแพ็ก และไม่ชนคำสั่ง utility
- **ดูคลังของฉัน** → ส่ง `ดูผลเก่า` → `matchExactUtilityCommand` = history → `handleHistoryCommand` (ไม่มีการเช็ค checkScanAccess/paid/entitlement ในโค้ด) → การ์ดลิงก์ `/myscans/<token ส่วนตัว>` (token 128-bit เก็บ hash, no-referrer, ไม่ใช่ลิงก์แชร์ `/r/`) · ลิงก์แชร์ `/r/:token/library` ยังถูก owner gate (HTTP test 8/8) · **ยังไม่มีหลักฐานสดจากบัญชีกบ** (กบยังไม่เคยกดวันนี้)

---
# ปลดคลัง/รายงานเดิมของเจ้าของให้ครบจริง (Codex รอบ 5 — `2212c34` + `cdfeab6`)

## ต้นตอที่ Codex ชี้ (ยืนยันจากโค้ด `29d50de`)
`report.controller.js` ส่ง `memberAccess=false` เมื่อ**ยืนยันเจ้าของไม่ได้** (เปิดจากลิงก์ในแชท = ไม่มี cookie) แล้ว template ทุกเลนตีความว่า "ต้องซื้อแพ็ก" → เบลอ + ปุ่ม "เปิดสิทธิ์เพื่อดู" + ลิงก์ `view=pay` — ตรงกับภาพ 16:12 ของกบ · cookie เจ้าของออกเฉพาะที่ `/myscans/:token` จึงไม่มีทางยืนยันจากหน้ารายงาน · LINE (`maybeHandleRankingQueryGate`, ชิ้นเด่นรายด้าน, daily pick push) ยังเช็ค "จ่ายใน 3 วัน / ≤5 ชิ้น"

## กติกาที่ใช้ตอนนี้
- **owner (พิสูจน์ด้วย cookie จาก LINE)** → เปิดครบ ไม่เบลอ ไม่ตัดอันดับ ไม่ชวนซื้อเพื่อดู — ทุกเลน ทุกโหมด ไม่ขึ้นกับ paid/trial
- **guest (ลิงก์แชร์ / ยังยืนยันไม่ได้)** → เห็นเฉพาะรายงานที่แชร์ · **ไม่มีข้อมูลคลังใน HTML** (ไม่ใช่เบลอด้วย CSS) · บล็อก "คลังของฉัน · ยืนยันผ่าน LINE" → LIFF `view=owner&return=/r/…` → `POST /api/liff/owner-session` (LINE idToken) → cookie เจ้าของ → กลับมาหน้าเดิม · **ไม่พาไปหน้าจ่ายเงิน**
- คิดสิทธิ์เฉพาะตอนสแกนใหม่ · `hasRecentPaidAccess` เหลือใช้เฉพาะการสร้างของใหม่ (consult / voice note)

## จุดที่แก้
| จุด | ก่อน | หลัง |
|---|---|---|
| `ownHistoryAccess.util.js` | `{accessFull, memberAccess}` | `{accessFull, viewerRole: owner\|guest}` — ไม่มี memberAccess |
| `report.controller.js` | guest ได้คลังจาก payload ใบเดียว + memberAccess=false | guest ไม่สร้างคลัง · ส่ง `viewerRole`, `ownerVerifyUrl` (พระ → `/library`, เลนอื่น → รายงานเดิม), `liffHomeUrl` · หน้า `/library` ไม่มี `lockedAll` |
| `ownerProof.util.js` | — | `ownerVerifyUrl()` / `isSafeOwnerReturnPath()` (จำกัด path ในโดเมน) |
| `liff.routes.js` | cookie เจ้าของออกได้แค่ `/myscans` | `POST /api/liff/owner-session` (uid จาก idToken เท่านั้น) + หน้า LIFF รับ `view=owner&return=` |
| `amuletReportV2` | podium/แถว/แคโรเซล เบลอ + "เปิดสิทธิ์เพื่อดู" + "และอีก N ชิ้น · เปิดสิทธิ์…" + teaser เบลอขาย 299 + sticky "เปิดสิทธิ์เพื่อดู" | ลบทั้งหมด · teaser เปิดชัด → `/library#today` · sticky "คลังของฉัน" · guest = บล็อกยืนยัน · ลบ CSS `.mv2r-blur/.mv2r-pod--locked/.mv2r-row--locked/.mv2r-pod-btn--pay` |
| `crystalBraceletReportV2` | `censorAll` เบลอ + "เปิดสิทธิ์เพื่อดูคลังชัด ๆ" + teaser | ลบ · owner sticky → `#cb2-lib-h` · teaser → LIFF · guest บล็อกยืนยัน · ลบ CSS `.cb2-lib-blur/.cb2-lib-unlock` |
| `moldaviteReportV2` | teaser เบลอ + sticky "เปิดสิทธิ์เพื่อดู" | teaser เปิด → LIFF · sticky "คลังของฉัน" → LIFF · guest บล็อกยืนยัน |
| `amuletLibraryRanking` | `lockedAll/censorTop` เบลอแถว 1-2 / ทั้งหน้า + แท็บ "หนุนดวงวันนี้" ล็อก "เปิดค่าครูเพื่อดู" | ลบทั้งหมด (`lockedRowHtml`, `todayLockedPanel`, CSS) — owner gate ยังอยู่ที่ controller (guest 302) |
| `lineWebhook` ranking gate | ไม่จ่ายใน 3 วัน → redirect ไปรายงานที่เซ็นเซอร์ | ยกเลิก (return false) |
| `lineWebhook` ชิ้นเด่นรายด้าน | >5 ชิ้น + ไม่จ่าย = teaser ไม่มีรูป | open เสมอ |
| `dailyLuckyPickPush` | >5 ชิ้น + ไม่จ่าย = teaser เบลอ | open เสมอ · optout/ban/ตารางส่ง/dedupe คงเดิม |
| `reportEnglish` | "Unlock to view" | เพิ่ม "My library / Open my library · verify via LINE / See today's fortune ranking" |

## หลักฐาน HTTP จริงบน staging (บัญชีกบ, read-only — cookie เจ้าของสร้างในคอนเทนเนอร์ด้วย secret ของ staging เพื่อจำลองผู้ชมที่ยืนยันแล้ว ไม่ได้แตะข้อมูลใด)
| เลน / ผู้ชม | ก่อน (`29d50de`) | หลัง (`cdfeab6`) |
|---|---|---|
| กำไล guest (ลิงก์ในแชท ไม่มี cookie) | "เปิดสิทธิ์เพื่อดู" ×2 · class เบลอ ×3 · `view=pay` ×2 · หัวข้อ "คลังกำไลของคุณ" โผล่ (ข้อมูลคลังหลุดแบบเบลอ) | ×0 ทั้งหมด · ไม่มีหัวข้อคลัง · ไม่มีลิงก์ `/r/` ของชิ้นอื่น · บล็อก "คลังของฉัน · ยืนยันผ่าน LINE" → `view=owner&return=/r/<token>` |
| กำไล owner | (ไม่มีทางยืนยันจากหน้ารายงาน) | "คุณสแกนกำไลไว้แล้ว 4 เส้น (4 ครั้ง)" · อันดับ 1 + เด่น 4 ด้าน ชัด · ลิงก์ชิ้นอื่น 4 · sticky "คลังของฉัน" → `#cb2-lib-h` · 0 paywall |
| พระ guest | "เปิดสิทธิ์เพื่อดู" ×2 · เบลอ ×2 · `view=pay` ×1 · หัวข้อคลังโผล่ | ×0 · ไม่มีคลัง · บล็อกยืนยัน → `return=/r/<token>/library` |
| พระ owner | — | หัวข้อคลัง · ลิงก์ชิ้นในคลัง 72 · 0 paywall · `/library` = 200 (guest = 302) |
| หิน | กบไม่มีรายงานเลนหินบน staging | **ยังไม่ทดสอบสด** — ครอบด้วย HTTP matrix เท่านั้น |
| `POST /api/liff/owner-session` ไม่มี token | — | 401 ไม่มี cookie |

## ทดสอบ
`tests/ownerVault.http.matrix.test.js` (HTTP จริงผ่าน express + controller + renderer + template ทุกเลน; fixture ผ่าน loader hook แทน DB): พระ/กำไล/หิน × owner/no-cookie/บัญชีอื่น × ≤5/>5 × จ่าย-ไม่จ่าย (HTML เท่ากัน) × TH/EN · `/library` owner 200 ครบ / guest 302 ไม่รั่ว · held → 503 ไม่รั่ว · ดูรายงานไม่เรียก `hasRecentPaidAccess`/ไม่แตะสิทธิ์ · owner-session: ไม่มี token 401, token ปลอม 401, uid จาก body ถูกเมิน, cookie ที่ได้เปิดคลังตัวเองได้/ของบัญชีอื่นไม่ได้ (สลับ A/B) · ownerVerifyUrl กัน path นอกโดเมน · ช่องทาง LINE ไม่มีเกตจ่าย — **19/19** · `ownHistoryUnlock`/`flowRole E` ปรับตามกติกาใหม่ · gate ✅ (fail เฉพาะ known-failing เดิม)

**ยังไม่ทดสอบสด:** เลนหิน · ปุ่ม "ยืนยันผ่าน LINE" กดจริงจากมือถือ (LIFF → cookie → กลับหน้า) · เปิดจาก rich menu · สลับบัญชี A/B บนอุปกรณ์จริง — รอกบกด (ไม่กระทบยอด/สิทธิ์)

**ขอบเขตที่ไม่แตะ:** owner gate ของ `/library` และ `/myscans` · ban/optout · held/pending/failed · การสร้างของใหม่ (สแกน/consult/voice note) ยังเช็คสิทธิ์ตามเดิม · ไม่มี AI call เพิ่ม

## เส้นยืนยันเจ้าของ — ปิดช่องว่าง 2 จุด (Codex รอบ 6)
| จุด | ก่อน | หลัง |
|---|---|---|
| view=owner ผูกกับโปรไฟล์ | รันเฉพาะเมื่อ `profile.nickname` มี · ไม่มี → เข้าหน้ากรอกข้อมูล แล้วไม่กลับรายงาน | `runOwnerVerify()` รันทันทีหลัง LINE login (ก่อนเรียก `/api/liff/profile`) — คนที่มีรายงานแต่ไม่เคยเข้า LIFF ก็ยืนยันได้ · return path เดิม |
| ล้มเหลวเงียบ / รายงานสำเร็จปลอม | frontend `catch` เงียบ · `issueOwnerCookie` กลืน exception แต่ endpoint ตอบ `ok:true` + log ISSUED | `issueOwnerCookie` คืน boolean (ตรวจ `Set-Cookie` จริง) · owner-session: ล้ม → 500 `{ok:false,error:"cookie_not_issued"}` + log `OWNER_SESSION_COOKIE_FAILED` ไม่มี ISSUED · frontend สำเร็จเฉพาะ 200 **และ** `ok===true` → redirect · ล้ม (401/5xx/network/ok:false) → "ยืนยันไม่สำเร็จ กรุณาลองใหม่" + ปุ่ม "ลองอีกครั้ง" · ไม่ retry/redirect อัตโนมัติ · หน้ารายงาน guest ไม่มี auto-redirect (ไม่มีวน) |
| โค้ด 2 สำเนา | flow อยู่ใน HTML string อย่างเดียว | `src/routes/liffOwnerVerify.client.js` โมดูลเดียว — ฝังใน LIFF HTML ด้วย `.toString()` และ import ตรงในเทสต์ |

**Browser-flow test** `tests/ownerVerify.browserflow.test.js` (cookie jar + api ใส่ Bearer + navigate บันทึกปลายทาง · LINE verify จำลองที่ `fetch` · owner-session/report จริง — ไม่มีการสร้าง signed cookie ข้ามขั้น): มีโปรไฟล์/ไม่มีโปรไฟล์ (ไม่แตะ `/api/liff/profile`, กลับ `/library` แล้วเห็นคลัง 3 ชิ้น) · token หมดอายุ (401 → failed:login_expired ไม่มี cookie ไม่ redirect → ลองใหม่ด้วย token ดีผ่าน) · API ล้ม (network, attempts=1 ไม่วนเอง) · cookie ออกไม่ได้ (500 ok:false, ไม่มี ISSUED, มี COOKIE_FAILED) · 200 แต่ ok:false ไม่นับสำเร็จ · บัญชี B กดจากลิงก์ของ A (ได้ cookie B → guest view, `/library` 302, คลัง A ไม่รั่ว) · return path นอกโดเมนถูกปฏิเสธ · หน้า LIFF ฝัง flow ก่อนเช็คโปรไฟล์ — **8/8**
**ยังไม่ทดสอบสด:** กดจากมือถือจริง (LIFF จริง) — รอกบ
