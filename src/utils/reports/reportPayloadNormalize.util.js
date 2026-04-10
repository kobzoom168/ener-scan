import { sanitizeHttpsPublicImageUrl } from "./reportImageUrl.util.js";

/**
 * Hardening for HTML render: DB JSON or legacy rows may omit nested objects.
 * Does not mutate the original object.
 *
 * @param {unknown} input
 * @returns {{ payload: import("../../services/reports/reportPayload.types.js").ReportPayload, warnings: string[] }}
 */
export function normalizeReportPayloadForRender(input) {
  const warnings = [];
  const raw =
    input && typeof input === "object" && !Array.isArray(input)
      ? /** @type {Record<string, unknown>} */ (input)
      : {};

  if (!input || typeof input !== "object") {
    warnings.push("payload_not_object");
  }

  const summaryIn =
    raw.summary && typeof raw.summary === "object"
      ? /** @type {Record<string, unknown>} */ (raw.summary)
      : null;
  if (!summaryIn) warnings.push("missing_summary");

  const sectionsIn =
    raw.sections && typeof raw.sections === "object"
      ? /** @type {Record<string, unknown>} */ (raw.sections)
      : null;
  if (!sectionsIn) warnings.push("missing_sections");

  const objectIn =
    raw.object && typeof raw.object === "object"
      ? /** @type {Record<string, unknown>} */ (raw.object)
      : null;
  if (!objectIn) warnings.push("missing_object");

  const trustIn =
    raw.trust && typeof raw.trust === "object"
      ? /** @type {Record<string, unknown>} */ (raw.trust)
      : null;
  if (!trustIn) warnings.push("missing_trust");

  const actionsIn =
    raw.actions && typeof raw.actions === "object"
      ? /** @type {Record<string, unknown>} */ (raw.actions)
      : null;
  if (!actionsIn) warnings.push("missing_actions");

  /** @param {unknown} v */
  function str(v) {
    if (v == null) return "";
    return String(v);
  }

  /** @param {unknown} v */
  function numOrNull(v) {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  /** @param {unknown} v */
  function strArr(v) {
    if (!Array.isArray(v)) return [];
    return v.map((x) => str(x).trim()).filter(Boolean);
  }

  const wordingIn =
    raw.wording && typeof raw.wording === "object"
      ? /** @type {Record<string, unknown>} */ (raw.wording)
      : null;

  /** @param {unknown} v */
  function numOrZero(v) {
    if (v == null || v === "") return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  let generatedAt = str(raw.generatedAt).trim();
  if (generatedAt) {
    const t = Date.parse(generatedAt);
    if (Number.isNaN(t)) {
      warnings.push("invalid_generatedAt");
      generatedAt = new Date().toISOString();
    }
  } else {
    warnings.push("missing_generatedAt");
    generatedAt = new Date().toISOString();
  }

  const energyScore = numOrNull(summaryIn?.energyScore);
  const compatibilityPercent = numOrNull(summaryIn?.compatibilityPercent);
  const compatibilityBand = str(summaryIn?.compatibilityBand).trim();

  const DIM_EN = [
    "balance",
    "protection",
    "authority",
    "compassion",
    "attraction",
  ];

  /** @param {unknown} sd */
  function normalizeScanDimensions(sd) {
    if (!sd || typeof sd !== "object" || Array.isArray(sd)) return undefined;
    /** @type {Record<string, number>} */
    const out = {};
    for (const [k, v] of Object.entries(
      /** @type {Record<string, unknown>} */ (sd),
    )) {
      const n = Number(v);
      if (Number.isFinite(n)) out[k] = n;
    }
    return Object.keys(out).length ? out : undefined;
  }

  /** @param {unknown} p */
  function normalizeEnergyProfile(p) {
    if (!p || typeof p !== "object" || Array.isArray(p)) return undefined;
    const o = /** @type {Record<string, unknown>} */ (p);
    /** @type {Record<string, number>} */
    const out = {};
    for (const k of DIM_EN) {
      const n = Number(o[k]);
      out[k] = Number.isFinite(n)
        ? Math.min(100, Math.max(0, Math.round(n)))
        : 50;
    }
    return out;
  }

  /** @param {unknown} s */
  function normalizeEnergyStars(s) {
    if (!s || typeof s !== "object" || Array.isArray(s)) return undefined;
    const o = /** @type {Record<string, unknown>} */ (s);
    /** @type {Record<string, number>} */
    const out = {};
    for (const k of DIM_EN) {
      const n = Number(o[k]);
      out[k] = Number.isFinite(n)
        ? Math.min(5, Math.max(1, Math.round(n)))
        : 3;
    }
    return out;
  }

  /** @type {import("../../services/reports/reportPayload.types.js").ReportPayload} */
  const payload = {
    reportId: str(raw.reportId).trim() || "unknown",
    publicToken: str(raw.publicToken).trim() || "unknown",
    scanId: str(raw.scanId).trim() || "",
    userId: str(raw.userId).trim() || "",
    birthdateUsed:
      raw.birthdateUsed == null || raw.birthdateUsed === ""
        ? null
        : str(raw.birthdateUsed),
    generatedAt,
    reportVersion: str(raw.reportVersion).trim() || "unknown",
    object: {
      objectImageUrl: sanitizeHttpsPublicImageUrl(objectIn?.objectImageUrl),
      socialImageUrl: sanitizeHttpsPublicImageUrl(
        objectIn?.socialImageUrl ?? objectIn?.shareImageUrl,
      ),
      objectLabel: str(objectIn?.objectLabel).trim() || "วัตถุของคุณ",
      objectType: str(objectIn?.objectType),
    },
    summary: {
      energyScore,
      energyLevelLabel: str(summaryIn?.energyLevelLabel),
      mainEnergyLabel: str(summaryIn?.mainEnergyLabel),
      compatibilityPercent,
      compatibilityBand: compatibilityBand || undefined,
      scanDimensions: normalizeScanDimensions(summaryIn?.scanDimensions),
      summaryLine:
        str(summaryIn?.summaryLine).trim() ||
        "สรุปผลการสแกน — ดูรายละเอียดด้านล่าง",
      wordingFamily: str(summaryIn?.wordingFamily).trim() || undefined,
      clarityLevel: str(summaryIn?.clarityLevel).trim() || undefined,
      headlineShort: str(summaryIn?.headlineShort).trim() || undefined,
      fitReasonShort: str(summaryIn?.fitReasonShort).trim() || undefined,
      bulletsShort: strArr(summaryIn?.bulletsShort).slice(0, 2),
      ctaLabel: str(summaryIn?.ctaLabel).trim() || undefined,
      energyCategoryCode: str(summaryIn?.energyCategoryCode).trim() || undefined,
      energyCopyObjectFamily: str(summaryIn?.energyCopyObjectFamily).trim() || undefined,
      crystalMode: (() => {
        const v = summaryIn?.crystalMode;
        if (v === "general" || v === "spiritual_growth") return v;
        return null;
      })(),
    },
    sections: {
      whatItGives: strArr(sectionsIn?.whatItGives),
      messagePoints: strArr(sectionsIn?.messagePoints),
      ownerMatchReason: strArr(sectionsIn?.ownerMatchReason),
      roleDescription: str(sectionsIn?.roleDescription),
      bestUseCases: strArr(sectionsIn?.bestUseCases),
      weakMoments: strArr(sectionsIn?.weakMoments),
      guidanceTips: strArr(sectionsIn?.guidanceTips),
      careNotes: strArr(sectionsIn?.careNotes),
      miniRitual: strArr(sectionsIn?.miniRitual),
    },
    trust: {
      modelLabel: trustIn?.modelLabel ? str(trustIn.modelLabel) : undefined,
      trustNote:
        str(trustIn?.trustNote).trim() ||
        "รายงานนี้จัดทำจากข้อมูลที่คุณให้ ไม่ใช่คำแนะนำทางการแพทย์หรือการเงิน",
      rendererVersion: str(trustIn?.rendererVersion).trim() || "html-1.0.0",
    },
    actions: {
      historyUrl: str(actionsIn?.historyUrl),
      rescanUrl: str(actionsIn?.rescanUrl),
      changeBirthdateUrl: str(actionsIn?.changeBirthdateUrl),
      lineHomeUrl: str(actionsIn?.lineHomeUrl),
    },
    wording: {
      objectLabel: str(wordingIn?.objectLabel),
      heroNaming: str(wordingIn?.heroNaming),
      energyCharacter: str(wordingIn?.energyCharacter),
      mainEnergy: str(wordingIn?.mainEnergy),
      secondaryEnergies: strArr(wordingIn?.secondaryEnergies),
      powerScore: numOrZero(wordingIn?.powerScore),
      compatibilityScore: numOrZero(wordingIn?.compatibilityScore),
      energyBreakdown: (() => {
        const eb =
          wordingIn?.energyBreakdown &&
          typeof wordingIn.energyBreakdown === "object"
            ? /** @type {Record<string, unknown>} */ (wordingIn.energyBreakdown)
            : null;
        return {
          protection: numOrZero(eb?.protection),
          balance: numOrZero(eb?.balance),
          authority: numOrZero(eb?.authority),
          metta: numOrZero(eb?.metta),
          attraction: numOrZero(eb?.attraction),
        };
      })(),
      lifeTranslation: str(wordingIn?.lifeTranslation),
      bestFor: str(wordingIn?.bestFor),
      notTheBestFor: str(wordingIn?.notTheBestFor),
      practicalEffects: strArr(wordingIn?.practicalEffects).slice(0, 3),
      flexHeadline: str(wordingIn?.flexHeadline),
      flexBullets: strArr(wordingIn?.flexBullets).slice(0, 2),
      htmlOpeningLine: str(wordingIn?.htmlOpeningLine),
      wordingFamily: str(wordingIn?.wordingFamily),
      clarityLevel: str(wordingIn?.clarityLevel),
      publicReportUrl: str(wordingIn?.publicReportUrl).trim() || undefined,
    },
  };

  const compatRaw = raw.compatibility;
  if (compatRaw && typeof compatRaw === "object" && !Array.isArray(compatRaw)) {
    /** @type {Record<string, unknown>} */
    const c = /** @type {Record<string, unknown>} */ (compatRaw);
    payload.compatibility = {
      score: numOrZero(c.score),
      band: str(c.band).trim() || undefined,
      formulaVersion: str(c.formulaVersion).trim() || undefined,
      factors:
        c.factors && typeof c.factors === "object"
          ? /** @type {Record<string, unknown>} */ (c.factors)
          : undefined,
      inputs:
        c.inputs && typeof c.inputs === "object"
          ? /** @type {Record<string, unknown>} */ (c.inputs)
          : undefined,
      explain: strArr(c.explain),
    };
  }

  const parsedIn =
    raw.parsed && typeof raw.parsed === "object" && !Array.isArray(raw.parsed)
      ? /** @type {Record<string, unknown>} */ (raw.parsed)
      : null;
  if (parsedIn) {
    const cm = parsedIn.crystal_mode;
    /** @type {"general"|"spiritual_growth"|null} */
    let crystal_mode = null;
    if (cm === "general" || cm === "spiritual_growth") crystal_mode = cm;
    payload.parsed = { crystal_mode };
  }

  const oeRaw = raw.objectEnergy;
  if (oeRaw && typeof oeRaw === "object" && !Array.isArray(oeRaw)) {
    const oe = /** @type {Record<string, unknown>} */ (oeRaw);
    const mer = oe.mainEnergyResolved;
    const merObj =
      mer && typeof mer === "object" && !Array.isArray(mer)
        ? /** @type {Record<string, unknown>} */ (mer)
        : null;
    const conf = numOrNull(oe.confidence);
    payload.objectEnergy = {
      formulaVersion: str(oe.formulaVersion).trim() || undefined,
      profile: normalizeEnergyProfile(oe.profile),
      stars: normalizeEnergyStars(oe.stars),
      mainEnergyResolved:
        merObj && (str(merObj.key) || str(merObj.labelThai))
          ? {
              key: str(merObj.key).trim() || "balance",
              labelThai: str(merObj.labelThai).trim() || "",
            }
          : undefined,
      confidence:
        conf != null && Number.isFinite(conf)
          ? Math.min(1, Math.max(0, conf))
          : undefined,
      inputs:
        oe.inputs && typeof oe.inputs === "object"
          ? /** @type {Record<string, unknown>} */ (oe.inputs)
          : undefined,
      explain: strArr(oe.explain),
    };
  }

  if (!payload.summary.summaryLine || payload.summary.summaryLine.length < 3) {
    warnings.push("summary_line_empty_or_short");
  }

  const moldaviteRaw = raw.moldaviteV1;
  if (
    moldaviteRaw &&
    typeof moldaviteRaw === "object" &&
    !Array.isArray(moldaviteRaw)
  ) {
    payload.moldaviteV1 =
      /** @type {import("../../services/reports/reportPayload.types.js").ReportMoldaviteV1} */ (
        moldaviteRaw
      );
  }

  const cgsRaw = raw.crystalGenericSafeV1;
  if (cgsRaw && typeof cgsRaw === "object" && !Array.isArray(cgsRaw)) {
    payload.crystalGenericSafeV1 = cgsRaw;
  }

  const amuletRaw = raw.amuletV1;
  if (
    amuletRaw &&
    typeof amuletRaw === "object" &&
    !Array.isArray(amuletRaw)
  ) {
    payload.amuletV1 =
      /** @type {import("../../services/reports/reportPayload.types.js").ReportAmuletV1} */ (
        amuletRaw
      );
  }

  return { payload, warnings };
}
