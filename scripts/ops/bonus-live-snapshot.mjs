/**
 * Snapshot read-only สำหรับเทสต์สดโบนัส A/B/C บน staging (26 ก.ย. 2026)
 * รันในคอนเทนเนอร์ web:  docker exec ener-scan-staging node scripts/ops/bonus-live-snapshot.mjs <LINE_UID> [sinceISO]
 * อ่านอย่างเดียว: app_users / scan_jobs / scan_uploads / outbound_messages + checkScanAccess + resolveLiffRights
 * (checkScanAccess ไม่เขียน DB ตั้งแต่ 064) · พิมพ์ UID แค่ prefix
 */
import { supabase } from "../../src/config/supabase.js";
import { checkScanAccess } from "../../src/services/paymentAccess.service.js";
import { resolveLiffRights } from "../../src/routes/liff.routes.js";

const uid = String(process.argv[2] || "").trim();
const since = process.argv[3] || new Date(Date.now() - 6 * 3600e3).toISOString();
if (!/^U[0-9a-f]{32}$/.test(uid)) { console.error("usage: <LINE_UID> [sinceISO]"); process.exit(2); }
const mute = console.log; console.log = () => {};
const { data: u } = await supabase.from("app_users").select("id,bonus_scans,paid_until,paid_remaining_scans").eq("line_user_id", uid).maybeSingle();
const { data: jobs } = await supabase.from("scan_jobs").select("id,status,access_source,free_access_kind,upload_id,error_code,created_at").eq("line_user_id", uid).gte("created_at", since).order("created_at");
const upIds = (jobs || []).map((j) => j.upload_id);
const { data: ups } = upIds.length ? await supabase.from("scan_uploads").select("id,line_message_id").in("id", upIds) : { data: [] };
const jobIds = (jobs || []).map((j) => j.id);
const { data: outs } = jobIds.length ? await supabase.from("outbound_messages").select("related_job_id,kind,status,payload_json").in("related_job_id", jobIds).eq("kind", "scan_result") : { data: [] };
const access = await checkScanAccess({ userId: uid });
const liff = await resolveLiffRights(uid, access);
console.log = mute;
const mid = Object.fromEntries((ups || []).map((x) => [x.id, x.line_message_id]));
console.log(JSON.stringify({
  at: new Date().toISOString(), uidPrefix: uid.slice(0, 8), since,
  db: { bonus_scans: u?.bonus_scans ?? null, paid_until: u?.paid_until ?? null },
  gate: { allowed: access.allowed, reason: access.reason, freeAccessKind: access.freeAccessKind, freeScansRemaining: access.freeScansRemaining, bonusScansAvailable: access.bonusScansAvailable },
  liff: { total: liff.total, freeLeft: liff.freeLeft, bonusLeft: liff.bonusLeft, paidLeft: liff.paidLeft, unavailable: liff.unavailable },
  jobs: (jobs || []).map((j) => ({
    job: j.id.slice(0, 8), at: j.created_at, status: j.status, kind: j.free_access_kind ?? j.access_source, err: j.error_code ?? null,
    messageId: mid[j.upload_id] ?? null,
    dupEvidence: (outs || []).some((o) => o.related_job_id === j.id && o.payload_json?.skipQuotaDecrement === true),
    resultSent: (outs || []).some((o) => o.related_job_id === j.id && o.status === "sent"),
  })),
}, null, 1));
process.exit(0);
