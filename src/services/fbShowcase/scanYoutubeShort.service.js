/**
 * YouTube Shorts จากผลสแกน (กบ 29-30 ก.ค. 2026 — แผน docs/ai/plans/ener-youtube-channel.md)
 *
 * โครงใหม่ (เฟส 1 — กบเคาะ "ลุยตามนี้" 30 ก.ค.):
 * - คัดวันละ ~3 คลิป (sweep 3 รอบ/วัน เลือกชิ้นเด่นสุดของช่วง สายพลังไม่ซ้ำคลิпก่อน)
 *   แทนการยิงทุกชิ้น ≥7.5 — ลดความเสี่ยง repetitive content + คุมเครดิตเสียง
 * - S-Alert: เกรด S (≥8.9) โผล่เมื่อไหร่ → คลิปพิเศษทันที ไม่รอรอบ
 * - Hook 2 วิแรกสุ่ม 6 แนว (ห้ามเปิดด้วยชื่อลูกค้า) + CTA ปิดท้ายสุ่ม 3 แบบ
 * - ชื่อลูกค้าบนคลิป = ชื่อย่อ "คุณ T." (privacy) + แจ้งลูกค้าใน LINE เมื่อคลิปขึ้น (เขาแชร์ต่อเอง)
 * - เสียงพากย์ ElevenLabs เสียงโคลนกบ (config เดียวกับ voice note) mix เพลงเบา
 * - อัปผ่าน ener-ai (/ai/scan-short/upload, SCAN_SHORT_TOKEN) ช่อง "Ener scan พลัง"
 *
 * กติกาเหล็กเดิมครบ: "ชิ้นนี้" เท่านั้น ห้ามอวย ห้ามการันตี ห้ามหลุด AI ความเชื่อ = "เชื่อกันว่า"
 */
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { env } from "../../config/env.js";
import { supabase } from "../../config/supabase.js";
import {
  tryDedupeOnce,
  getValue,
  setValueWithTtl,
} from "../../redis/scanV2Redis.js";
import {
  getGeminiFlashModel,
  generateTextWithTimeout,
} from "../../integrations/gemini/geminiFlash.api.js";

const AUDIO_PATH = path.join(process.cwd(), "src", "brand", "audio", "daily_recap.m4a");
const FPS = 30;
const MIN_SECONDS = 8;
const MAX_SECONDS = 40;
const S_GRADE_MIN_SCORE = 8.9;

function shortEnabled() {
  return (
    String(process.env.SCAN_YT_SHORT_ENABLED ?? "false").trim().toLowerCase() === "true"
  );
}
function shortConfigured() {
  return Boolean(
    String(process.env.ENER_AI_BASE_URL || "").trim() &&
      String(process.env.SCAN_SHORT_TOKEN || "").trim(),
  );
}
function minScore() {
  const n = Number(process.env.SCAN_YT_SHORT_MIN_SCORE);
  return Number.isFinite(n) ? n : 7.5;
}
function sweepHours() {
  return String(process.env.SCAN_YT_SHORT_HOURS || "8,13,19")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 23);
}

function bangkokHour(now) {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", hour12: false }).format(now),
  );
}
function bangkokDateKey(now) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

/** ชื่อย่อบนคลิป (privacy — กบเคาะ 30 ก.ค.): "สมชาย ใจดี" → "S." ตามอักษรแรก */
export function abbreviateOwnerName(displayName) {
  const dn = String(displayName || "").replace(/\s+/g, " ").trim();
  if (!dn) return "";
  const first = Array.from(dn)[0];
  return `${first}.`;
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", (d) => { err += d; });
    p.on("close", (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${cmd} exit ${code}: ${err.slice(-400)}`)),
    );
    p.on("error", reject);
  });
}

async function audioDurationSeconds(filePath) {
  const out = await run("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", filePath,
  ]);
  const n = Number(String(out).trim());
  return Number.isFinite(n) && n > 0 ? n : 15;
}

// ── สคริปต์: hook 6 แนวสุ่ม + CTA 3 แบบสุ่ม (ลดความเป็นแม่พิมพ์ — ทุก AI เตือนเรื่อง repetitive) ──

const HOOK_STYLES = [
  { key: "rarity", hint: "เปิดด้วยความหายาก เช่น 'วันนี้จากหลายสิบชิ้น มีชิ้นเดียวที่แตะระดับนี้'" },
  { key: "rank", hint: "เปิดด้วยอันดับ เช่น 'ชิ้นเด่นสุดของช่วงนี้มาแล้ว'" },
  { key: "twist", hint: "เปิดด้วยจุดผิดคาด เช่น 'คะแนนรวมระดับนี้ แต่ด้านที่เด่นสุดไม่ใช่อย่างที่คิด'" },
  { key: "question", hint: "เปิดด้วยคำถามชวนคิด เช่น 'พลังแบบไหนที่คนค้าขายตามหากันมากที่สุด'" },
  { key: "stat", hint: "เปิดด้วยตัวเลข/คะแนนทันที เช่น 'แปดจุดหกเต็มสิบ ไม่ได้เจอบ่อย'" },
  { key: "event", hint: "เปิดแบบมีเหตุการณ์ เช่น 'เพิ่งอ่านจบสด ๆ ร้อน ๆ ชิ้นนี้น่าสนใจมาก'" },
];

const CTA_STYLES = [
  { key: "follow", hint: "ชวนติดตาม: 'ติดตามไว้ พรุ่งนี้มาดูกันว่าชิ้นไหนจะเด่นสุด'" },
  { key: "scan", hint: "ชวนส่งชิ้นมาสแกน: 'อยากรู้พลังชิ้นของคุณ กดชื่อช่องแล้วแตะลิงก์แรกได้เลยครับ'" },
  { key: "join", hint: "ชวนลุ้น: 'ส่งชิ้นของคุณเข้ามา คลิปหน้าอาจเป็นชิ้นของคุณก็ได้ครับ'" },
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const SHORT_SYSTEM = `คุณคือทีมคอนเทนต์ของอาจารย์ Ener ทำ YouTube Shorts จากผลอ่านพลังงานวัตถุมงคล 1 ชิ้น
ตอบเป็น JSON object เดียวเท่านั้น ไม่มี markdown:
{"script": string, "title": string, "description": string, "hashtags": string[]}

script (บทพูดของอาจารย์ ~4-5 ประโยค อ่านออกเสียง ~18-25 วินาที) โครงตามลำดับ:
1. Hook 1 ประโยคแรกตามแนวที่กำหนดใน input (hookHint) — ⛔️ ห้ามเปิดด้วยชื่อลูกค้า ห้ามเปิดด้วย "สวัสดีครับ"
2. เครดิตเจ้าของสั้น ๆ: "ชิ้นนี้จากคุณ{ownerShort}" (ถ้า ownerShort ว่าง ให้ข้าม)
3. เล่าความเชื่อของสายพลังเด่น 1-2 ประโยค แบบที่คนสายมูถือต่อกันมา — ใช้ "เชื่อกันว่า" หรือ "คนโบราณถือกันว่า" เสมอ ห้ามเล่าเป็นข้อเท็จจริง
4. คะแนน (เขียนเป็นคำอ่าน เช่น "แปดจุดห้าเต็มสิบ" ห้ามเขียน 8.5/10) + "เด่นทางไหนดันทางนั้น"
5. ปิดด้วย CTA ตามแนวที่กำหนดใน input (ctaHint) สั้น ๆ ไม่ hard sell
- ภาษาพูดเป็นกันเอง โทนสุขุมแบบอาจารย์วัย 41 เขียนแบบคนพูดจริง ไม่มีอีโมจิ
- ถ้า input มี sAlert=true: โทนตื่นเต้นขึ้นแบบสุขุม ๆ ("ในที่สุดก็มา... เกรดเอสปรากฏแล้ว") — เกรดเอสหายากมาก
title: ≤90 ตัวอักษร มี hook ชวนกด อีโมจิได้ไม่เกิน 1 ตัว · ถ้า sAlert ให้ขึ้นต้นว่า "เกรด S มาแล้ว"
description: 2-3 บรรทัดแนวความเชื่อ+พลังงาน คิดใหม่ไม่ซ้ำกับ script ปิดท้ายชวนติดตามนุ่ม ๆ
hashtags: 5-8 แท็ก เช่น #วัตถุมงคล #สายมู #พลังงาน #มูเตลู #ความเชื่อ #Shorts

กติกาเหล็กทุกฟิลด์:
- 🚫 ห้ามบอกประเภทวัตถุ (พระ หิน กำไล เครื่องราง) หรือชนิด/รุ่น/พิมพ์/เนื้อ/วัด/เกจิ — เรียก "ชิ้นนี้" เท่านั้น รวมถึงแฮชแท็ก
- ชื่อเจ้าของใช้แค่ท่อนเครดิต ห้ามเล่าเรื่องส่วนตัวของเจ้าของ
- ห้ามอวยเว่อร์ ห้ามการันตีผล ("รวยแน่/กันภัยได้จริง/เห็นผลใน X วัน" = ห้าม) ห้ามหลุดว่าเป็นระบบอัตโนมัติ/AI
- ห้ามพูดว่าอาจารย์กำลังนั่งจับพลังสด ๆ ต่อหน้า — ใช้ "ผลอ่านของชิ้นนี้ขึ้นเด่นด้าน..."
- อิงข้อมูลที่ให้เท่านั้น ห้ามมโนตัวเลข/สรรพคุณ
- ห้ามใช้ — หรือ " "`;

function scoreThai(score) {
  const s = (Math.round(score * 10) / 10).toFixed(1);
  const [a, b] = s.split(".");
  return b === "0" ? `${a}` : `${a}จุด${b}`;
}

/**
 * @param {{ name: string, score: number, peakLabel: string, audience?: string, ownerShort?: string, sAlert?: boolean }} p
 */
async function buildShortContent(p) {
  const hook = pick(HOOK_STYLES);
  const cta = pick(CTA_STYLES);
  const credit = p.ownerShort ? `ชิ้นนี้จากคุณ${p.ownerShort} ` : "";
  const fallback = {
    script: p.sAlert
      ? `ในที่สุดก็มา เกรดเอสปรากฏแล้วครับ ${credit}เชื่อกันมาแต่โบราณว่าพลังทาง${p.peakLabel}ระดับนี้หาไม่ได้ง่าย ๆ คะแนนอ่านได้${scoreThai(p.score)}เต็มสิบ เด่นทางไหนดันทางนั้น ติดตามไว้ นาน ๆ จะเจอสักชิ้นครับ`
      : `ชิ้นเด่นของช่วงนี้มาแล้วครับ ${credit}เชื่อกันมาแต่โบราณว่าพลังทาง${p.peakLabel}ช่วยหนุนให้ชีวิตเดินไปข้างหน้า คะแนนอ่านได้${scoreThai(p.score)}เต็มสิบ เด่นทางไหนดันทางนั้น อยากรู้พลังชิ้นของคุณ กดชื่อช่องแล้วแตะลิงก์แรกได้เลยครับ`,
    title: p.sAlert
      ? `เกรด S มาแล้ว ${p.score.toFixed(1)}/10 พลัง${p.peakLabel} ✨`
      : `ชิ้นเด่นวันนี้ พลัง${p.peakLabel} ${p.score.toFixed(1)}/10`,
    description: `เปิดผลอ่านพลังงานชิ้นเด่น เด่นทาง${p.peakLabel} เด่นทางไหนดันทางนั้น\nติดตามชิ้นต่อไปได้ที่ช่องนี้`,
    hashtags: ["#วัตถุมงคล", "#สายมู", "#พลังงาน", "#มูเตลู", "#Shorts"],
  };
  try {
    const model = getGeminiFlashModel({
    callSite: "ytShortCaption",
      systemInstruction: SHORT_SYSTEM,
      temperature: 0.8,
      timeoutMs: 25000,
      maxTokens: 900,
      modelOverride: env.LLM_CONSULT_MODEL_FREE,
      cacheSystemPrompt: true,
      disableReasoning: true,
    });
    if (!model) return fallback;
    const raw = await generateTextWithTimeout(
      model,
      JSON.stringify({
        dominantPower: p.peakLabel,
        energyName: p.name,
        score: p.score,
        suitableFor: p.audience || "",
        ownerShort: p.ownerShort || "",
        sAlert: Boolean(p.sAlert),
        hookHint: hook.hint,
        ctaHint: cta.hint,
      }),
      25000,
    );
    const m = String(raw || "").match(/\{[\s\S]*\}/);
    if (!m) return fallback;
    const j = JSON.parse(m[0]);
    const clean = (s) => String(s || "").replace(/[—–]/g, " ").replace(/[“”"]/g, "").trim();
    const script = clean(j.script);
    const title = clean(j.title).slice(0, 95);
    const description = clean(j.description);
    const hashtags = Array.isArray(j.hashtags)
      ? j.hashtags.map((t) => clean(t)).filter((t) => t.startsWith("#")).slice(0, 8)
      : fallback.hashtags;
    if (script.length < 40 || !title) return fallback;
    return { script, title, description: description || fallback.description, hashtags };
  } catch {
    return fallback;
  }
}

/**
 * การ์ด png + เสียงพูด mp3 → mp4 แนวตั้ง 1080x1920 (Shorts) เพลงเบา ๆ รองพื้น
 * @param {Buffer} cardPngBuffer
 * @param {Buffer} voiceMp3Buffer
 * @returns {Promise<{ mp4Path: string, seconds: number, cleanup: () => Promise<void> }>}
 */
export async function renderYoutubeShort(cardPngBuffer, voiceMp3Buffer) {
  const dir = await mkdtemp(path.join(tmpdir(), "ytshort-"));
  const imgPath = path.join(dir, "card.png");
  const voicePath = path.join(dir, "voice.mp3");
  await writeFile(imgPath, cardPngBuffer);
  await writeFile(voicePath, voiceMp3Buffer);
  const voiceSec = await audioDurationSeconds(voicePath);
  const seconds = Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, voiceSec + 1.2));
  const frames = Math.round(seconds * FPS);
  const zoomStep = (0.18 / frames).toFixed(6);
  const mp4Path = path.join(dir, "short.mp4");
  await run("ffmpeg", [
    "-y", "-v", "error",
    "-loop", "1", "-i", imgPath,
    "-i", voicePath,
    "-stream_loop", "-1", "-i", AUDIO_PATH,
    "-filter_complex",
    `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=24[bg];` +
      `[0:v]scale=1620:1800,zoompan=z='min(zoom+${zoomStep},1.18)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1200:fps=${FPS}[fg];` +
      `[bg][fg]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v];` +
      `[1:a]apad=pad_dur=2,volume=1.0[voice];[2:a]volume=0.10[music];` +
      `[voice][music]amix=inputs=2:duration=first:dropout_transition=0[a]`,
    "-map", "[v]", "-map", "[a]",
    "-t", String(seconds),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    mp4Path,
  ]);
  return {
    mp4Path,
    seconds,
    cleanup: () => rm(dir, { recursive: true, force: true }).catch(() => {}),
  };
}

/**
 * อัปโหลดผ่าน ener-ai (ช่อง YouTube ที่เชื่อม OAuth ไว้แล้ว)
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
async function uploadViaEnerAi({ mp4Path, title, description, tags, privacy }) {
  const base = String(process.env.ENER_AI_BASE_URL || "").replace(/\/+$/, "");
  const buf = await readFile(mp4Path);
  const form = new FormData();
  form.set("video", new Blob([buf], { type: "video/mp4" }), "short.mp4");
  form.set("title", title);
  form.set("description", description);
  form.set("tags", (tags || []).map((t) => t.replace(/^#/, "")).join(","));
  if (privacy) form.set("privacy", privacy);
  const res = await fetch(`${base}/ai/scan-short/upload`, {
    method: "POST",
    headers: { "x-scan-short-token": String(process.env.SCAN_SHORT_TOKEN || "") },
    body: form,
    signal: AbortSignal.timeout(600000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, message: `ener-ai ${res.status}: ${JSON.stringify(data).slice(0, 200)}` };
  return { ok: Boolean(data.ok), message: String(data.message || "") };
}

function extractYoutubeUrl(message) {
  const m = String(message || "").match(/https:\/\/youtu\.be\/\S+/);
  return m ? m[0].replace(/[).]+$/, "") : "";
}

/** แจ้งลูกค้าใน LINE ว่าชิ้นเขาขึ้นคลิป (เขาแชร์ต่อเอง = viral loop — ไอเดีย Claude กบเคาะ 30 ก.ค.) */
async function notifyOwnerClipLive(lineUserId, youtubeUrl, sAlert) {
  const token = String(process.env.CHANNEL_ACCESS_TOKEN || "").trim();
  const uid = String(lineUserId || "").trim();
  const url = String(youtubeUrl || "").trim();
  if (!token || !uid || !url) return;
  // แชทห้ามมีอีโมจิทุกข้อความ (กติกากบ — เตือนซ้ำ 17 ส.ค. เคส Marut)
  const text = sAlert
    ? `ชิ้นของคุณได้เกรด S ระดับหายาก และตอนนี้ขึ้นคลิปพิเศษในช่อง YouTube ของอาจารย์แล้วครับ\n${url}\nกดดูแล้วแชร์ให้เพื่อน ๆ ชมได้เลยครับ`
    : `ชิ้นของคุณถูกคัดเป็นชิ้นเด่น ขึ้นคลิปในช่อง YouTube ของอาจารย์แล้วครับ\n${url}\nกดดูแล้วแชร์ต่อได้เลยครับ`;
  try {
    await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to: uid, messages: [{ type: "text", text }] }),
      signal: AbortSignal.timeout(15000),
    });
    // ลงประวัติแชทให้ AI เห็นว่าเพิ่งแจ้งเรื่องคลิป (จะได้คุยต่อถูก)
    const { insertLineConversationMessage } = await import(
      "../../stores/conversationMessages.db.js"
    );
    void insertLineConversationMessage(uid, "bot", text);
  } catch {
    /* best-effort */
  }
}

async function ownerNameForLineUser(lineUserId) {
  if (!lineUserId) return "";
  try {
    const { getAppUserByLineUserId } = await import("../../stores/users.db.js");
    const u = await getAppUserByLineUserId(lineUserId);
    let dn = String(u?.display_name || "").replace(/\s+/g, " ").trim();
    if (!dn && process.env.CHANNEL_ACCESS_TOKEN) {
      const pr = await fetch(
        `https://api.line.me/v2/bot/profile/${encodeURIComponent(lineUserId)}`,
        {
          headers: { Authorization: `Bearer ${process.env.CHANNEL_ACCESS_TOKEN}` },
          signal: AbortSignal.timeout(8000),
        },
      ).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      dn = String(pr?.displayName || "").replace(/\s+/g, " ").trim();
      if (dn) {
        const { ensureUserByLineUserId } = await import("../../stores/users.db.js");
        void ensureUserByLineUserId(lineUserId, { displayName: dn });
      }
    }
    return dn;
  } catch {
    return "";
  }
}

/**
 * สร้าง Shorts ของ 1 report แบบครบวงจร (ใช้ทั้ง S-Alert, sweep และเทสมือ)
 * @param {{ reportPayload?: object, publicToken?: string, lineUserId?: string, privacy?: string, sAlert?: boolean, notifyOwner?: boolean }} p
 * @returns {Promise<{ ok?: boolean, message?: string, url?: string, skipped?: string, content?: object, peakAxis?: string }>}
 */
export async function buildAndUploadScanShort({
  reportPayload,
  publicToken,
  lineUserId,
  privacy,
  sAlert = false,
  notifyOwner = true,
}) {
  const token = String(publicToken || "").trim();
  if (!token) return { skipped: "no_token" };
  const { deriveShowcaseCardData, renderShowcasePhotoCardPng } = await import(
    "./showcasePhotoCard.service.js"
  );
  let payload = reportPayload;
  let data = deriveShowcaseCardData(payload);
  if (!data) {
    const { getScanResultPayloadByPublicToken } = await import(
      "../../stores/scanV2/scanResultsV2.db.js"
    );
    payload = await getScanResultPayloadByPublicToken(token);
    data = deriveShowcaseCardData(payload);
  }
  if (!data) return { skipped: "not_eligible" };

  const cardPng = await renderShowcasePhotoCardPng(token, payload);
  if (!cardPng) return { skipped: "render_failed" };

  const ownerFull = await ownerNameForLineUser(lineUserId);
  const content = await buildShortContent({
    name: data.name,
    score: data.energyScore,
    peakLabel: data.skills?.[0]?.labelFull || data.name,
    audience: data.audience,
    ownerShort: abbreviateOwnerName(ownerFull),
    sAlert,
  });

  const { synthesizeMp3, getVoiceNoteConfig } = await import(
    "../voiceNote/scanVoiceNote.service.js"
  );
  const vc = await getVoiceNoteConfig();
  const voiceMp3 = await synthesizeMp3(content.script, {
    voiceId: vc.voiceId,
    speed: vc.speed,
    modelId: vc.modelId,
  });

  const short = await renderYoutubeShort(cardPng, voiceMp3);
  try {
    // ลิงก์ใน description ของ Shorts กดไม่ได้ — CTA จริงคือลิงก์แรกหน้าช่อง (ยังใส่ไว้เผื่อคนดูบนเดสก์ท็อป)
    const oaLink = String(process.env.YT_SHORT_OA_LINK || "https://lin.ee/p2sxdYFJ").trim();
    const description =
      `${content.description}\n\n` +
      `อยากรู้พลังของชิ้นที่คุณมี กดชื่อช่องแล้วแตะลิงก์แรก หรือ 👉 ${oaLink}\n\n` +
      `${content.hashtags.join(" ")}\n\n` +
      `อ่านตามแนวความเชื่อ ไม่รับรองผล ไม่ใช้ตัดสินแท้เก๊หรือมูลค่า`;
    const res = await uploadViaEnerAi({
      mp4Path: short.mp4Path,
      title: content.title,
      description,
      tags: content.hashtags,
      privacy,
    });
    const url = extractYoutubeUrl(res.message);
    if (res.ok && notifyOwner && lineUserId && url && privacy !== "unlisted" && privacy !== "private") {
      void notifyOwnerClipLive(lineUserId, url, sAlert);
    }
    return {
      ...res,
      url,
      content,
      peakAxis: data.skills?.[0]?.labelFull || data.name,
    };
  } finally {
    await short.cleanup();
  }
}

/**
 * Hook ต่อสแกน (จาก deliverOutbound): เฉพาะ S-Alert — เกรด S โผล่ = คลิปพิเศษทันที
 * ชิ้นอื่นปล่อยให้ sweep รายรอบคัดเอง
 * @param {{ lineUserId?: string, reportPayload?: object, publicToken?: string }} p
 */
export async function maybeAutoPostScanShort({ lineUserId, reportPayload, publicToken }) {
  try {
    if (!shortEnabled() || !shortConfigured()) return { skipped: "disabled" };
    const token = String(publicToken || "").trim();
    if (!token) return { skipped: "no_token" };

    const { deriveShowcaseCardData } = await import("./showcasePhotoCard.service.js");
    const data = deriveShowcaseCardData(reportPayload);
    if (!data || data.energyScore < S_GRADE_MIN_SCORE) return { skipped: "not_s_grade" };

    const first = await tryDedupeOnce(`scan_v2:scan_short_yt:${token}`, 45 * 86400);
    if (!first) return { skipped: "already_posted" };

    const res = await buildAndUploadScanShort({
      reportPayload,
      publicToken: token,
      lineUserId,
      sAlert: true,
    });
    console.log(
      JSON.stringify({
        event: res.ok ? "SCAN_YT_S_ALERT_POSTED" : "SCAN_YT_S_ALERT_FAILED",
        tokenPrefix: token.slice(0, 10),
        message: String(res.message || res.skipped || "").slice(0, 160),
      }),
    );
    if (res.ok) {
      const { sendTelegramText } = await import("../telegramNotify.service.js");
      void sendTelegramText(`🚨 S-Alert ขึ้น YouTube แล้ว: ${res.url}`).catch(() => {});
    }
    return res;
  } catch (e) {
    console.log(
      JSON.stringify({ event: "SCAN_YT_S_ALERT_ERROR", message: String(e?.message || e).slice(0, 200) }),
    );
    return { error: true };
  }
}

/**
 * Sweep รายรอบ (เรียกทุกนาทีจาก maintenanceWorker, ยิงจริงตามชั่วโมงใน SCAN_YT_SHORT_HOURS):
 * เลือกชิ้นเด่นสุดของช่วงที่ผ่านมา (≥ minScore, ข้าม S ที่ยิงไปแล้ว, สายพลังไม่ซ้ำคลิปก่อน)
 * → 1 คลิป/รอบ = ~3 คลิป/วัน
 */
export async function runYoutubeShortSweep(now = new Date()) {
  try {
    if (!shortEnabled() || !shortConfigured()) return { skipped: "disabled" };
    const hours = sweepHours();
    const h = bangkokHour(now);
    if (!hours.includes(h)) return { skipped: "not_hour" };
    const slotKey = `scan_v2:yt_short_slot:${bangkokDateKey(now)}:${h}`;
    const first = await tryDedupeOnce(slotKey, 20 * 3600);
    if (!first) return { skipped: "slot_done" };

    // หน้าต่างมองย้อน: ถึงรอบก่อนหน้า (รอบแรกของวันมองย้อนถึงรอบสุดท้ายเมื่อวาน)
    const sorted = [...hours].sort((a, b) => a - b);
    const idx = sorted.indexOf(h);
    const prevHour = idx > 0 ? sorted[idx - 1] : sorted[sorted.length - 1] - 24;
    const windowMs = (h - prevHour) * 3600e3;
    const sinceIso = new Date(now.getTime() - windowMs).toISOString();

    const { data: rows, error } = await supabase
      .from("scan_results_v2")
      .select("html_public_token, report_payload_json, line_user_id")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(120);
    if (error) throw error;

    const { deriveShowcaseCardData } = await import("./showcasePhotoCard.service.js");
    const seen = new Set();
    const candidates = [];
    for (const r of rows || []) {
      if (r.report_payload_json?.precheckMode) continue; // เช็คก่อนเช่า — ไม่เอาลงคลิป
      const d = deriveShowcaseCardData(r.report_payload_json);
      if (!d || d.energyScore < minScore()) continue;
      if (d.energyScore >= S_GRADE_MIN_SCORE) continue; // S มีคลิปพิเศษของตัวเองแล้ว
      const key = `${d.name}|${d.energyScore}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ r, d, axis: d.skills?.[0]?.labelFull || d.name });
    }
    if (!candidates.length) {
      console.log(JSON.stringify({ event: "SCAN_YT_SWEEP_EMPTY", hour: h }));
      return { skipped: "no_candidates" };
    }
    candidates.sort((a, b) => b.d.energyScore - a.d.energyScore);

    // สายพลังไม่ซ้ำคลิปก่อน (ถ้ามีตัวเลือก) + ข้ามชิ้นที่เคยลงแล้ว
    const lastAxis = (await getValue("scan_v2:yt_last_axis").catch(() => "")) || "";
    const ordered = [
      ...candidates.filter((c) => c.axis !== lastAxis),
      ...candidates.filter((c) => c.axis === lastAxis),
    ];
    for (const c of ordered) {
      const token = String(c.r.html_public_token || "").trim();
      if (!token) continue;
      const fresh = await tryDedupeOnce(`scan_v2:scan_short_yt:${token}`, 45 * 86400);
      if (!fresh) continue;
      const res = await buildAndUploadScanShort({
        reportPayload: c.r.report_payload_json,
        publicToken: token,
        lineUserId: c.r.line_user_id,
      });
      console.log(
        JSON.stringify({
          event: res.ok ? "SCAN_YT_SWEEP_POSTED" : "SCAN_YT_SWEEP_FAILED",
          hour: h,
          tokenPrefix: token.slice(0, 10),
          axis: c.axis,
          message: String(res.message || res.skipped || "").slice(0, 160),
        }),
      );
      if (res.ok) {
        await setValueWithTtl("scan_v2:yt_last_axis", c.axis, 7 * 86400).catch(() => {});
        const { sendTelegramText } = await import("../telegramNotify.service.js");
        void sendTelegramText(`ลง YouTube แล้ว (รอบ ${h}:00): ${res.url}`).catch(() => {});
        return { posted: true, url: res.url };
      }
      return res; // อัปพลาด — อย่าไล่เผาเครดิตเสียงกับตัวถัดไปในรอบเดียวกัน
    }
    return { skipped: "all_already_posted" };
  } catch (e) {
    console.log(
      JSON.stringify({ event: "SCAN_YT_SWEEP_ERROR", message: String(e?.message || e).slice(0, 200) }),
    );
    return { error: true };
  }
}
