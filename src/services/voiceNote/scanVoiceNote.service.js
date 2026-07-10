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
import { getAppSetting } from "../../stores/appSettings.db.js";

/**
 * ค่าที่ปรับได้จากหน้า /admin/voice (app_settings key "voice_note") — มีผลสด
 * ไม่ต้อง restart; ค่าที่ไม่ได้ตั้งถอยไปใช้ env.
 * @returns {Promise<{ enabled: boolean, audience: string, voiceId: string, speed: number, modelId: string }>}
 */
export async function getVoiceNoteConfig() {
  const raw = await getAppSetting("voice_note").catch(() => null);
  const v = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  const speedN = Number(v.speed);
  return {
    enabled: typeof v.enabled === "boolean" ? v.enabled : env.VOICE_NOTE_ENABLED,
    audience: String(v.audience || env.VOICE_NOTE_AUDIENCE),
    voiceId: String(v.voiceId || env.ELEVENLABS_VOICE_ID),
    speed:
      Number.isFinite(speedN) && speedN >= 0.7 && speedN <= 1.2
        ? speedN
        : env.ELEVENLABS_SPEED,
    modelId: String(v.modelId || env.ELEVENLABS_MODEL_ID),
  };
}

/**
 * สคริปต์พูด ~12-16 วิ จากข้อมูลจริงใน report — deterministic (ไม่ใช้ LLM)
 * โครงสุดท้ายที่กบเคาะ: คะแนนพลัง → พลังเด่นอะไร → เข้ากับคุณสุดพลังอะไร → รายงาน
 * (topPower/fitPower = คู่เดียวกับที่การ์ด flex โชว์ "เด่นสุด X · รอง Y")
 * @param {{ score: number | null, topPower: string, fitPower?: string, compatibility?: number | null, lane: string, seed: string }} p
 */
export function buildVoiceScript({ score, topPower, fitPower, compatibility, lane, seed }) {
  const piece = lane === "sacred_amulet" ? "องค์นี้" : "ชิ้นนี้";
  const scoreTxt =
    typeof score === "number" && Number.isFinite(score)
      ? String(Math.round(score * 10) / 10).replace(/\.0$/, "")
      : "";
  const top = String(topPower || "").trim();
  const fit = String(fitPower || "").trim();
  const compatTxt =
    typeof compatibility === "number" && Number.isFinite(compatibility) && compatibility > 0
      ? String(Math.round(compatibility))
      : "";

  let h = 0;
  const s = String(seed || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;

  if (scoreTxt && top) {
    // พลังเด่นกับตัวที่เข้ากับคุณเป็นด้านเดียวกัน → พูดรวบ ไม่ทวนคำเดิมสองรอบ
    const same = Boolean(fit) && fit === top;
    // ไม่มีตัว "เข้ากับคุณสุด" → ถอยไปบอก % ความเข้ากับดวงแทน
    const fit1 = same
      ? " และด้านนี้แหละ... เข้ากับคุณที่สุดด้วย,"
      : fit
        ? ` ส่วนที่เข้ากับคุณสุด... ${fit},`
        : compatTxt
          ? ` เข้ากับดวงคุณ, ${compatTxt} เปอร์เซ็นต์,`
          : "";
    const fit2 = same
      ? " ซึ่งเข้ากับดวงคุณสุดด้วย,"
      : fit
        ? ` ที่เข้ากับดวงคุณสุด, ${fit},`
        : compatTxt
          ? ` เข้ากับดวงคุณ, ${compatTxt} เปอร์เซ็นต์,`
          : "";
    const fit3 = same
      ? " แล้วก็ด้านนี้เลย, ที่เข้ากับคุณสุด,"
      : fit
        ? ` เข้ากับคุณสุดคือ, ${fit},`
        : compatTxt
          ? ` ดวงคุณกับ${piece}, เข้ากัน ${compatTxt} เปอร์เซ็นต์,`
          : "";
    const fit4 = same
      ? " และหนุนดวงคุณตรงด้านนี้ที่สุด,"
      : fit
        ? ` ตัวที่หนุนดวงคุณสุด, ${fit},`
        : compatTxt
          ? ` ความเข้ากับดวงคุณ, ${compatTxt} เปอร์เซ็นต์,`
          : "";
    const variants = [
      `${piece}... คะแนนพลัง, อยู่ที่ ${scoreTxt} เต็มสิบ, พลังเด่น, ${top},${fit1} รายละเอียดทั้งหมด, อยู่ในรายงาน`,
      `ดูให้แล้ว... ${piece}, คะแนนพลัง, ${scoreTxt} เต็มสิบ, เด่นเรื่อง, ${top},${fit2} ที่เหลือทั้งหมด, เปิดดูในรายงาน`,
      `บอกเลย... ${piece}, พลังได้, ${scoreTxt} เต็มสิบ, เด่นสุดคือ, ${top},${fit3} รายละเอียด, อยู่ในรายงานครบ`,
      `${piece}... อาจารย์ดูแล้ว, คะแนน, ${scoreTxt} เต็มสิบ, พลังเด่น, ${top},${fit4} ลึกกว่านี้, ไปอ่านในรายงาน`,
    ];
    return variants[h % variants.length];
  }
  const compatLine = compatTxt
    ? ` ส่วนความเข้ากับดวงคุณ... อยู่ที่ ${compatTxt} เปอร์เซ็นต์,`
    : "";
  if (scoreTxt) {
    return `${piece}... คะแนนพลัง, อยู่ที่ ${scoreTxt} เต็มสิบ,${compatLine} รายละเอียดทั้งหมด, อยู่ในรายงาน`;
  }
  return `${piece}... อาจารย์ดูให้เรียบร้อยแล้ว, รายละเอียดทั้งหมด, อยู่ในรายงาน`;
}

/**
 * @param {string} text
 * @param {{ voiceId?: string, speed?: number, modelId?: string }} [opts]
 * @returns {Promise<Buffer>} mp3 audio from ElevenLabs
 */
export async function synthesizeMp3(text, opts = {}) {
  const voiceId = String(opts.voiceId || env.ELEVENLABS_VOICE_ID || "").trim();
  const apiKey = String(env.ELEVENLABS_API_KEY || "").trim();
  if (!voiceId || !apiKey) throw new Error("elevenlabs_not_configured");
  const speed =
    Number.isFinite(Number(opts.speed)) && Number(opts.speed) >= 0.7 && Number(opts.speed) <= 1.2
      ? Number(opts.speed)
      : env.ELEVENLABS_SPEED;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;
  const call = (voiceSettings) =>
    fetch(url, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: String(opts.modelId || env.ELEVENLABS_MODEL_ID || "eleven_v3"),
        ...(voiceSettings ? { voice_settings: voiceSettings } : {}),
      }),
    });
  // stability 1.0 (Robust) เสียงนิ่ง + speed ช้ากว่าปกติ (กบ: "พูดช้าหน่อย ดูไวไป")
  let res = await call({ stability: 1.0, speed });
  if (res.status === 400 || res.status === 422) {
    // บาง model ปฏิเสธ voice_settings บางฟิลด์ — ยอมเสีย speed ดีกว่าเสียทั้งเสียง
    res = await call(null);
  }
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

/**
 * เสียงประจำเหตุการณ์ (คงที่ ไม่ผูกกับสแกน) — เจนครั้งเดียวต่อ (สคริปต์+เสียง+ความเร็ว)
 * แล้ว cache URL ใน app_settings ใช้ซ้ำทุกคนทุกครั้ง = ต้นทุนแทบศูนย์.
 * เปลี่ยนเสียง/ความเร็วจาก /admin/voice เมื่อไหร่ ระบบเจนใหม่ให้เองรอบแรกที่ใช้.
 */
const STATIC_VOICE_SCRIPTS = {
  multi_image: "ใจเย็น ๆ, ทีละรูปพอ, รอชิ้นแรกออกก่อน, แล้วค่อยส่งชิ้นต่อไป",
  multi_image_stern:
    "อาจารย์บอกแล้ว, ทีละรูป, ส่งพร้อมกันแบบนี้, อาจารย์ไม่ดูให้, รอชิ้นแรกเสร็จก่อน",
};

/**
 * @param {string} name key ใน STATIC_VOICE_SCRIPTS
 * @returns {Promise<{ url: string, durationMs: number } | null>}
 */
export async function getStaticVoiceNote(name) {
  try {
    const script = STATIC_VOICE_SCRIPTS[String(name || "")];
    if (!script) return null;
    const cfg = await getVoiceNoteConfig();
    if (!cfg.enabled) return null;

    const settingKey = `voice_note_static:${name}`;
    const cached = await getAppSetting(settingKey).catch(() => null);
    if (
      cached &&
      typeof cached === "object" &&
      /** @type {any} */ (cached).url &&
      /** @type {any} */ (cached).script === script &&
      /** @type {any} */ (cached).voiceId === cfg.voiceId &&
      Number(/** @type {any} */ (cached).speed) === cfg.speed
    ) {
      return {
        url: String(/** @type {any} */ (cached).url),
        durationMs: Number(/** @type {any} */ (cached).durationMs) || 0,
      };
    }

    const mp3 = await synthesizeMp3(script, {
      voiceId: cfg.voiceId,
      speed: cfg.speed,
      modelId: cfg.modelId,
    });
    const { m4a, durationMs } = await convertMp3ToM4a(mp3);
    if (!durationMs || durationMs < 500) throw new Error("duration_unreadable");
    const url = await uploadVoiceNote("static", `${name}-${Date.now().toString(36)}`, m4a);
    const { setAppSetting } = await import("../../stores/appSettings.db.js");
    await setAppSetting(settingKey, {
      url,
      durationMs,
      script,
      voiceId: cfg.voiceId,
      speed: cfg.speed,
    });
    console.log(
      JSON.stringify({ event: "STATIC_VOICE_NOTE_GENERATED", name, durationMs }),
    );
    return { url, durationMs };
  } catch (e) {
    console.warn(
      JSON.stringify({
        event: "STATIC_VOICE_NOTE_SKIPPED",
        name: String(name || ""),
        message: String(e?.message || e).slice(0, 160),
      }),
    );
    return null;
  }
}

/**
 * พลังเด่นตัวจริงที่ต้องพูด = ช่องเดียวกับที่การ์ด flex โชว์:
 * summary.fitReasonShort "เด่นสุด โชคลาภและการเปิดทาง · รอง บารมีและอำนาจนำ"
 * → { top: "โชคลาภ", second: "บารมี" } (ตัดที่ "และ" ให้สั้นพอพูด)
 * @param {Record<string, unknown> | null | undefined} reportPayload
 * @returns {{ top: string, second: string }}
 */
export function extractTopPowersFromReport(reportPayload) {
  const s =
    reportPayload && typeof reportPayload === "object" &&
    reportPayload.summary && typeof reportPayload.summary === "object"
      ? /** @type {Record<string, unknown>} */ (reportPayload.summary)
      : {};
  const fit = String(s.fitReasonShort || "").trim();
  const shorten = (t) => String(t || "").split("และ")[0].trim().slice(0, 40);
  const m = /เด่นสุด\s*([^·]+?)(?:\s*·\s*รอง\s*(.+))?$/.exec(fit);
  if (m) {
    return { top: shorten(m[1]), second: shorten(m[2] || "") };
  }
  return { top: "", second: "" };
}

/**
 * Fallback พลังเด่น: บางสแกนช่องสรุป mainEnergy ว่าง → ขุดจากแกนคะแนนใน
 * report ตรง ๆ (แกนที่คะแนนสูงสุดใน powerCategories/axes ของ lane นั้น)
 * @param {Record<string, unknown> | null | undefined} reportPayload
 */
export function topAxisLabelFromReport(reportPayload) {
  const p = reportPayload && typeof reportPayload === "object" ? reportPayload : {};
  const lane =
    /** @type {Record<string, unknown> | null} */ (
      p.amuletV1 || p.crystalBraceletV1 || p.moldaviteV1 || null
    );
  const cats =
    lane && typeof lane === "object"
      ? /** @type {Record<string, { score?: unknown, labelThai?: unknown }>} */ (
          lane.powerCategories || lane.axes || null
        )
      : null;
  if (!cats || typeof cats !== "object") return "";
  let best = "";
  let bestScore = -Infinity;
  for (const k of Object.keys(cats)) {
    const s = Number(cats[k]?.score);
    const label = String(cats[k]?.labelThai || "").trim();
    if (Number.isFinite(s) && label && s > bestScore) {
      bestScore = s;
      best = label;
    }
  }
  return best;
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
async function passesAudienceGate(lineUserId, audience) {
  if (String(audience) === "all") return true;
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
 *   lineSummary?: { energyScore?: number | null, mainEnergy?: string, compatibility?: number | null } | null,
 *   reportPayload?: Record<string, unknown> | null,
 * }} p
 * @returns {Promise<{ url: string, durationMs: number, script: string } | null>}
 */
export async function maybeBuildScanVoiceNote(p) {
  if (p.dedupHit) return null; // report "เคยสแกนแล้ว" ไม่ต้องมีเสียงซ้ำ
  const t0 = Date.now();
  try {
    const cfg = await getVoiceNoteConfig();
    if (!cfg.enabled) return null;
    const allowed = await passesAudienceGate(p.lineUserId, cfg.audience);
    if (!allowed) return null;

    const work = (async () => {
      // แหล่งความจริงอันดับหนึ่ง = ฟังก์ชันเดียวกับปิลล์ "พลังเด่น/เข้ากับคุณที่สุด" บนการ์ด
      // (เคสกบ: การ์ดโชว์คุ้มครองคู่ แต่เสียงไปหยิบ "รอง" จาก fitReasonShort → ไม่ตรงการ์ด)
      let pill = null;
      try {
        const pc =
          p.reportPayload && typeof p.reportPayload === "object"
            ? /** @type {any} */ (p.reportPayload).amuletV1?.powerCategories
            : null;
        if (pc) {
          const { buildAmuletFlexGsumPillData } = await import(
            "../flex/flex.amuletSummary.js"
          );
          pill = buildAmuletFlexGsumPillData(pc, p.reportPayload);
        }
      } catch {}
      const powers = extractTopPowersFromReport(p.reportPayload);
      const script = buildVoiceScript({
        score: p.lineSummary?.energyScore ?? null,
        topPower:
          pill?.top ||
          powers.top ||
          String(p.lineSummary?.mainEnergy || "").trim() ||
          topAxisLabelFromReport(p.reportPayload),
        fitPower: pill?.second || powers.second,
        compatibility: p.lineSummary?.compatibility ?? null,
        lane: String(p.lane || ""),
        seed: String(p.scanResultV2Id || p.lineUserId),
      });
      const mp3 = await synthesizeMp3(script, {
        voiceId: cfg.voiceId,
        speed: cfg.speed,
        modelId: cfg.modelId,
      });
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
