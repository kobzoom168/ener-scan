/**
 * Data layer: energy category labels + copy templates (headline / fit_line / bullets).
 * Used by `energyCopyFlex.service.js` for LINE summary-first Flex; other call sites may adopt later.
 */
import { supabase } from "../config/supabase.js";
import { selectEnergyCopyFromTemplates } from "../utils/energyCopySelect.util.js";

/** Supabase row shape including optional angle/slot metadata (ignored by legacy selector). */
export const ENERGY_COPY_TEMPLATE_SELECT =
  "id,category_code,object_family,copy_type,tone,text_th,weight,is_active,presentation_angle,cluster_tag,fallback_level,visible_tone";

const ENERGY_COPY_TEMPLATE_SELECT_LEGACY =
  "id,category_code,object_family,copy_type,tone,text_th,weight,is_active";

export const ENERGY_OBJECT_FAMILIES = Object.freeze([
  "all",
  "thai_amulet",
  "thai_talisman",
  "crystal",
  "global_symbol",
]);

export const ENERGY_COPY_TYPES = Object.freeze(["headline", "fit_line", "bullet"]);

export const ENERGY_TONES = Object.freeze(["hard", "normal", "soft"]);

/**
 * @typedef {object} EnergyCategoryRow
 * @property {string} code
 * @property {string} name_th
 * @property {string} display_name_th
 * @property {string|null} [short_name_th]
 * @property {string|null} [description_th]
 * @property {string} tone_default
 * @property {number} priority
 * @property {boolean} is_active
 */

/**
 * @param {string} code
 * @returns {Promise<EnergyCategoryRow | null>}
 */
export async function getEnergyCategory(code) {
  const c = String(code || "").trim();
  if (!c) return null;

  const { data, error } = await supabase
    .from("energy_categories")
    .select(
      "code,name_th,display_name_th,short_name_th,description_th,tone_default,priority,is_active,created_at,updated_at",
    )
    .eq("code", c)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("[SUPABASE] getEnergyCategory", {
      categoryCode: c,
      message: error.message,
      supabaseCode: error.code,
    });
    throw error;
  }
  return data || null;
}

/**
 * @typedef {object} GetEnergyCopySetParams
 * @property {string} categoryCode
 * @property {string} [objectFamily] — default all
 * @property {string} [tone] — hard | normal | soft
 */

/**
 * @typedef {object} EnergyCopySet
 * @property {string|null} headline
 * @property {string|null} fitLine
 * @property {string[]} bullets — up to 2 lines
 */

/**
 * Loads templates for category + tone, including `object_family` in (family, all).
 * Selects one headline, one fit_line, two bullets using weight/id ordering.
 *
 * @param {GetEnergyCopySetParams} p
 * @returns {Promise<EnergyCopySet>}
 */
export async function getEnergyCopySet({
  categoryCode,
  objectFamily = "all",
  tone = "hard",
}) {
  const cat = String(categoryCode || "").trim();
  if (!cat) {
    return { headline: null, fitLine: null, bullets: [] };
  }
  const fam = String(objectFamily || "all").trim() || "all";
  const toneVal = String(tone || "hard").trim() || "hard";

  const families =
    fam === "all" ? ["all"] : [fam, "all"];

  const rows = await getEnergyCopyTemplateRowsBundle({
    categoryCode: cat,
    objectFamily: fam,
    tone: toneVal,
  });
  return selectEnergyCopyFromTemplates(rows, fam);
}

/**
 * Raw template rows for visible wording selector (angle / cluster / main_label).
 *
 * @param {GetEnergyCopySetParams} p
 * @returns {Promise<object[]>}
 */
export async function getEnergyCopyTemplateRowsBundle({
  categoryCode,
  objectFamily = "all",
  tone = "hard",
}) {
  const cat = String(categoryCode || "").trim();
  if (!cat) {
    return [];
  }
  const fam = String(objectFamily || "all").trim() || "all";
  const toneVal = String(tone || "hard").trim() || "hard";

  const families = fam === "all" ? ["all"] : [fam, "all"];

  let { data, error } = await supabase
    .from("energy_copy_templates")
    .select(ENERGY_COPY_TEMPLATE_SELECT)
    .eq("category_code", cat)
    .eq("tone", toneVal)
    .eq("is_active", true)
    .in("object_family", families);

  if (
    error &&
    (error.code === "42703" ||
      String(error.message || "").includes("presentation_angle"))
  ) {
    const retry = await supabase
      .from("energy_copy_templates")
      .select(ENERGY_COPY_TEMPLATE_SELECT_LEGACY)
      .eq("category_code", cat)
      .eq("tone", toneVal)
      .eq("is_active", true)
      .in("object_family", families);
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    console.error("[SUPABASE] getEnergyCopyTemplateRowsBundle", {
      categoryCode: cat,
      objectFamily: fam,
      tone: toneVal,
      message: error.message,
      supabaseCode: error.code,
    });
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

/**
 * Loads templates for category + tone with **only** `object_family = crystal`.
 * Used to detect whether DB has crystal-specific rows; avoids generic `all` copy winning when crystal rows are missing.
 *
 * @param {GetEnergyCopySetParams} p
 * @returns {Promise<EnergyCopySet>}
 */
export async function getEnergyCopySetCrystalOnly({
  categoryCode,
  tone = "hard",
}) {
  const cat = String(categoryCode || "").trim();
  if (!cat) {
    return { headline: null, fitLine: null, bullets: [] };
  }
  const toneVal = String(tone || "hard").trim() || "hard";

  const rows = await getEnergyCopyTemplateRowsCrystalOnly({
    categoryCode: cat,
    tone: toneVal,
  });
  return selectEnergyCopyFromTemplates(rows, "crystal");
}

/**
 * @param {{ categoryCode: string, tone?: string }} p
 * @returns {Promise<object[]>}
 */
export async function getEnergyCopyTemplateRowsCrystalOnly({
  categoryCode,
  tone = "hard",
}) {
  const cat = String(categoryCode || "").trim();
  if (!cat) {
    return [];
  }
  const toneVal = String(tone || "hard").trim() || "hard";

  let { data, error } = await supabase
    .from("energy_copy_templates")
    .select(ENERGY_COPY_TEMPLATE_SELECT)
    .eq("category_code", cat)
    .eq("tone", toneVal)
    .eq("is_active", true)
    .eq("object_family", "crystal");

  if (
    error &&
    (error.code === "42703" ||
      String(error.message || "").includes("presentation_angle"))
  ) {
    const retry = await supabase
      .from("energy_copy_templates")
      .select(ENERGY_COPY_TEMPLATE_SELECT_LEGACY)
      .eq("category_code", cat)
      .eq("tone", toneVal)
      .eq("is_active", true)
      .eq("object_family", "crystal");
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    console.error("[SUPABASE] getEnergyCopyTemplateRowsCrystalOnly", {
      categoryCode: cat,
      tone: toneVal,
      message: error.message,
      supabaseCode: error.code,
    });
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

/**
 * @typedef {object} ObjectFamilyCategoryRow
 * @property {number} priority
 * @property {string} categoryCode
 * @property {EnergyCategoryRow|null} category
 */

/**
 * Categories suggested for an object family, ordered by map priority.
 *
 * @param {string} objectFamily — e.g. crystal, thai_amulet
 * @returns {Promise<ObjectFamilyCategoryRow[]>}
 */
export async function getObjectFamilyCategories(objectFamily) {
  const fam = String(objectFamily || "").trim();
  if (!fam) return [];

  const { data: maps, error: mapError } = await supabase
    .from("object_family_category_map")
    .select("priority,category_code")
    .eq("object_family", fam)
    .eq("is_active", true)
    .order("priority", { ascending: true });

  if (mapError) {
    console.error("[SUPABASE] getObjectFamilyCategories map", {
      objectFamily: fam,
      message: mapError.message,
      supabaseCode: mapError.code,
    });
    throw mapError;
  }

  const list = Array.isArray(maps) ? maps : [];
  if (list.length === 0) return [];

  const codes = [...new Set(list.map((m) => String(m.category_code || "").trim()).filter(Boolean))];
  if (codes.length === 0) return [];

  const { data: cats, error: catError } = await supabase
    .from("energy_categories")
    .select(
      "code,name_th,display_name_th,short_name_th,description_th,tone_default,priority,is_active",
    )
    .in("code", codes)
    .eq("is_active", true);

  if (catError) {
    console.error("[SUPABASE] getObjectFamilyCategories categories", {
      message: catError.message,
      supabaseCode: catError.code,
    });
    throw catError;
  }

  const byCode = new Map(
    (Array.isArray(cats) ? cats : []).map((row) => [row.code, row]),
  );

  return list.map((m) => {
    const categoryCode = String(m.category_code || "").trim();
    return {
      priority: Number(m.priority) || 0,
      categoryCode,
      category: byCode.get(categoryCode) || null,
    };
  });
}
