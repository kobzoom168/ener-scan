/**
 * DB-first visible wording: angle + slot + cluster-aware selection over energy_copy_templates rows.
 * Code banks remain separate (flexSummaryShortCopy); this module only ranks DB rows.
 */

/** @typedef {object} EnergyCopyTemplateRowExt
 * @property {string|number} [id]
 * @property {string} object_family
 * @property {string} copy_type
 * @property {string} text_th
 * @property {number} [weight]
 * @property {boolean} [is_active]
 * @property {string|null} [presentation_angle]
 * @property {string|null} [cluster_tag]
 * @property {number} [fallback_level]
 * @property {string|null} [visible_tone]
 */

/**
 * @param {EnergyCopyTemplateRowExt} r
 * @param {string} preferredFamily
 * @returns {number}
 */
function familyRank(r, preferredFamily) {
  const fam = String(preferredFamily || "all").trim() || "all";
  const of = String(r.object_family || "").trim();
  if (of === fam) return 0;
  if (of === "all") return 1;
  return 2;
}

/**
 * Legacy `getEnergyCopySet` path: rows with a presentation_angle are angle-specific;
 * exclude them so headline/fit/bullet selection stays stable until the visible selector runs.
 *
 * @param {EnergyCopyTemplateRowExt[]} rows
 * @returns {EnergyCopyTemplateRowExt[]}
 */
export function filterRowsForLegacyEnergyCopy(rows) {
  return (Array.isArray(rows) ? rows : []).filter((r) => {
    const pa = r?.presentation_angle;
    return pa == null || String(pa).trim() === "";
  });
}

/**
 * @param {string} text
 * @returns {string} stable semantic bucket for anti-repeat when cluster_tag is absent
 */
export function inferSemanticKeyFromThaiText(text) {
  const s = String(text || "");
  if (/บารมี|ออร่า|เด่นสายตา|สง่า|หนักแน่น/.test(s)) return "sem:charisma_hint";
  if (
    /คุ้มครอง|ปกป้อง|เกราะ|กันแรง|กรอง|เขตแดน|กวนใจ|รับอารมณ์คนอื่น|แรงปะทะ/.test(
      s,
    )
  ) {
    return "sem:protection_hint";
  }
  return "sem:neutral";
}

/**
 * @param {EnergyCopyTemplateRowExt} r
 * @returns {string}
 */
export function semanticKeyFromTemplateRow(r) {
  const tag = String(r?.cluster_tag || "").trim();
  if (tag) return tag;
  return inferSemanticKeyFromThaiText(String(r?.text_th || ""));
}

/**
 * @param {EnergyCopyTemplateRowExt[]} sortedCandidates
 * @param {Set<string>} usedSemanticKeys
 * @returns {EnergyCopyTemplateRowExt | null}
 */
function pickOneSlot(sortedCandidates, usedSemanticKeys) {
  if (!sortedCandidates.length) return null;
  const fresh = sortedCandidates.find(
    (c) => !usedSemanticKeys.has(semanticKeyFromTemplateRow(c)),
  );
  const pick = fresh || sortedCandidates[0];
  if (pick) usedSemanticKeys.add(semanticKeyFromTemplateRow(pick));
  return pick || null;
}

/**
 * @param {EnergyCopyTemplateRowExt[]} sortedBulletRows
 * @param {Set<string>} usedSemanticKeys
 * @returns {{ texts: string[], rows: EnergyCopyTemplateRowExt[] }}
 */
function pickTwoBulletsDistinct(sortedBulletRows, usedSemanticKeys) {
  const texts = [];
  const pickedRows = [];
  let pool = [...sortedBulletRows];
  for (let i = 0; i < 2 && pool.length; i++) {
    const fresh = pool.find(
      (c) => !usedSemanticKeys.has(semanticKeyFromTemplateRow(c)),
    );
    const pick = fresh || pool[0];
    if (!pick) break;
    texts.push(String(pick.text_th || "").trim());
    pickedRows.push(pick);
    usedSemanticKeys.add(semanticKeyFromTemplateRow(pick));
    pool = pool.filter((x) => x !== pick);
  }
  return { texts: texts.filter(Boolean), rows: pickedRows };
}

/**
 * @typedef {object} SelectVisibleSurfaceCtx
 * @property {string} [preferredFamily]
 * @property {string} [presentationAngle] — Flex angle id (e.g. shield)
 * @property {string} [visibleTone] — default plain_th
 */

/**
 * @typedef {object} VisibleSurfaceDiagnostics
 * @property {"db"} wordingPrimarySource
 * @property {boolean} dbWordingSelected
 * @property {Array<{ slot: string, rowId?: string|number, clusterTag?: string|null, fallbackLevel?: number, presentationAngle?: string|null }>} dbWordingSlots
 * @property {number} dbWordingFallbackLevel
 * @property {boolean} visibleCopyUsedCodeFallback
 * @property {Set<string>} usedClusterTags
 */

/**
 * @param {EnergyCopyTemplateRowExt[]} rows
 * @param {SelectVisibleSurfaceCtx} ctx
 * @returns {{ headline: string|null, fitLine: string|null, bullets: string[], mainLabel: string|null, opening: string|null, teaser: string|null, diagnostics: VisibleSurfaceDiagnostics }}
 */
export function selectVisibleSurfaceFromTemplates(rows, ctx) {
  const preferredFamily = String(ctx.preferredFamily || "all").trim() || "all";
  const presentationAngle = String(ctx.presentationAngle || "").trim();
  const visibleTone = String(ctx.visibleTone || "plain_th").trim() || "plain_th";

  const list = (Array.isArray(rows) ? rows : []).filter(
    (r) => r && r.is_active !== false,
  );

  const filtered = list.filter((r) => {
    const pa = String(r.presentation_angle || "").trim();
    if (presentationAngle) {
      if (pa && pa !== presentationAngle) return false;
    } else if (pa) {
      return false;
    }
    return true;
  });

  /**
   * @param {EnergyCopyTemplateRowExt} r
   * @returns {number[]}
   */
  function sortKeyForRow(r) {
    const fr = familyRank(r, preferredFamily);
    const pa = String(r.presentation_angle || "").trim();
    let angleTier = 0;
    if (presentationAngle) {
      if (pa === presentationAngle) angleTier = 0;
      else if (!pa) angleTier = 1;
      else angleTier = 9;
    } else {
      angleTier = pa ? 9 : 0;
    }
    const vtRow = String(r.visible_tone || "").trim();
    let toneTier = 1;
    if (!vtRow || vtRow === "default") toneTier = 1;
    else if (vtRow === visibleTone) toneTier = 0;
    else toneTier = 2;
    const fb = Number(r.fallback_level) || 0;
    const w = Number(r.weight) || 0;
    const id = Number(r.id) || 0;
    return [fr, angleTier, fb, toneTier, w, id];
  }

  /**
   * @param {EnergyCopyTemplateRowExt} a
   * @param {EnergyCopyTemplateRowExt} b
   */
  function compareRows(a, b) {
    const ka = sortKeyForRow(a);
    const kb = sortKeyForRow(b);
    for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
      const d = (ka[i] ?? 0) - (kb[i] ?? 0);
      if (d !== 0) return d;
    }
    return 0;
  }

  /**
   * @param {string} copyType
   */
  function sortedForType(copyType) {
    const t = String(copyType || "").trim();
    return filtered
      .filter((r) => String(r.copy_type || "").trim() === t)
      .sort(compareRows);
  }

  const usedSemanticKeys = new Set();

  /** headline → main_label → fit → bullets → opening → teaser (effect-first label before fit) */
  const headlineRow = pickOneSlot(sortedForType("headline"), usedSemanticKeys);
  const mainLabelRow = pickOneSlot(sortedForType("main_label"), usedSemanticKeys);
  const fitRow = pickOneSlot(sortedForType("fit_line"), usedSemanticKeys);
  const bulletPick = pickTwoBulletsDistinct(
    sortedForType("bullet"),
    usedSemanticKeys,
  );
  const bulletTexts = bulletPick.texts;
  const openingRow = pickOneSlot(sortedForType("opening"), usedSemanticKeys);
  const teaserRow = pickOneSlot(sortedForType("teaser"), usedSemanticKeys);

  const headline = headlineRow
    ? String(headlineRow.text_th || "").trim() || null
    : null;
  const fitLine = fitRow ? String(fitRow.text_th || "").trim() || null : null;
  const mainLabel = mainLabelRow
    ? String(mainLabelRow.text_th || "").trim() || null
    : null;
  const opening = openingRow
    ? String(openingRow.text_th || "").trim() || null
    : null;
  const teaser = teaserRow
    ? String(teaserRow.text_th || "").trim() || null
    : null;

  /** @type {VisibleSurfaceDiagnostics["dbWordingSlots"]} */
  const dbWordingSlots = [];
  const pushSlot = (slot, row) => {
    if (!row) return;
    dbWordingSlots.push({
      slot,
      rowId: row.id,
      clusterTag: row.cluster_tag ?? null,
      fallbackLevel: Number(row.fallback_level) || 0,
      presentationAngle: row.presentation_angle ?? null,
    });
  };
  pushSlot("headline", headlineRow);
  pushSlot("main_label", mainLabelRow);
  pushSlot("fit_line", fitRow);
  for (const br of bulletPick.rows) {
    pushSlot("bullet", br);
  }
  pushSlot("opening", openingRow);
  pushSlot("teaser", teaserRow);

  let maxFb = 0;
  for (const s of dbWordingSlots) {
    if (Number(s.fallbackLevel) > maxFb) maxFb = Number(s.fallbackLevel);
  }

  /** @type {VisibleSurfaceDiagnostics} */
  const diagnostics = {
    wordingPrimarySource: "db",
    dbWordingSelected: Boolean(headline && bulletTexts.length > 0),
    dbWordingSlots,
    dbWordingFallbackLevel: maxFb,
    visibleCopyUsedCodeFallback: false,
    usedClusterTags: new Set(
      dbWordingSlots.map((x) => String(x.clusterTag || "").trim()).filter(Boolean),
    ),
  };

  return {
    headline,
    fitLine,
    bullets: bulletTexts,
    mainLabel,
    opening,
    teaser,
    diagnostics,
  };
}

/**
 * @param {{ headline?: string|null, bullets?: string[] }} s
 * @returns {boolean}
 */
export function isUsableVisibleSurface(s) {
  return Boolean(
    s &&
      String(s.headline || "").trim() &&
      Array.isArray(s.bullets) &&
      s.bullets.length > 0,
  );
}
