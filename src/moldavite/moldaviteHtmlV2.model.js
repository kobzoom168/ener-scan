import { deriveMoldaviteOwnerAxisProfile } from "./moldaviteOwnerProfileFromBirthdate.util.js";

/** @typedef {"work"|"relationship"|"money"} AxisKey */

const AXIS_ORDER = /** @type {const} */ ([
  "work",
  "relationship",
  "money",
]);

const AXIS_LABEL_TH = {
  work: "งาน",
  relationship: "ความสัมพันธ์",
  money: "การเงิน",
};

/**
 * @param {number} v
 * @returns {number}
 */
function clamp0100(v) {
  if (!Number.isFinite(v)) return 50;
  return Math.min(100, Math.max(0, Math.round(v)));
}

/**
 * @param {import("../services/reports/reportPayload.types.js").ReportPayload} payload
 */
export function buildMoldaviteHtmlV2ViewModel(payload) {
  const mv = payload?.moldaviteV1;
  if (!mv || typeof mv !== "object") {
    throw new Error("MOLDAVITE_HTML_V2_MISSING_SLICE");
  }
  const fs = mv.flexSurface;
  if (!fs || typeof fs !== "object") {
    throw new Error("MOLDAVITE_HTML_V2_MISSING_FLEX_SURFACE");
  }

  const seed =
    String(payload.scanId || payload.reportId || "seed").trim() || "seed";
  const ownerAxes = deriveMoldaviteOwnerAxisProfile(
    payload.birthdateUsed,
    seed,
  );

  const la = mv.lifeAreas && typeof mv.lifeAreas === "object" ? mv.lifeAreas : {};

  /** @type {Record<AxisKey, number>} */
  const crystal = {
    work: 50,
    relationship: 50,
    money: 50,
  };
  for (const k of AXIS_ORDER) {
    const e = la[k];
    const sc =
      e && typeof e === "object" && e.score != null
        ? Number(e.score)
        : NaN;
    crystal[k] = clamp0100(sc);
  }

  /** @type {AxisKey} */
  let alignKey = "work";
  /** @type {AxisKey} */
  let tensionKey = "work";
  let minD = Infinity;
  let maxD = -1;
  for (const k of AXIS_ORDER) {
    const d = Math.abs(ownerAxes[k] - crystal[k]);
    if (d < minD) {
      minD = d;
      alignKey = k;
    }
    if (d > maxD) {
      maxD = d;
      tensionKey = k;
    }
  }

  const alignLabel = AXIS_LABEL_TH[alignKey];
  const tensionLabel = AXIS_LABEL_TH[tensionKey];

  const graphSummaryLines = [
    `สอดคล้องแรงสุดที่มิติ “${alignLabel}” — แนวโน้มของคุณกับแรงเน้นของหินใกล้เคียงกันในด้านนี้`,
    `จุดที่ควรจัดจังหวะ: “${tensionLabel}” — เมื่อระยะห่างมาก ให้ลดจังหวะและสังเกตความรู้สึก ไม่ใช่คำเตือนเชิงลบ`,
  ];

  const interactionHeadline = "หินทำงานกับคุณอย่างไร";
  const interactionBullets = [
    `มิติที่ไปในทิศเดียวกัน: ${alignLabel} — ลองสังเกตว่าช่วงนี้เรื่องนี้ “ลื่น” หรือตัดสินใจง่ายขึ้นหรือไม่`,
    `มิติที่ควรไม่เร่งเกิน: ${tensionLabel} — แยกแยะระหว่างการเปลี่ยนจริงกับแรงกดดันชั่วคราว`,
    "โทนหินเน้นการเปลี่ยนแปลง — ไม่ได้สัญญาผลลัพธ์ แต่ชี้จังหวะที่ปล่อยของเก่าและเริ่มรอบใหม่",
  ];

  const hr = mv.htmlReport;
  const meaningParagraphs =
    hr && Array.isArray(hr.meaningParagraphs) ? hr.meaningParagraphs : [];
  const lifeBlurbs =
    hr && hr.lifeAreaBlurbs && typeof hr.lifeAreaBlurbs === "object"
      ? hr.lifeAreaBlurbs
      : {};
  const usageLines =
    hr && Array.isArray(hr.usageCautionLines) ? hr.usageCautionLines : [
      "เหมาะเมื่อต้องการเร่งให้เรื่องที่ค้างขยับหรือเปลี่ยนกรอบเดิมในจังหวะที่พร้อม",
      "อาจรู้สึกเข้มเมื่อใจยังไม่พร้อมปล่อย — ใช้เป็นกรอบอ่าน ไม่ใช่คำสั่ง",
      "ไม่ใช่คำแนะนำทางการแพทย์หรือการเงิน",
    ];

  /** @type {{ key: AxisKey, label: string, score: number, blurb: string }[]} */
  const lifeAreaRows = AXIS_ORDER.map((k) => {
    const e = la[k];
    const score =
      e && typeof e === "object" && e.score != null
        ? clamp0100(Number(e.score))
        : 0;
    const blurb = String(lifeBlurbs[k] || "").trim();
    return {
      key: k,
      label: AXIS_LABEL_TH[k],
      score,
      blurb:
        blurb ||
        "โทนเร่งการเปลี่ยนแปลงอาจปรากฏเป็นการปรับกรอบหรือเริ่มขั้นตอนใหม่ในมิตินี้เมื่อพร้อม",
    };
  });
  lifeAreaRows.sort((a, b) => b.score - a.score);

  return {
    rendererId: "moldavite-html-v2",
    hero: {
      subtypeLabel: String(fs.headline || "").trim(),
      tagline: String(fs.tagline || "").trim(),
      mainEnergyLabel: String(fs.mainEnergyShort || "").trim() || "เร่งการเปลี่ยนแปลง",
      openingHook: String(payload.wording?.htmlOpeningLine || fs.htmlOpeningLine || "").trim(),
      objectImageUrl: String(payload.object?.objectImageUrl || "").trim(),
      reportGeneratedAt: String(payload.generatedAt || ""),
    },
    metrics: {
      energyScore: payload.summary?.energyScore,
      energyLevelLabel: String(payload.summary?.energyLevelLabel || "").trim(),
      compatibilityPercent: payload.summary?.compatibilityPercent,
      compatibilityBand: String(payload.summary?.compatibilityBand || "").trim(),
    },
    graph: {
      axes: AXIS_ORDER.map((id) => ({
        id,
        labelThai: AXIS_LABEL_TH[id],
      })),
      owner: ownerAxes,
      crystal,
      scaleNote: "สเกล 0–100 ต่อแกน — เปรียบเทียบแนวโน้มเจ้าของกับแรงเน้นของหิน",
      alignment: { axisKey: alignKey, labelThai: alignLabel },
      tension: { axisKey: tensionKey, labelThai: tensionLabel },
    },
    graphSummary: { lines: graphSummaryLines },
    ownerProfile: {
      summaryLine: ownerAxes.summaryLine,
      traits: ownerAxes.traits,
      derivationNote: ownerAxes.derivationNote,
    },
    interactionSummary: {
      headline: interactionHeadline,
      bullets: interactionBullets,
    },
    meaningParagraphs,
    lifeAreaDetail: { rows: lifeAreaRows },
    usageCaution: { lines: usageLines },
    trustNote: String(payload.trust?.trustNote || "").trim(),
    reportVersion: String(payload.reportVersion || ""),
    modelLabel: payload.trust?.modelLabel
      ? String(payload.trust.modelLabel)
      : "",
  };
}
