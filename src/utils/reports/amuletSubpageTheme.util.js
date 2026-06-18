/**
 * Shared dark-gold theme for amulet HTML subpages (library, energy meaning, timing).
 * Palette aligned with `html.mv2a-theme-dark` in amuletReportV2.template.js.
 */

/** @type {readonly ["alib", "aem", "aet"]} */
export const AMULET_SUBPAGE_THEME_PREFIXES = ["alib", "aem", "aet"];

/**
 * Inline script — auto-apply dark when OS prefers dark (same as report V2).
 * @returns {string}
 */
export function amuletSubpageAutoDarkScriptHtml() {
  return `<script>try{if(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches){document.documentElement.classList.add("amulet-subpage-dark");}}catch(e){}</script>`;
}

/**
 * Dark theme CSS variable overrides for a subpage prefix.
 * @param {"alib"|"aem"|"aet"} prefix
 * @returns {string}
 */
export function buildAmuletSubpageDarkThemeCss(prefix) {
  const p = String(prefix || "alib").trim();
  return `
    html.amulet-subpage-dark {
      color-scheme: dark;
      --${p}-bg: #090a0d;
      --${p}-surface: #13151c;
      --${p}-elevated: #1a1d26;
      --${p}-border: rgba(232, 197, 71, 0.2);
      --${p}-gold: #e8c547;
      --${p}-gold-soft: #b8860b;
      --${p}-text: #f1f5f9;
      --${p}-body: rgba(241, 245, 249, 0.94);
      --${p}-muted: #94a3b8;
      --${p}-subtitle: rgba(148, 163, 184, 0.92);
      --${p}-chip-bg: rgba(232, 197, 71, 0.1);
      --${p}-chip-border: rgba(232, 197, 71, 0.28);
      --${p}-panel-bg: linear-gradient(180deg, #151820 0%, #11141b 100%);
      --${p}-safety-bg: #151820;
      --${p}-btn-text: #090a0d;
      --${p}-shadow: 0 4px 18px rgba(0, 0, 0, 0.45);
      --${p}-img-bg: rgba(232, 197, 71, 0.08);
      --${p}-img-empty: repeating-linear-gradient(-45deg, rgba(232,197,71,0.12), rgba(232,197,71,0.12) 6px, transparent 6px, transparent 12px);
      --${p}-dup-possible-bg: rgba(232, 160, 60, 0.14);
      --${p}-dup-possible-text: #f0c878;
      --${p}-pin-upsell-bg: rgba(232, 197, 71, 0.12);
      --${p}-pin-upsell-text: #e8c547;
      --${p}-pin-flash-ok: #6ee7a0;
      --${p}-pin-flash-err: #f0a060;
    }`;
}
