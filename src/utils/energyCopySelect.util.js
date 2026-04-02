/**
 * Pure selection rules for energy_copy_templates rows (DB-agnostic).
 * Prefer object_family match over `all`, then weight asc, then id asc.
 */

/** @typedef {{ id?: string|number, object_family: string, copy_type: string, text_th: string, weight: number }} EnergyCopyTemplateRow */

/**
 * @param {EnergyCopyTemplateRow} r
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
 * @param {EnergyCopyTemplateRow} a
 * @param {EnergyCopyTemplateRow} b
 * @param {string} preferredFamily
 * @returns {number}
 */
function compareTemplate(a, b, preferredFamily) {
  const ra = familyRank(a, preferredFamily);
  const rb = familyRank(b, preferredFamily);
  if (ra !== rb) return ra - rb;
  const wa = Number(a.weight) || 0;
  const wb = Number(b.weight) || 0;
  if (wa !== wb) return wa - wb;
  const ida = Number(a.id);
  const idb = Number(b.id);
  if (Number.isFinite(ida) && Number.isFinite(idb) && ida !== idb) {
    return ida - idb;
  }
  return String(a.text_th || "").localeCompare(String(b.text_th || ""));
}

/**
 * @param {EnergyCopyTemplateRow[]} rows
 * @param {string} copyType
 * @param {string} preferredFamily
 * @returns {EnergyCopyTemplateRow[]}
 */
function sortedByType(rows, copyType, preferredFamily) {
  const t = String(copyType || "").trim();
  return [...rows]
    .filter((r) => String(r.copy_type || "").trim() === t)
    .sort((a, b) => compareTemplate(a, b, preferredFamily));
}

/**
 * Picks one headline, one fit_line, and up to two bullets from template rows.
 *
 * @param {EnergyCopyTemplateRow[]} rows — already filtered by category/tone/active/family query
 * @param {string} [preferredFamily] — e.g. crystal, thai_amulet
 * @returns {{ headline: string | null, fitLine: string | null, bullets: string[] }}
 */
export function selectEnergyCopyFromTemplates(rows, preferredFamily) {
  const fam = String(preferredFamily || "all").trim() || "all";
  const list = Array.isArray(rows) ? rows : [];
  const headline = sortedByType(list, "headline", fam)[0];
  const fitLine = sortedByType(list, "fit_line", fam)[0];
  const bulletRows = sortedByType(list, "bullet", fam).slice(0, 2);
  const bullets = bulletRows
    .map((r) => String(r.text_th || "").trim())
    .filter(Boolean);
  return {
    headline: headline ? String(headline.text_th || "").trim() || null : null,
    fitLine: fitLine ? String(fitLine.text_th || "").trim() || null : null,
    bullets,
  };
}
