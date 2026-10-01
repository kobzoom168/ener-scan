// --import hook สำหรับ integration test เส้น LINE webhook (router/handler จริง) — ระบบแยกเท่านั้น
// ปลอม: @line/bot-sdk Client (บันทึก reply/push · ส่งรูปจาก memory) · S3 · thumbnail · objectCheck (AI) — อย่างอื่นของจริง
import { register } from "node:module";
register("./line-it-hooks-impl.mjs", import.meta.url);
