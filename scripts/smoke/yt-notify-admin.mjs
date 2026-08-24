// smoke เคส 10 (staging): ยิง YouTube notify ให้ ADMIN_LINE_USER_ID ผ่าน production path จริง (pushRawToCustomer boundary)
// ใช้ในคอนเทนเนอร์: node scripts/smoke/yt-notify-admin.mjs  — ไม่พิมพ์ค่า env ใด ๆ
const uid = String(process.env.ADMIN_LINE_USER_ID || "").trim();
if (!uid) { console.log(JSON.stringify({ event: "SMOKE_YT_NOTIFY", ok: false, reason: "ADMIN_LINE_USER_ID missing" })); process.exit(1); }
const { notifyOwnerClipLive } = await import("../../src/services/fbShowcase/scanYoutubeShort.service.js");
await notifyOwnerClipLive(uid, "https://youtu.be/WwUOA42QpfQ", false);
console.log(JSON.stringify({ event: "SMOKE_YT_NOTIFY", ok: true, uidPrefix: uid.slice(0, 6) }));
process.exit(0);
