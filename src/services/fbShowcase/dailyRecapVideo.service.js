/**
 * วิดีโอสรุปรายวัน (กบ 29 ก.ค. 2026): เอาการ์ดพลังงานของชิ้นที่สแกนวันนี้มาต่อกัน
 * เป็นสไลด์วิดีโอ + เพลงประกอบ (src/brand/audio/daily_recap.m4a — เพลงของกบ)
 * → auto post ขึ้นเพจ Facebook ทุก 17:00 (วิดีโอไม่โดน FB ลดการมองเห็นแบบรูป/ลิงก์)
 * + แคปชัน AI แนวพลังงานสรุปวัน (กติกาเดิม: ห้ามหลุด AI ห้ามอวยเว่อร์ ห้ามระบุชนิดพระ)
 *
 * ใช้ ffmpeg ที่มีใน container อยู่แล้ว · การ์ด render ในโปรเซส (ไม่ยิง HTTP)
 */
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { supabase } from "../../config/supabase.js";
import { tryDedupeOnce } from "../../redis/scanV2Redis.js";
import {
  deriveShowcaseCardData,
  renderShowcasePhotoCardPng,
} from "./showcasePhotoCard.service.js";
import { isFbPageConfigured, postPageVideo, getPostPermalink } from "../../integrations/facebook/facebookPage.api.js";
import { sendTelegramText, sendTelegramVideo } from "../telegramNotify.service.js";
import {
  getGeminiFlashModel,
  generateTextWithTimeout,
} from "../../integrations/gemini/geminiFlash.api.js";
import { env } from "../../config/env.js";

const AUDIO_PATH = path.join(process.cwd(), "src", "brand", "audio", "daily_recap.m4a");
const SECONDS_PER_CARD = 2.8;
const MAX_CARDS = 10;
const MIN_CARDS = 3;

const RECAP_HOUR_BKK = (() => {
  const n = Number(process.env.DAILY_RECAP_VIDEO_HOUR);
  return Number.isFinite(n) && n >= 0 && n <= 23 ? Math.floor(n) : 17;
})();

function recapEnabled() {
  return (
    String(process.env.DAILY_RECAP_VIDEO_ENABLED ?? "true").trim().toLowerCase() !== "false"
  );
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
/** เที่ยงคืนไทยของวันนี้ (UTC ISO) */
function bangkokDayStartUtcIso(now) {
  return new Date(`${bangkokDateKey(now)}T00:00:00+07:00`).toISOString();
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => { err += d; });
    p.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${err.slice(-400)}`)),
    );
    p.on("error", reject);
  });
}

/** รวบชิ้นของวันนี้ (การ์ดทำได้ + ไม่ซ้ำ) เรียงคะแนนสูงสุด */
async function collectTodayPieces(now) {
  const { data: rows, error } = await supabase
    .from("scan_results_v2")
    .select("html_public_token, report_payload_json, created_at")
    .gte("created_at", bangkokDayStartUtcIso(now))
    .order("created_at", { ascending: false })
    .limit(120);
  if (error) throw error;
  const seen = new Set();
  const pieces = [];
  for (const r of rows || []) {
    const d = deriveShowcaseCardData(r.report_payload_json);
    if (!d) continue;
    const key = `${d.name}|${d.energyScore}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pieces.push({ token: r.html_public_token, payload: r.report_payload_json, data: d });
  }
  pieces.sort((a, b) => b.data.energyScore - a.data.energyScore);
  return pieces.slice(0, MAX_CARDS);
}

/** สร้าง mp4 จากการ์ด + เพลง → คืน { mp4Path, cleanup, count, topAxis, bestScore } */
export async function buildDailyRecapVideo(now = new Date(), piecesOverride = null) {
  const pieces = piecesOverride || (await collectTodayPieces(now));
  if (pieces.length < MIN_CARDS) return { skipped: "not_enough_pieces", count: pieces.length };

  const dir = await mkdtemp(path.join(tmpdir(), "recap-"));
  const listLines = [];
  let i = 0;
  for (const p of pieces) {
    const buf = await renderShowcasePhotoCardPng(p.token, p.payload);
    if (!buf) continue;
    i += 1;
    const img = path.join(dir, `img_${String(i).padStart(2, "0")}.png`);
    await writeFile(img, buf);
    listLines.push(`file '${img}'`);
    listLines.push(`duration ${SECONDS_PER_CARD}`);
  }
  if (i < MIN_CARDS) {
    await rm(dir, { recursive: true, force: true });
    return { skipped: "render_failed", count: i };
  }
  // concat demuxer ต้องซ้ำไฟล์สุดท้าย (ไม่งั้นเฟรมท้ายหาย)
  listLines.push(listLines[listLines.length - 2]);
  const listPath = path.join(dir, "list.txt");
  await writeFile(listPath, listLines.join("\n"));

  const mp4Path = path.join(dir, "recap.mp4");
  await runFfmpeg([
    "-y", "-v", "error",
    "-f", "concat", "-safe", "0", "-i", listPath,
    "-i", AUDIO_PATH,
    "-vf", "scale=1080:1200,format=yuv420p",
    "-r", "30",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
    "-c:a", "aac", "-b:a", "128k",
    "-shortest", "-movflags", "+faststart",
    mp4Path,
  ]);

  // สายเด่นของวัน = แกนเด่นที่พบบ่อยสุดในชุด
  const axisCount = new Map();
  for (const p of pieces) {
    const k = p.data.skills?.[0]?.labelFull || p.data.name;
    axisCount.set(k, (axisCount.get(k) || 0) + 1);
  }
  const topAxis = [...axisCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  return {
    mp4Path,
    cleanup: () => rm(dir, { recursive: true, force: true }).catch(() => {}),
    count: i,
    topAxis,
    bestScore: pieces[0]?.data.energyScore ?? null,
  };
}

const RECAP_CAPTION_SYSTEM = `คุณคือแอดมินเพจ Ener เขียนแคปชันวิดีโอสรุปประจำวัน (รวมการ์ดพลังงานของชิ้นที่อ่านวันนี้)
กติกา:
- ภาษาไทย 2-3 บรรทัด เปิดด้วย hook ชวนดู แล้วเล่าภาพรวมของวัน (จำนวนชิ้น สายพลังที่เด่นของวัน)
- โทนสุขุมแบบอาจารย์ ไม่อวยเว่อร์ ไม่การันตีผล ห้ามหลุดว่าเป็นระบบอัตโนมัติ
- อิงข้อมูลที่ให้เท่านั้น ห้ามมโนตัวเลข/สรรพคุณ
- 🚫 ห้ามระบุชนิด/รุ่น/พิมพ์พระเฉพาะ ห้ามระบุเนื้อ/วัด/เกจิ
- ห้ามใช้ — หรือ " " · อีโมจิได้ไม่เกิน 1 ตัว
ตอบเป็นเนื้อแคปชันล้วน ไม่ต้องมีแฮชแท็ก (ระบบเติมเอง)`;

async function buildRecapCaption({ count, topAxis, bestScore }) {
  let body = "";
  try {
    const model = getGeminiFlashModel({
      systemInstruction: RECAP_CAPTION_SYSTEM,
      temperature: 0.7,
      timeoutMs: 20000,
      maxTokens: 400,
      modelOverride: env.LLM_CONSULT_MODEL_FREE,
      cacheSystemPrompt: true,
      disableReasoning: true,
    });
    if (model) {
      const raw = await generateTextWithTimeout(
        model,
        JSON.stringify({ piecesToday: count, dominantPower: topAxis, bestScore }),
        20000,
      );
      body = String(raw || "").replace(/[—–]/g, " ").replace(/[“”"]/g, "").trim().slice(0, 500);
    }
  } catch {
    body = "";
  }
  if (!body || body.length < 20) {
    body = `เปิดคลังวันนี้ อาจารย์อ่านพลังไป ${count} ชิ้น สายที่เด่นของวันคือ${topAxis} ครับ`;
  }
  return `${body}\n\n#พระเครื่อง #เครื่องราง #สายมู #EnerScan\n\nอ่านพลังตามแนวทาง Ener ไม่ใช่คำทำนาย`;
}

/** เรียกทุกนาทีจาก maintenanceWorker — ยิงจริงวันละครั้งตอน 17:00 */
export async function runDailyRecapVideoSweep(now = new Date()) {
  if (!recapEnabled()) return { skipped: "disabled" };
  if (bangkokHour(now) !== RECAP_HOUR_BKK) return { skipped: "not_hour" };
  const doneKey = `scan_v2:daily_recap_video:${bangkokDateKey(now)}`;
  const first = await tryDedupeOnce(doneKey, 20 * 3600);
  if (!first) return { skipped: "done_today" };

  try {
    const video = await buildDailyRecapVideo(now);
    if (video.skipped) {
      console.log(JSON.stringify({ event: "DAILY_RECAP_SKIPPED", reason: video.skipped, count: video.count }));
      return video;
    }
    const caption = await buildRecapCaption(video);

    let posted = false;
    let permalink = "";
    if (isFbPageConfigured()) {
      const res = await postPageVideo(video.mp4Path, caption, { published: true });
      posted = res.ok;
      if (res.ok && res.videoId) {
        permalink = await getPostPermalink(res.videoId).catch(() => "");
      }
      if (!res.ok) {
        console.log(JSON.stringify({ event: "DAILY_RECAP_FB_FAILED", error: res.error }));
      }
    }
    // ส่งสำเนาเข้า Telegram กบเสมอ (ดูได้ทันทีว่าวันนี้โพสต์อะไร)
    await sendTelegramVideo(
      video.mp4Path,
      `วิดีโอสรุปวันนี้ (${video.count} ชิ้น)${posted ? " โพสต์ขึ้นเพจแล้ว" : " ยังไม่ได้โพสต์เพจ"}`,
    ).catch(() => {});
    await sendTelegramText(
      `แคปชันที่ใช้:\n${caption}${permalink ? `\n\nลิงก์โพสต์: ${permalink}` : ""}`,
    ).catch(() => {});
    await video.cleanup();
    console.log(
      JSON.stringify({ event: "DAILY_RECAP_DONE", count: video.count, fbPosted: posted }),
    );
    return { posted, count: video.count };
  } catch (e) {
    console.log(
      JSON.stringify({ event: "DAILY_RECAP_ERROR", message: String(e?.message || e).slice(0, 200) }),
    );
    return { error: true };
  }
}
