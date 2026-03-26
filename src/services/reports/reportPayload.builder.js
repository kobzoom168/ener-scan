import { parseScanText } from "../flex/flex.parser.js";
import { normalizeScore, stripBullet } from "../flex/flex.utils.js";
import { REPORT_PAYLOAD_VERSION } from "./reportPayload.types.js";
import { sanitizeHttpsPublicImageUrl } from "../../utils/reports/reportImageUrl.util.js";
import { deriveReportWordingFromParsed } from "./reportWording.derive.js";

/**
 * Compatibility line may be "78%", "78 %", "7.8" (0–10 scale), or Thai prose with a number.
 * Picks the first plausible percentage: 0–100, or 0–10 scaled to percent.
 * @param {string} raw
 * @returns {number|null}
 */
export function parseCompatibilityPercent(raw) {
  const s = String(raw || "").trim();
  if (!s || s === "-") return null;

  const matches = s.match(/(\d+(?:\.\d+)?)/g);
  if (!matches || !matches.length) return null;

  for (const m of matches) {
    const n = Number(m);
    if (!Number.isFinite(n)) continue;
    if (n >= 0 && n <= 10) return Math.round(n * 10);
    if (n > 10 && n <= 100) return Math.round(n);
  }

  const n = Number(matches[0]);
  if (!Number.isFinite(n)) return null;
  if (n >= 0 && n <= 10) return Math.round(n * 10);
  if (n <= 100) return Math.round(n);
  return null;
}

/**
 * @param {number|null} n
 * @returns {string}
 */
function energyLevelLabelFromScore(n) {
  if (n == null || !Number.isFinite(n)) return "";
  if (n >= 7.5) return "สูง";
  if (n >= 5) return "ปานกลาง";
  return "อ่อน";
}

/**
 * @param {string} text
 * @param {number} max
 * @returns {string[]}
 */
function linesFromText(text, max = 6) {
  if (text == null) return [];
  if (String(text).trim() === "-") return [];
  return String(text)
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l && l !== "-")
    .slice(0, max);
}

/**
 * @param {unknown} bulletLines
 * @returns {string[]}
 */
function mapStripBullets(bulletLines) {
  if (!Array.isArray(bulletLines)) return [];
  return bulletLines
    .map((line) => stripBullet(String(line || "").replace(/^•\s*/, "")))
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Same shape as parseScanText output when everything is missing. */
function emptyParsedShape() {
  return {
    energyScore: "-",
    mainEnergy: "-",
    compatibility: "-",
    personality: "-",
    tone: "-",
    hidden: "-",
    overview: "-",
    fitReason: "-",
    supportTopics: [],
    suitable: [],
    notStrong: "-",
    usageGuide: "-",
    closing: "-",
  };
}

/**
 * Build canonical ReportPayload from scan output + context.
 * Uses {@link parseScanText} (same source as Flex) for section mapping.
 *
 * Fragile assumptions (parseScanText / prompts):
 * - Section headings must match model output; renamed headings => empty sections.
 * - supportTopics / suitable are limited by extractBulletSection (max 2 lines in parser).
 * - notStrong is a single merged line, not a bullet list.
 *
 * @param {object} opts
 * @param {string} opts.resultText
 * @param {string} opts.scanResultId — scan_results.id (UUID)
 * @param {string} opts.scanRequestId — scan_requests.id
 * @param {string} opts.lineUserId — LINE user id
 * @param {string|null} [opts.birthdateUsed]
 * @param {string} opts.publicToken — pre-generated token to embed in payload
 * @param {string} [opts.modelLabel] — e.g. gpt-4.1-mini
 * @param {string} [opts.objectImageUrl] — optional HTTPS URL for public hero image (from storage)
 * @returns {import("./reportPayload.types.js").ReportPayload}
 */
export function buildReportPayloadFromScan(opts) {
  const {
    resultText,
    scanResultId,
    scanRequestId,
    lineUserId,
    birthdateUsed = null,
    publicToken,
    modelLabel = "",
    objectImageUrl: objectImageUrlRaw = "",
  } = opts;

  const objectImageUrl = sanitizeHttpsPublicImageUrl(objectImageUrlRaw);

  let parsed;
  let parseException = false;
  try {
    parsed = parseScanText(String(resultText || ""));
  } catch (err) {
    parseException = true;
    console.warn(
      JSON.stringify({
        event: "REPORT_PAYLOAD_PARSE_EXCEPTION",
        scanResultId: String(scanResultId || "").slice(0, 8),
        message: err?.message,
      }),
    );
    parsed = null;
  }

  if (!parsed) {
    parsed = emptyParsedShape();
  }

  const scoreInfo = normalizeScore(parsed.energyScore);
  const energyScore =
    scoreInfo.numeric != null && Number.isFinite(scoreInfo.numeric)
      ? scoreInfo.numeric
      : null;

  const compatPct = parseCompatibilityPercent(parsed.compatibility);

  const overview =
    parsed.overview && parsed.overview !== "-" ? String(parsed.overview) : "";
  const fitReason =
    parsed.fitReason && parsed.fitReason !== "-" ? String(parsed.fitReason) : "";

  let summaryLine = "";
  if (overview) {
    const firstLine = overview.split(/\n/)[0]?.trim() || overview;
    summaryLine =
      firstLine.length > 220 ? `${firstLine.slice(0, 217)}…` : firstLine;
  } else if (fitReason) {
    const fl = fitReason.split(/\n/)[0]?.trim() || fitReason;
    summaryLine = fl.length > 220 ? `${fl.slice(0, 217)}…` : fl;
  } else {
    summaryLine = "สรุปผลการสแกนพลังวัตถุ — ดูรายละเอียดด้านล่าง";
  }

  const whatItGives = mapStripBullets(parsed.supportTopics);
  const messagePoints = linesFromText(overview, 5);
  const ownerMatchReason = linesFromText(fitReason, 6);

  let roleDescription = "";
  const pers =
    parsed.personality && parsed.personality !== "-"
      ? String(parsed.personality)
      : "";
  const tone = parsed.tone && parsed.tone !== "-" ? String(parsed.tone) : "";
  if (pers && tone) roleDescription = `${pers} · ${tone}`;
  else roleDescription = pers || tone || "";

  const bestUseCases = mapStripBullets(parsed.suitable);

  const weakMoments = [];
  const ns =
    parsed.notStrong && parsed.notStrong !== "-"
      ? String(parsed.notStrong).trim()
      : "";
  if (ns) weakMoments.push(ns);

  const guidanceTips = [];
  const ug =
    parsed.usageGuide && parsed.usageGuide !== "-"
      ? String(parsed.usageGuide).trim()
      : "";
  if (ug) guidanceTips.push(ug);
  const cl =
    parsed.closing && parsed.closing !== "-"
      ? String(parsed.closing).trim()
      : "";
  if (cl) guidanceTips.push(cl);

  const rid = String(scanResultId || "").trim();
  const tok = String(publicToken || "").trim();

  const wording = deriveReportWordingFromParsed(parsed, {
    seed: rid || scanResultId,
    energyScore,
    compatibilityPercent: compatPct,
  });

  console.log(
    JSON.stringify({
      event: "REPORT_PAYLOAD_BUILT",
      scanResultIdPrefix: rid ? `${rid.slice(0, 8)}…` : "",
      hasOverview: Boolean(overview),
      hasFitReason: Boolean(fitReason),
      sectionCounts: {
        whatItGives: whatItGives.length,
        messagePoints: messagePoints.length,
        ownerMatch: ownerMatchReason.length,
        bestUse: bestUseCases.length,
      },
      parseException,
      energyScorePresent: energyScore != null,
      compatPresent: compatPct != null,
      hasObjectImage: Boolean(objectImageUrl),
      hasWording: Boolean(wording?.mainEnergy),
    }),
  );

  return {
    reportId: rid,
    publicToken: tok,
    scanId: String(scanRequestId || "").trim(),
    userId: String(lineUserId || "").trim(),
    birthdateUsed: birthdateUsed ? String(birthdateUsed) : null,
    generatedAt: new Date().toISOString(),
    reportVersion: REPORT_PAYLOAD_VERSION,
    object: {
      objectImageUrl,
      objectLabel: "วัตถุจากการสแกน",
      objectType: "",
    },
    summary: {
      energyScore,
      energyLevelLabel: energyLevelLabelFromScore(energyScore),
      mainEnergyLabel: wording.mainEnergy
        ? String(wording.mainEnergy)
        : parsed.mainEnergy && parsed.mainEnergy !== "-"
          ? String(parsed.mainEnergy)
          : "",
      compatibilityPercent: compatPct,
      summaryLine,
      wordingFamily: wording.wordingFamily || undefined,
      clarityLevel: wording.clarityLevel || undefined,
    },
    sections: {
      whatItGives,
      messagePoints,
      ownerMatchReason,
      roleDescription,
      bestUseCases,
      weakMoments,
      guidanceTips,
      careNotes: [],
      miniRitual: [],
    },
    trust: {
      modelLabel: modelLabel || undefined,
      trustNote:
        "รายงานนี้จัดทำจากข้อความวิเคราะห์ที่สร้างจากภาพและข้อมูลที่คุณให้ ไม่ใช่คำแนะนำทางการแพทย์หรือการเงิน",
      rendererVersion: "html-1.0.0",
    },
    actions: {
      historyUrl: "",
      rescanUrl: "",
      changeBirthdateUrl: "",
      lineHomeUrl: "",
    },
    wording: {
      ...wording,
      objectLabel: "วัตถุจากการสแกน",
    },
  };
}
