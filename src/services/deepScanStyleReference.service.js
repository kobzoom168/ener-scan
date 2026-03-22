/**
 * Optional style pack for rewrite layer only (wording / tone).
 * Safe skip if file missing or invalid — never throws to caller.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { env } from "../config/env.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** @param {unknown} v */
function isRecord(v) {
  return v !== null && typeof v === "object";
}

export function resolveStylePackPath() {
  const explicit = process.env.DEEP_SCAN_STYLE_REFERENCE_PATH;
  if (explicit && String(explicit).trim()) {
    const p = String(explicit).trim();
    return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
  }
  return path.join(ROOT, "data", "style-reference-pack.json");
}

/** @returns {"off"|"on"|"sample"} */
export function resolveStyleReferenceMode() {
  const raw = String(env.DEEP_SCAN_STYLE_REFERENCE_MODE || "").trim().toLowerCase();
  if (raw === "off" || raw === "on" || raw === "sample") return raw;
  if (env.ENABLE_DEEP_SCAN_STYLE_REFERENCES) return "on";
  return "off";
}

export function getStyleReferenceSamplePercent() {
  return env.DEEP_SCAN_STYLE_REFERENCE_SAMPLE_PCT ?? 10;
}

/** Used when MODE=sample */
export function isStyleReferenceSampleSelected() {
  const pct = getStyleReferenceSamplePercent();
  return Math.random() * 100 < pct;
}

/**
 * Default row for quality_analytics when rewrite did not run or style not applicable.
 * @returns {Record<string, unknown>}
 */
export function buildDefaultStyleReferenceAnalyticsMeta() {
  const mode = resolveStyleReferenceMode();
  return {
    style_reference_mode: mode,
    style_reference_enabled: false,
    style_reference_sample_selected: null,
    style_reference_used: false,
    style_reference_fragment_count: 0,
    style_reference_source: resolveStylePackPath(),
    rewrite_with_style: false,
  };
}

/**
 * @param {string} filePath
 * @returns {Promise<{ pack: object | null, error: string | null }>}
 */
export async function loadStyleReferencePackFromDisk(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const json = JSON.parse(raw);
    if (!json || typeof json !== "object") {
      return { pack: null, error: "not_object" };
    }
    if (json.kind !== "ener_scan_style_reference_pack") {
      return { pack: null, error: "invalid_kind" };
    }
    if (!Array.isArray(json.examples) || json.examples.length === 0) {
      return { pack: null, error: "no_examples" };
    }
    return { pack: json, error: null };
  } catch (e) {
    const code = /** @type {NodeJS.ErrnoException} */ (e)?.code;
    return {
      pack: null,
      error: code || (e && /** @type {Error} */ (e).message) || "read_failed",
    };
  }
}

function shortenOneLine(text, max) {
  const s = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

/**
 * Compact Thai block appended to rewrite system prompt (wording only).
 * @param {object} pack
 * @returns {{ block: string | null, fragmentCount: number }}
 */
export function buildCompactStyleGuidanceForRewrite(pack) {
  if (!pack || typeof pack !== "object") {
    return { block: null, fragmentCount: 0 };
  }

  const summary = isRecord(pack.summary) ? pack.summary : null;
  if (!summary) {
    return { block: null, fragmentCount: 0 };
  }

  const wt = isRecord(summary.wording_traits_high_score)
    ? summary.wording_traits_high_score
    : null;
  const sh = isRecord(summary.signal_histogram)
    ? summary.signal_histogram
    : null;

  const examples = Array.isArray(pack.examples) ? pack.examples : [];
  const fragments = examples
    .map((ex) => shortenOneLine(ex.result_text, 200))
    .filter(Boolean)
    .slice(0, 5);

  if (fragments.length < 1) {
    return { block: null, fragmentCount: 0 };
  }

  const lines = [];

  lines.push(
    `## แนวทางภาษาเพิ่มเติม (อ้างอิงภายใน — ใช้เฉพาะเกลาคำ ไม่ใช่คำสั่งอ่านพลังใหม่)`,
  );
  lines.push(
    `- ห้ามเปลี่ยนตัวเลข คะแนน เปอร์เซ็นต์ ชื่อพลัง โครงสร้างหัวข้อ หรือการตีความวัตถุจาก draft`,
    `- ห้ามเพิ่ม/ลบข้อเท็จจริง — ปรับโทนประโยค ความลื่น และความโยงชีวิตจริงเท่านั้น`,
    `- ตัวอย่างด้านล่างเป็นเพียง “โทนอ้างอิง” ห้ามคัดลอกทั้งดุ้น`,
    ``,
  );

  if (wt) {
    lines.push(`ลักษณะข้อความที่มักทำงานได้ดี (จากตัวอย่างคุณภาพสูง):`);
    if (Number.isFinite(wt.avg_char_length)) {
      lines.push(`- เฉลี่ยความยาวประมาณ ${wt.avg_char_length} ตัวอักษร`);
    }
    if (Number.isFinite(wt.avg_line_count)) {
      lines.push(`- เฉลี่ยจำนวนบรรทัดประมาณ ${wt.avg_line_count}`);
    }
    const sr = isRecord(wt.section_presence_rate)
      ? wt.section_presence_rate
      : null;
    if (sr) {
      const top = Object.entries(sr)
        .filter(([, v]) => Number(v) >= 0.4)
        .sort((a, b) => Number(b[1]) - Number(a[1]))
        .slice(0, 4)
        .map(([k, v]) => `${k} (~${Math.round(Number(v) * 100)}%)`)
        .join(", ");
      if (top) lines.push(`- หัวข้อที่มักครบ: ${top}`);
    }
    lines.push(``);
  }

  if (sh && isRecord(sh.signals)) {
    lines.push(`สัญญาณภาษาที่พบในตัวอย่างดี:`);
    for (const [k, v] of Object.entries(sh.signals)) {
      if (v && typeof v === "object" && Number.isFinite(v.rate)) {
        lines.push(`- ${k}: ~${Math.round(Number(v.rate) * 100)}% ของตัวอย่าง`);
      }
    }
    lines.push(``);
  }

  lines.push(`ท่อนตัวอย่างสั้น (โทนเท่านั้น — ห้ามคัดลอกทั้งดุ้น):`);
  fragments.forEach((frag, i) => {
    lines.push(`${i + 1}. ${frag}`);
  });

  let block = lines.join("\n").trim();
  if (block.length > 4500) {
    block = `${block.slice(0, 4400)}\n…`;
  }
  return { block, fragmentCount: fragments.length };
}

/**
 * @returns {Promise<{
 *   use: boolean,
 *   systemPromptAugmentation: string | null,
 *   fragmentCount: number,
 *   sourcePath: string,
 *   skipReason: string | null,
 *   mode: "off"|"on"|"sample",
 *   style_reference_enabled: boolean,
 *   style_reference_sample_selected: boolean | null,
 * }>}
 */
export async function prepareRewriteStyleReferenceAugmentation() {
  const sourcePath = resolveStylePackPath();
  const mode = resolveStyleReferenceMode();

  const baseOut = {
    use: false,
    systemPromptAugmentation: null,
    fragmentCount: 0,
    sourcePath,
    skipReason: /** @type {string | null} */ ("mode_off"),
    mode,
    style_reference_enabled: false,
    style_reference_sample_selected: /** @type {boolean | null} */ (null),
  };

  if (mode === "off") {
    return { ...baseOut, skipReason: "mode_off" };
  }

  if (mode === "sample") {
    const selected = isStyleReferenceSampleSelected();
    if (!selected) {
      return {
        ...baseOut,
        skipReason: "sample_not_selected",
        style_reference_sample_selected: false,
        style_reference_enabled: false,
      };
    }
    baseOut.style_reference_sample_selected = true;
    baseOut.style_reference_enabled = true;
  } else {
    baseOut.style_reference_enabled = true;
  }

  const { pack, error } = await loadStyleReferencePackFromDisk(sourcePath);
  if (!pack) {
    return {
      ...baseOut,
      skipReason: error || "load_failed",
    };
  }

  const built = buildCompactStyleGuidanceForRewrite(pack);
  if (!built.block) {
    return {
      ...baseOut,
      skipReason: "empty_guidance",
    };
  }

  return {
    ...baseOut,
    use: true,
    systemPromptAugmentation: built.block,
    fragmentCount: built.fragmentCount,
    skipReason: null,
  };
}
