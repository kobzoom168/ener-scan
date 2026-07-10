/**
 * Voice note "เสียงอาจารย์" แนบท้าย flex report — สรุปสั้น ๆ ว่าชิ้นนี้เด่นอะไร
 * คะแนนเท่าไหร่ (ElevenLabs v3 เสียงโคลน → m4a → R2 → LINE audio message).
 *
 * Best-effort ทั้งเส้น: พังตรงไหน = report ส่งแบบเดิมโดยไม่มีเสียง ห้ามบล็อกรายงาน
 */
import { spawn } from "child_process";
import { mkdtemp, writeFile, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, S3_ENABLED } from "../../config/s3Storage.js";
import { env } from "../../config/env.js";
import { supabase } from "../../config/supabase.js";
import { getUserPaidUntil } from "../../stores/paymentAccess.db.js";

/**
 * สคริปต์พูด ~10-18 วิ จากข้อมูลจริงใน report — deterministic (ไม่ใช้ LLM)
 * เพื่อไม่มีทางหลุด persona และไม่เพิ่ม latency. หมุนหลายแบบตาม seed กันซ้ำ.
 * @param {{ score: number | null, mainEnergy: string, lane: string, seed: string }} p
 */
export function buildVoiceScript({ score, mainEnergy, lane, seed }) {
  const piece = lane === "sacred_amulet" ? "องค์นี้" : "ชิ้นนี้";
  const scoreTxt =
    typeof score === "number" && Number.isFinite(score)
      ? String(Math.round(score * 10) / 10).replace(/\.0$/, "")
      : "";
  const energy = String(mainEnergy || "").trim();

  let h = 0;
  const s = String(seed || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;

  /** @type {string[]} */
  const variants = [];
  if (scoreTxt && energy) {
    variants.push(
      `อาจารย์ดูให้แล้วนะ ${piece}พลังรวมได้ ${scoreTxt} เต็มสิบ ที่เด่นชัดเลยคือด้าน${energy} รายละเอียดทั้งหมดอาจารย์เขียนไว้ในรายงาน เปิดอ่านได้เลย`,
      `${piece}พลังเดินดีนะ ได้ ${scoreTxt} เต็มสิบ สาย${energy}นำมาเลย ใครพกไว้เรื่องนี้จะหนุนเป็นพิเศษ ที่เหลืออาจารย์ลงไว้ในรายงานให้แล้วนะ`,
      `อาจารย์เพ่งดูแล้ว ${piece}ได้ ${scoreTxt} เต็มสิบ พลังด้าน${energy}โดดเด่นสุด ลองเปิดรายงานดู อาจารย์เขียนรายละเอียดไว้ให้ครบเลย`,
    );
  } else if (scoreTxt) {
    variants.push(
      `อาจารย์ดูให้แล้วนะ ${piece}พลังรวมได้ ${scoreTxt} เต็มสิบ รายละเอียดแต่ละด้านอาจารย์เขียนไว้ในรายงาน เปิดอ่านได้เลย`,
    );
  } else {
    variants.push(
      `อาจารย์ดูให้เรียบร้อยแล้วนะ ${piece}มีเรื่องน่าสนใจอยู่ รายละเอียดอาจารย์เขียนไว้ในรายงาน เปิดอ่านได้เลย`,
    );
  }
  return variants[h % variants.length];
}

/** @returns {Promise<Buffer>} mp3 audio from ElevenLabs */
async function synthesizeMp3(text) {
  const voiceId = String(env.ELEVENLABS_VOICE_ID || "").trim();
  const apiKey = String(env.ELEVENLABS_API_KEY || "").trim();
  if (!voiceId || !apiKey) throw new Error("elevenlabs_not_configured");
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: String(env.ELEVENLABS_MODEL_ID || "eleven_v3"),
        // v3 รับ stability 0.0 / 0.5 / 1.0 — 1.0 (Robust) เสียงนิ่งเหมาะบทอาจารย์
        voice_settings: { stability: 1.0 },
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`elevenlabs_${res.status}:${body.slice(0, 160)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * mp3 → m4a (LINE audio message รับเฉพาะ m4a) พร้อมอ่านความยาวจาก ffmpeg stderr.
 * @returns {Promise<{ m4a: Buffer, durationMs: number }>}
 */
async function convertMp3ToM4a(mp3) {
  const dir = await mkdtemp(path.join(tmpdir(), "voicenote-"));
  const inPath = path.join(dir, "in.mp3");
  const outPath = path.join(dir, "out.m4a");
  try {
    await writeFile(inPath, mp3);
    const stderr = await new Promise((resolve, reject) => {
      const p = spawn("ffmpeg", ["-y", "-i", inPath, "-c:a", "aac", "-b:a", "64k", outPath]);
      let err = "";
      p.stderr.on("data", (d) => { err += String(d); });
      p.on("error", reject);
      p.on("close", (code) =>
        code === 0 ? resolve(err) : reject(new Error(`ffmpeg_exit_${code}:${err.slice(-200)}`)),
      );
    });
    const m = /Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/.exec(String(stderr));
    const durationMs = m
      ? ((Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000 + Number(m[4]) * 10)
      : 0;
    const m4a = await readFile(outPath);
    return { m4a, durationMs };
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** @returns {Promise<string>} public HTTPS URL on R2 */
async function uploadVoiceNote(lineUserId, scanResultV2Id, m4a) {
  if (!S3_ENABLED) throw new Error("s3_not_configured");
  const uid = String(lineUserId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || "unknown";
  const rid = String(scanResultV2Id || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || Date.now().toString(36);
  const key = `voice/${uid}/${rid}.m4a`;
  await s3Client.send(
    new PutObjectCommand({
      Bucket: env.SCAN_V2_UPLOAD_BUCKET,
      Key: key,
      Body: m4a,
      ContentType: "audio/mp4",
    }),
  );
  const base = String(env.S3_UPLOAD_PUBLIC_BASE_URL || env.S3_PUBLIC_BASE_URL || "").replace(/\/$/, "");
  if (!base) throw new Error("s3_public_base_url_missing");
  return `${base}/${key}`;
}

/** ครั้งแรกในชีวิต = แถวใน scan_results_v2 ของ user นี้มีแค่แถวที่เพิ่ง insert (≤1). */
async function isFirstEverScan(lineUserId) {
  const { count, error } = await supabase
    .from("scan_results_v2")
    .select("id", { count: "exact", head: true })
    .eq("line_user_id", lineUserId);
  if (error) throw error;
  return (count ?? 0) <= 1;
}

/** จ่ายเงิน = ทุกสแกน / ฟรี = เฉพาะสแกนแรกครั้งเดียว (wow moment) / "all" ไว้เทส staging */
async function passesAudienceGate(lineUserId) {
  const audience = String(env.VOICE_NOTE_AUDIENCE || "paid_and_first_free");
  if (audience === "all") return true;
  const paidUntil = await getUserPaidUntil(lineUserId).catch(() => null);
  if (paidUntil && new Date(paidUntil).getTime() > Date.now()) return true;
  return isFirstEverScan(lineUserId).catch(() => false);
}

/**
 * ประกอบ voice note ครบเส้น (สคริปต์ → TTS → m4a → R2) ภายใต้ timeout รวม.
 * คืน null เมื่อปิด flag / ไม่ผ่าน gate / พังกลางทาง — report เดินต่อแบบไม่มีเสียง
 *
 * @param {{
 *   lineUserId: string,
 *   scanResultV2Id: string,
 *   lane: string,
 *   dedupHit?: boolean,
 *   lineSummary?: { energyScore?: number | null, mainEnergy?: string } | null,
 * }} p
 * @returns {Promise<{ url: string, durationMs: number, script: string } | null>}
 */
export async function maybeBuildScanVoiceNote(p) {
  if (!env.VOICE_NOTE_ENABLED) return null;
  if (p.dedupHit) return null; // report "เคยสแกนแล้ว" ไม่ต้องมีเสียงซ้ำ
  const t0 = Date.now();
  try {
    const allowed = await passesAudienceGate(p.lineUserId);
    if (!allowed) return null;

    const work = (async () => {
      const script = buildVoiceScript({
        score: p.lineSummary?.energyScore ?? null,
        mainEnergy: String(p.lineSummary?.mainEnergy || ""),
        lane: String(p.lane || ""),
        seed: String(p.scanResultV2Id || p.lineUserId),
      });
      const mp3 = await synthesizeMp3(script);
      const { m4a, durationMs } = await convertMp3ToM4a(mp3);
      if (!durationMs || durationMs < 500) throw new Error("duration_unreadable");
      const url = await uploadVoiceNote(p.lineUserId, p.scanResultV2Id, m4a);
      return { url, durationMs, script };
    })();

    const timeoutMs = Number(env.VOICE_NOTE_TIMEOUT_MS) || 15000;
    const out = await Promise.race([
      work,
      new Promise((_, rej) => setTimeout(() => rej(new Error("voice_note_timeout")), timeoutMs)),
    ]);
    console.log(
      JSON.stringify({
        event: "SCAN_VOICE_NOTE_BUILT",
        lineUserIdPrefix: String(p.lineUserId).slice(0, 8),
        scanResultIdPrefix: String(p.scanResultV2Id).slice(0, 8),
        durationMs: out.durationMs,
        scriptChars: out.script.length,
        elapsedMs: Date.now() - t0,
      }),
    );
    return out;
  } catch (e) {
    console.warn(
      JSON.stringify({
        event: "SCAN_VOICE_NOTE_SKIPPED",
        lineUserIdPrefix: String(p.lineUserId).slice(0, 8),
        message: String(e?.message || e).slice(0, 200),
        elapsedMs: Date.now() - t0,
      }),
    );
    return null;
  }
}
