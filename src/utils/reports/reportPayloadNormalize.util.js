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
      objectLabel: str(objectIn?.objectLabel).trim() || "วัตถุของคุณ",
      objectType: str(objectIn?.objectType),
    },
    summary: {
      energyScore,
      energyLevelLabel: str(summaryIn?.energyLevelLabel),
      mainEnergyLabel: str(summaryIn?.mainEnergyLabel),
      compatibilityPercent,
      summaryLine:
        str(summaryIn?.summaryLine).trim() ||
        "สรุปผลการสแกน — ดูรายละเอียดด้านล่าง",
      wordingFamily: str(summaryIn?.wordingFamily).trim() || undefined,
      clarityLevel: str(summaryIn?.clarityLevel).trim() || undefined,
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
    },
  };

  if (!payload.summary.summaryLine || payload.summary.summaryLine.length < 3) {
    warnings.push("summary_line_empty_or_short");
  }

  return { payload, warnings };
}
