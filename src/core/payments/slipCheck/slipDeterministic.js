/**
 * Fast deterministic hints for slip gate (no network).
 * Never returns accept — only fast-reject hints or "needs_vision".
 */

/** @typedef {'jpeg' | 'png' | 'webp' | 'gif' | 'unknown'} ImageFormat */

const MIN_BYTES_UNCLEAR = 1200;
/** Very tall single-frame screenshots (LINE chat, etc.) — tighter catches more portrait chat UI */
const CHAT_ASPECT_MIN = 2.15;
const CHAT_MIN_WIDTH = 320;

/**
 * @param {Buffer} buf
 * @returns {{ width: number, height: number } | null}
 */
function readPngDimensions(buf) {
  if (buf.length < 24) return null;
  const sig = buf.slice(0, 8).toString("hex");
  if (sig !== "89504e470d0a1a0a") return null;
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) return null;
  return { width: w, height: h };
}

/**
 * @param {Buffer} buf
 * @returns {{ width: number, height: number } | null}
 */
function readJpegDimensions(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length - 8) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      i += 2;
      continue;
    }
    if (i + 3 >= buf.length) break;
    const segLen = buf.readUInt16BE(i + 2);
    if (segLen < 2 || i + 2 + segLen > buf.length) break;

    if (
      marker === 0xc0 ||
      marker === 0xc1 ||
      marker === 0xc2 ||
      marker === 0xc3
    ) {
      if (i + 9 > buf.length) return null;
      const h = buf.readUInt16BE(i + 5);
      const w = buf.readUInt16BE(i + 7);
      if (w >= 1 && h >= 1) return { width: w, height: h };
      return null;
    }

    i += 2 + segLen;
  }
  return null;
}

/**
 * @param {Buffer} buf
 * @returns {ImageFormat}
 */
function detectFormat(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return "jpeg";
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  )
    return "png";
  if (buf.length >= 12) {
    const head = buf.slice(0, 12).toString("ascii");
    if (head.startsWith("RIFF") && head.includes("WEBP")) return "webp";
  }
  if (buf.length >= 6 && buf.slice(0, 6).toString("ascii") === "GIF87a")
    return "gif";
  return "unknown";
}

/**
 * @param {Buffer} imageBuffer
 * @returns {{
 *   format: ImageFormat,
 *   byteLength: number,
 *   width: number | null,
 *   height: number | null,
 *   aspectRatio: number | null,
 * }}
 */
export function getImageMetadata(imageBuffer) {
  const buf = Buffer.isBuffer(imageBuffer)
    ? imageBuffer
    : Buffer.from(imageBuffer || []);
  const format = detectFormat(buf);
  let width = null;
  let height = null;

  if (format === "png") {
    const d = readPngDimensions(buf);
    if (d) {
      width = d.width;
      height = d.height;
    }
  } else if (format === "jpeg") {
    const d = readJpegDimensions(buf);
    if (d) {
      width = d.width;
      height = d.height;
    }
  }

  let aspectRatio = null;
  if (width && height && width > 0 && height > 0) {
    aspectRatio = height / width;
  }

  return {
    format,
    byteLength: buf.length,
    width,
    height,
    aspectRatio,
  };
}

/**
 * Fast-reject obvious chat-style screenshots by aspect ratio.
 * @returns {{ kind: 'fast_reject_chat' } | { kind: 'too_small' } | { kind: 'needs_vision' }}
 */
export function deterministicSlipPreCheck(imageBuffer) {
  const meta = getImageMetadata(imageBuffer);

  if (meta.byteLength < MIN_BYTES_UNCLEAR) {
    return { kind: "too_small", meta };
  }

  if (
    meta.aspectRatio != null &&
    meta.aspectRatio >= CHAT_ASPECT_MIN &&
    meta.width != null &&
    meta.width >= CHAT_MIN_WIDTH
  ) {
    return { kind: "fast_reject_chat", meta };
  }

  return { kind: "needs_vision", meta };
}
