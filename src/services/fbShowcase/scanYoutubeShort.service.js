/**
 * YouTube Shorts ต่อสแกน (กบ 29 ก.ค. 2026): การ์ดพลังงาน → คลิปแนวตั้ง 1080x1920
 * (การ์ดซูมกลาง พื้นเบลอ) + เสียงพากย์อาจารย์ (ElevenLabs เสียงโคลนกบ ตัวเดียวกับ
 * voice note ใน report) พูดตามสคริปต์แนวพลังงานที่ AI คิด + title/description/แฮชแท็กใหม่
 * → ยิงไป ener-ai (/ai/scan-short/upload, SCAN_SHORT_TOKEN) อัปขึ้นช่อง YouTube ช่องเดิม
 * ที่เชื่อม OAuth ไว้แล้ว (ช่องเดียวกับ my-ener.uk/workspace?tool=autopost)
 *
 * กติกาแคปชัน/สคริปต์เดิมครบ: ห้ามบอกประเภทวัตถุ ("ชิ้นนี้" เท่านั้น) ห้ามอวยเว่อร์
 * ห้ามการันตี ห้ามหลุดว่าเป็นระบบ/AI
 */
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { env } from "../../config/env.js";
import { tryDedupeOnce } from "../../redis/scanV2Redis.js";
import {
  getGeminiFlashModel,
  generateTextWithTimeout,
} from "../../integrations/gemini/geminiFlash.api.js";

const AUDIO_PATH = path.join(process.cwd(), "src", "brand", "audio", "daily_recap.m4a");
const FPS = 30;
const MIN_SECONDS = 8;
const MAX_SECONDS = 40;

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

const SHORT_SYSTEM = `คุณคือทีมคอนเทนต์ของอาจารย์ Ener ทำ YouTube Shorts จากผลอ่านพลังงานวัตถุมงคล 1 ชิ้น
ตอบเป็น JSON object เดียวเท่านั้น ไม่มี markdown:
{"script": string, "title": string, "description": string, "hashtags": string[]}

script (บทพูดของอาจารย์ ~4-5 ประโยค อ่านออกเสียง ~18-25 วินาที) โครงตามลำดับนี้ (กบ 29 ก.ค.):
1. เปิดด้วย "ชิ้นนี้จากคุณ{ownerFirstName}" ถ้ามีชื่อมาให้ (ไม่มีชื่อ → เปิดด้วย hook ชวนฟังแทน)
2. เล่าความเชื่อของสายพลังเด่นนั้น 1-2 ประโยค แบบที่คนสายมูถือต่อกันมา — ใช้คำว่า "เชื่อกันว่า" หรือ "คนโบราณถือกันว่า" เสมอ (เช่น เด่นเมตตา ก็เล่าความเชื่อเรื่องเมตตามหานิยม คนเอ็นดู เจรจาราบรื่น) ห้ามเล่าเป็นข้อเท็จจริง
3. พลังงานของชิ้นนี้ + คะแนน (เขียนเป็นคำอ่าน เช่น "แปดจุดห้าเต็มสิบ" ห้ามเขียน 8.5/10)
4. ปิดด้วยคำแนวพลังงาน "เด่นทางไหนดันทางนั้น" สั้น ๆ
- ภาษาพูดเป็นกันเอง โทนสุขุมแบบอาจารย์วัย 41 เขียนแบบคนพูดจริง ไม่มีอีโมจิ
title: ≤90 ตัวอักษร มี hook ชวนกด อีโมจิได้ไม่เกิน 1 ตัว
description: 2-3 บรรทัดแนวความเชื่อ+พลังงาน คิดใหม่ไม่ซ้ำกับ script ปิดท้ายชวนติดตามดูชิ้นต่อไปแบบนุ่ม ๆ
hashtags: 5-8 แท็ก เช่น #วัตถุมงคล #สายมู #พลังงาน #มูเตลู #ความเชื่อ #Shorts

กติกาเหล็กทุกฟิลด์:
- 🚫 ห้ามบอกประเภทวัตถุ (พระ หิน กำไล เครื่องราง) หรือชนิด/รุ่น/พิมพ์/เนื้อ/วัด/เกจิ — เรียก "ชิ้นนี้" เท่านั้น รวมถึงแฮชแท็ก
- ชื่อเจ้าของใช้แค่ท่อนเปิด "ชิ้นนี้จากคุณ..." ห้ามเล่าเรื่องส่วนตัวของเจ้าของ
- ห้ามอวยเว่อร์ ห้ามการันตีผล ห้ามหลุดว่าเป็นระบบอัตโนมัติ/AI
- อิงข้อมูลที่ให้เท่านั้น ห้ามมโนตัวเลข/สรรพคุณ
- ห้ามใช้ — หรือ " "`;

/**
 * @param {{ name: string, score: number, peakLabel: string, audience?: string, ownerName?: string }} p
 */
async function buildShortContent(p) {
  const openLine = p.ownerName ? `ชิ้นนี้จากคุณ${p.ownerName} ` : "";
  const fallback = {
    script: `${openLine}เชื่อกันมาแต่โบราณว่าพลังทาง${p.peakLabel}ช่วยหนุนให้ชีวิตเดินไปข้างหน้า ชิ้นนี้อ่านพลังได้${scoreThai(p.score)}เต็มสิบ เด่นทาง${p.peakLabel} เด่นทางไหนดันทางนั้นครับ`,
    title: `ชิ้นนี้พลัง${p.peakLabel} ${p.score.toFixed(1)}/10 ✨`,
    description: `เปิดผลอ่านพลังงานชิ้นเด่นวันนี้ เด่นทาง${p.peakLabel} เด่นทางไหนดันทางนั้น\nติดตามชิ้นต่อไปได้ที่ช่องนี้`,
    hashtags: ["#วัตถุมงคล", "#สายมู", "#พลังงาน", "#มูเตลู", "#Shorts"],
  };
  try {
    const model = getGeminiFlashModel({
      systemInstruction: SHORT_SYSTEM,
      temperature: 0.7,
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
        ownerFirstName: p.ownerName || "",
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

function scoreThai(score) {
  const s = (Math.round(score * 10) / 10).toFixed(1);
  const [a, b] = s.split(".");
  return b === "0" ? `${a}` : `${a}จุด${b}`;
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
      `[0:v]scale=2160:2400,zoompan=z='min(zoom+${zoomStep},1.18)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1200:fps=${FPS}[fg];` +
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

/**
 * สร้าง Shorts ของ 1 report แบบครบวงจร (ใช้ทั้ง auto hook และเทสมือ)
 * @param {{ reportPayload?: object, publicToken?: string, ownerName?: string, privacy?: string, minScore?: number }} p
 * @returns {Promise<{ ok?: boolean, message?: string, skipped?: string, content?: object }>}
 */
export async function buildAndUploadScanShort({ reportPayload, publicToken, ownerName, privacy, minScore }) {
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
  if (Number.isFinite(Number(minScore)) && data.energyScore < Number(minScore)) {
    return { skipped: "below_min_score" };
  }

  const cardPng = await renderShowcasePhotoCardPng(token, payload);
  if (!cardPng) return { skipped: "render_failed" };

  const content = await buildShortContent({
    name: data.name,
    score: data.energyScore,
    peakLabel: data.skills?.[0]?.labelFull || data.name,
    audience: data.audience,
    ownerName,
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
    // ชวนสแกน + ลิงก์ LINE (กบ 29 ก.ค. — YouTube ใส่ลิงก์ได้ ไม่โดนกดแบบ FB)
    const oaLink = String(process.env.YT_SHORT_OA_LINK || "https://lin.ee/p2sxdYFJ").trim();
    const description =
      `${content.description}\n\n` +
      `อยากรู้พลังของชิ้นที่คุณมีบ้าง ส่งรูปให้อาจารย์อ่านได้เลย 👉 ${oaLink}\n\n` +
      `${content.hashtags.join(" ")}\n\nอ่านพลังตามแนวทาง Ener ไม่ใช่คำทำนาย`;
    const res = await uploadViaEnerAi({
      mp4Path: short.mp4Path,
      title: content.title,
      description,
      tags: content.hashtags,
      privacy,
    });
    return { ...res, content };
  } finally {
    await short.cleanup();
  }
}

/**
 * ทุกสแกนที่ทำการ์ดได้ → Shorts ขึ้นช่อง YouTube (fire-and-forget จาก deliverOutbound)
 * @param {{ lineUserId?: string, reportPayload?: object, publicToken?: string }} p
 */
export async function maybeAutoPostScanShort({ lineUserId, reportPayload, publicToken }) {
  try {
    if (!shortEnabled()) return { skipped: "disabled" };
    if (!shortConfigured()) return { skipped: "not_configured" };
    const token = String(publicToken || "").trim();
    if (!token) return { skipped: "no_token" };
    const first = await tryDedupeOnce(`scan_v2:scan_short_yt:${token}`, 45 * 86400);
    if (!first) return { skipped: "already_posted" };

    let ownerName = "";
    if (lineUserId) {
      try {
        const { getAppUserByLineUserId } = await import("../../stores/users.db.js");
        const u = await getAppUserByLineUserId(lineUserId);
        ownerName = String(u?.display_name || "").replace(/\s+/g, " ").trim().slice(0, 40);
      } catch {
        /* ignore */
      }
    }

    // เฉพาะชิ้นเกรดสวย (กบเคาะ 29 ก.ค. — คุมเครดิตเสียง ElevenLabs + คุณภาพช่อง)
    const minScoreN = Number(process.env.SCAN_YT_SHORT_MIN_SCORE);
    const minScore = Number.isFinite(minScoreN) ? minScoreN : 7.5;
    const res = await buildAndUploadScanShort({
      reportPayload,
      publicToken: token,
      ownerName,
      minScore,
    });
    console.log(
      JSON.stringify({
        event: res.ok ? "SCAN_YT_SHORT_POSTED" : "SCAN_YT_SHORT_FAILED",
        tokenPrefix: token.slice(0, 10),
        message: String(res.message || res.skipped || "").slice(0, 160),
      }),
    );
    if (res.ok) {
      const { sendTelegramText } = await import("../telegramNotify.service.js");
      void sendTelegramText(`ลง YouTube แล้ว: ${String(res.message || "").replace(/^.*(https:\/\/youtu\.be\/\S+).*$/, "$1")}`).catch(() => {});
    }
    return res;
  } catch (e) {
    console.log(
      JSON.stringify({
        event: "SCAN_YT_SHORT_ERROR",
        message: String(e?.message || e).slice(0, 200),
      }),
    );
    return { error: true };
  }
}
