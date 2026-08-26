# แผนล้าง shell history + rotate key (แยกรอบ — ยังไม่ทำ)

**พบ**: 26 ส.ค. 2026 `/root/.bash_history` บนเซิร์ฟเวอร์ (~87 KB) มี 23 บรรทัดที่มีรูปแบบ `KEY=/TOKEN=/SECRET=/PASSWORD=` (นับจำนวนอย่างเดียว ไม่อ่านค่า)
**กติกา**: ห้ามพิมพ์ค่าจริงลง log/รายงาน/แชท ทุกขั้นตอนใช้ชื่อตัวแปรเท่านั้น

## ขั้นตอน (ทำตามลำดับ ต้องมีกบอยู่ด้วยตอน rotate)
1. **สำรวจ (read-only)**: `grep -nE "KEY=|TOKEN=|SECRET=|PASSWORD=" ~/.bash_history | cut -d: -f1` → ได้หมายเลขบรรทัด · ดึง "ชื่อตัวแปร" อย่างเดียว: `grep -oE "[A-Z_]+(KEY|TOKEN|SECRET|PASSWORD)=" ~/.bash_history | sort | uniq -c` → รายการ key ที่ต้อง rotate
2. **ล้าง history**: `history -c && : > ~/.bash_history` บน session ที่เปิดอยู่ทุกอัน + ตรวจ `~/.zsh_history`, `~/.python_history`, `/root/.psql_history`, `~/.mysql_history`, `/home/*/.bash_history` · ตั้ง `HISTCONTROL=ignorespace:ignoredups` และ `HISTIGNORE='*KEY=*:*TOKEN=*:*SECRET=*:*PASSWORD=*'` ใน `/root/.bashrc` กันเกิดซ้ำ
3. **Rotate ทีละตัว** (ตามรายการข้อ 1 — คาดว่ามี LINE channel token/secret, OpenAI/Gemini/OpenRouter, Supabase service key, PostgREST JWT, Telegram bot, ElevenLabs, FB page token, R2):
   - ออก key ใหม่ที่ผู้ให้บริการ → แก้ `.env` ของ pro+staging (แก้ในไฟล์ ไม่ใช่ผ่าน command line) → `docker compose up -d` → smoke เส้นที่ใช้ key นั้น → revoke key เก่า
   - LINE: channel secret เปลี่ยน = webhook signature เปลี่ยน ต้องทำนอกเวลา peak
4. **ตรวจแหล่งรั่วอื่น**: `docker inspect` env ของ container (แสดงค่า — ห้าม paste ลงแชท), ไฟล์ backup `.env.bak*`, `deploy-ener.sh` (ใช้ `--env-file` อยู่แล้ว ok), CI logs
5. **ปิดงาน**: LOG.md บันทึก "rotate แล้ว: <ชื่อตัวแปร> วันที่" เท่านั้น
