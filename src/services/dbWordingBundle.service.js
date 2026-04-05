/**
 * Unified DB-first visible wording: single entry for Flex, report payload, and LINE summary.
 * Uses `energy_copy_templates` + {@link ../utils/visibleWordingSelect.util.js}.
 */
import {
  getEnergyCategory,
  getEnergyCopyTemplateRowsBundle,
  getEnergyCopyTemplateRowsCrystalOnly,
} from "./energyCopy.service.js";
import {
  isUsableVisibleSurface,
  selectVisibleSurfaceFromTemplates,
} from "../utils/visibleWordingSelect.util.js";
import { normalizeObjectFamilyForEnergyCopy } from "../utils/energyCategoryResolve.util.js";

/**
 * @typedef {object} ResolveVisibleWordingBundleParams
 * @property {string} categoryCode
 * @property {string} [objectFamilyRaw]
 * @property {string} [presentationAngleId]
 * @property {"general"|"spiritual_growth"|null|""} [crystalMode]
 * @property {string} [visibleTone]
 */

/**
 * Crystal-only: fetch rows for category + tone (no object_family merge).
 *
 * @param {string} categoryCode
 * @param {string} tone
 * @returns {Promise<object[]>}
 */
async function fetchCrystalRowsForCategory(categoryCode, tone) {
  try {
    return await getEnergyCopyTemplateRowsCrystalOnly({
      categoryCode: String(categoryCode || "").trim(),
      tone,
    });
  } catch (e) {
    console.warn("[dbWordingBundle] getEnergyCopyTemplateRowsCrystalOnly failed", {
      categoryCode,
      message: e?.message,
    });
    return [];
  }
}

/**
 * Primary resolver: angle-aware bundle for headline / main_label / fit_line / bullets / opening / teaser.
 *
 * @param {ResolveVisibleWordingBundleParams} p
 * @returns {Promise<{ bundle: ReturnType<typeof selectVisibleSurfaceFromTemplates>, toneUsed: string, categoryUsed: string, rowSource: string } | null>}
 */
export async function resolveVisibleWordingBundleFromDb(p) {
  const codeIn = String(p.categoryCode || "").trim();
  if (!codeIn) return null;
  const famNorm = normalizeObjectFamilyForEnergyCopy(
    String(p.objectFamilyRaw || ""),
  );
  const presentationAngle = String(p.presentationAngleId || "").trim();
  const visibleTone = String(p.visibleTone || "plain_th").trim() || "plain_th";
  const crystalMode = p.crystalMode ?? "";

  let tone = "hard";
  try {
    const row = await getEnergyCategory(codeIn);
    if (row) tone = String(row.tone_default || "hard").trim() || "hard";
  } catch {
    /* keep default */
  }

  const ctx = {
    preferredFamily: famNorm === "crystal" ? "crystal" : famNorm,
    presentationAngle,
    visibleTone,
  };

  /* Crystal: fetch only `object_family = crystal` rows first; retry spiritual_growth if mode matches.
   * Code fallback for incomplete surfaces uses composeFlexShortSurface with objectFamily → crystal branch. */
  if (famNorm === "crystal") {
    const primaryCode = String(codeIn || "").trim() || "luck_fortune";
    let raw = await fetchCrystalRowsForCategory(primaryCode, tone);
    let bundle = selectVisibleSurfaceFromTemplates(raw, {
      ...ctx,
      preferredFamily: "crystal",
    });
    if (isUsableVisibleSurface(bundle)) {
      return {
        bundle,
        toneUsed: tone,
        categoryUsed: primaryCode,
        rowSource: "crystal_only",
      };
    }
    if (
      String(crystalMode || "").trim() === "spiritual_growth" &&
      primaryCode !== "spiritual_growth"
    ) {
      raw = await fetchCrystalRowsForCategory("spiritual_growth", tone);
      bundle = selectVisibleSurfaceFromTemplates(raw, {
        ...ctx,
        preferredFamily: "crystal",
      });
      if (isUsableVisibleSurface(bundle)) {
        return {
          bundle,
          toneUsed: tone,
          categoryUsed: "spiritual_growth",
          rowSource: "crystal_spiritual_growth_retry",
        };
      }
    }
    return null;
  }

  let rawRows = [];
  try {
    rawRows = await getEnergyCopyTemplateRowsBundle({
      categoryCode: codeIn,
      objectFamily: famNorm,
      tone,
    });
  } catch (e) {
    console.warn("[dbWordingBundle] getEnergyCopyTemplateRowsBundle failed", {
      categoryCode: codeIn,
      message: e?.message,
    });
    return null;
  }

  const bundle = selectVisibleSurfaceFromTemplates(rawRows, {
    ...ctx,
    preferredFamily: famNorm,
  });
  if (!isUsableVisibleSurface(bundle)) return null;
  return {
    bundle,
    toneUsed: tone,
    categoryUsed: codeIn,
    rowSource: "family_plus_all",
  };
}

/**
 * @param {Awaited<ReturnType<typeof resolveVisibleWordingBundleFromDb>>} resolved
 * @returns {object}
 */
export function logFieldsFromDbBundle(resolved) {
  const b = resolved?.bundle;
  const slots = b?.diagnostics?.dbWordingSlots || [];
  const first = slots[0];
  return {
    wordingPrimarySource: "db",
    dbWordingSelected: Boolean(b?.diagnostics?.dbWordingSelected),
    dbWordingRowId: first?.rowId ?? null,
    dbWordingSlot: first?.slot ?? null,
    dbWordingPresentationAngle: first?.presentationAngle ?? null,
    dbWordingClusterTag: first?.clusterTag ?? null,
    dbWordingFallbackLevel: b?.diagnostics?.dbWordingFallbackLevel ?? null,
  };
}
