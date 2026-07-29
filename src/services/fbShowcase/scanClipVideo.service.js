/**
 * คลิปซูม 5 วิต่อสแกน → auto post เพจ Facebook ทุกชิ้น (กบ 29 ก.ค. 2026 —
 * "ทุกรายการ Auto post VDO ยาว 5 วิ เอาแค่ 1 report ภาพแบบ Zoom" แทนวิดีโอสรุปรายวัน)
 *
 * การ์ดพลังงานของ report → ffmpeg zoompan (Ken Burns ซูมเข้าช้า ๆ) + เพลงกบ 5 วิ
 * → mp4 → โพสต์เพจพร้อมแคปชันแนวพลังงาน (กติกาเดิม: ไม่ระบุชนิดพระ ไม่อวย ไม่มีลิงก์)
 * วิดีโอเป็นฟอร์แมตที่ FB ไม่กด reach — เหตุผลที่กบเลือกทางนี้
 * ทั้งหมดฟรี: ffmpeg ในเครื่อง + Graph API ไม่มีค่าใช้จ่าย
 */
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { tryDedupeOnce } from "../../redis/scanV2Redis.js";
import { isFbPageConfigured, postPageVideo } from "../../integrations/facebook/facebookPage.api.js";

const AUDIO_PATH = path.join(process.cwd(), "src", "brand", "audio", "daily_recap.m4a");
const CLIP_SECONDS = 5;
const FPS = 30;

function clipEnabled() {
  return (
    String(process.env.SCAN_CLIP_FB_ENABLED ?? "true").trim().toLowerCase() !== "false"
  );
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

/**
 * การ์ด png → mp4 ซูมเข้าช้า ๆ 5 วิ + เพลง
 * เฟรมแนวนอน 1920x1080 (กบ 29 ก.ค. — คลิปแนวตั้งสั้นโดน FB จับเป็น Reel ไม่ขึ้นไทม์ไลน์เพจ
 * แนวนอนขึ้นเป็นโพสต์วิดีโอปกติ) — การ์ดซูมอยู่กลาง พื้นหลังการ์ดเบลอเต็มจอ
 * upscale 2 เท่าก่อน zoompan กันภาพสั่น (zoompan ปัดพิกัดเป็นจำนวนเต็ม)
 * @param {Buffer} cardPngBuffer
 * @returns {Promise<{ mp4Path: string, cleanup: () => Promise<void> }>}
 */
export async function renderScanZoomClip(cardPngBuffer) {
  const dir = await mkdtemp(path.join(tmpdir(), "clip-"));
  const imgPath = path.join(dir, "card.png");
  await writeFile(imgPath, cardPngBuffer);
  const mp4Path = path.join(dir, "clip.mp4");
  const frames = CLIP_SECONDS * FPS;
  await runFfmpeg([
    "-y", "-v", "error",
    "-loop", "1", "-i", imgPath,
    "-i", AUDIO_PATH,
    "-filter_complex",
    `[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,boxblur=24[bg];` +
      `[0:v]scale=2160:2400,zoompan=z='min(zoom+0.0012,1.18)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=972x1080:fps=${FPS}[fg];` +
      `[bg][fg]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v]`,
    "-map", "[v]", "-map", "1:a",
    "-t", String(CLIP_SECONDS),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    mp4Path,
  ]);
  return {
    mp4Path,
    cleanup: () => rm(dir, { recursive: true, force: true }).catch(() => {}),
  };
}

/**
 * ทุกสแกนที่ทำการ์ดได้ → คลิปซูม 5 วิ → โพสต์เพจ FB ทันที
 * fire-and-forget จาก deliverOutbound · dedupe ต่อ token
 * @param {{ lineUserId?: string, reportPayload?: object, publicToken?: string }} p
 */
export async function maybeAutoPostScanClip({ lineUserId, reportPayload, publicToken }) {
  try {
    if (!clipEnabled()) return { skipped: "disabled" };
    if (!isFbPageConfigured()) return { skipped: "fb_not_configured" };
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

    const first = await tryDedupeOnce(`scan_v2:scan_clip_fb:${token}`, 45 * 86400);
    if (!first) return { skipped: "already_posted" };

    const cardPng = await renderShowcasePhotoCardPng(token, payload);
    if (!cardPng) return { skipped: "render_failed" };

    const { buildCaption } = await import("./fbShowcase.service.js");
    const caption = await buildCaption({
      token,
      name: data.name,
      energyScore: data.energyScore,
      peakLabel: data.skills?.[0]?.labelFull || data.name,
    });

    // เครดิตเจ้าของชิ้นนำหน้าแคปชัน (กบ 29 ก.ค. — "ชิ้นนี้จากคุณ ...") · ไม่มีชื่อ = ละไว้
    let ownerLine = "";
    if (lineUserId) {
      try {
        const { getAppUserByLineUserId } = await import("../../stores/users.db.js");
        const u = await getAppUserByLineUserId(lineUserId);
        const dn = String(u?.display_name || "").replace(/\s+/g, " ").trim().slice(0, 40);
        if (dn) ownerLine = `ชิ้นนี้จากคุณ ${dn}\n\n`;
      } catch {
        /* ignore */
      }
    }

    const clip = await renderScanZoomClip(cardPng);
    try {
      const res = await postPageVideo(clip.mp4Path, ownerLine + caption.social, { published: true });
      console.log(
        JSON.stringify({
          event: res.ok ? "SCAN_CLIP_FB_POSTED" : "SCAN_CLIP_FB_FAILED",
          tokenPrefix: token.slice(0, 10),
          lane: data.lane,
          ...(res.ok ? { videoIdPrefix: String(res.videoId || "").slice(0, 12) } : { error: res.error }),
        }),
      );
      return { posted: res.ok };
    } finally {
      await clip.cleanup();
    }
  } catch (e) {
    console.log(
      JSON.stringify({
        event: "SCAN_CLIP_FB_ERROR",
        message: String(e?.message || e).slice(0, 200),
      }),
    );
    return { error: true };
  }
}
