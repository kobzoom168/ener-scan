/**
 * Legacy entry — delegates to the canonical Flex pipeline (scan copy generator + display prep).
 * Production uses `flex/flex.service.js` only; keep this re-export so old imports stay consistent.
 */
export { buildScanFlex } from "./flex/flex.service.js";
