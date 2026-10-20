# สำเนา commit ener-ai branch `feat/alert-state-dedupe` (b13567f → da1310778aba3cb4fb917c523f705d222ddba017) — เก็บนอก server (Codex 20 ต.ค. 2026)
- `0001-0003-alert-state.patch` — `git format-patch b13567f..da13107` (3 commits: 76dd77f, 56d6b51, da13107) · นำกลับ: `git am 0001-0003-alert-state.patch` บน b13567f
- `feat-alert-state-dedupe.bundle` — `git bundle` ของช่วงเดียวกัน · นำกลับ: `git fetch <bundle> feat/alert-state-dedupe:feat/alert-state-dedupe`
- สถานะ: deploy บน ener-ai แล้ว 20 ต.ค. 08:10 ไทย (image b1d9ff36b8cc) · ยังไม่ push ไป GitHub ของ ener-ai (ไม่มี credential บน server — กบ push เอง)
- ข้อจำกัดค้าง: `_renew()` ยึด lease ใหม่ได้หลังเสีย (Codex) → ตามแก้แยก · rollback ener-ai = **build ใหม่จาก b13567f** (image เดิม 6a0c10f2b594 ถูกลบ 20 ต.ค. ตามที่กบอนุมัติ) ไม่ใช่ย้อนทันที
