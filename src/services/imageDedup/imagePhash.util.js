/**
 * Perceptual image hashing (dHash) for duplicate detection.
 *
 * Algorithm: resize to 9×8 grayscale, compare each pixel to its right neighbor
 * → 64-bit hash as 16-char hex string.
 *
 * Two images with Hamming distance ≤ DEDUP_THRESHOLD are considered duplicates.
 */
import sharp from "sharp";

/** Default Hamming distance threshold (out of 64 bits). 10 = ~same object, different angle/lighting. */
export const DEDUP_HAMMING_THRESHOLD = 10;

/**
 * Compute dHash of an image buffer.
 * @param {Buffer} buffer
 * @returns {Promise<string>} 16-char hex string (64-bit hash)
 */
export async function computeImageDHash(buffer) {
  const { data } = await sharp(buffer)
    .resize(9, 8, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let bits = "";
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const idx = row * 9 + col;
      bits += data[idx] < data[idx + 1] ? "1" : "0";
    }
  }

  let hex = "";
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

/**
 * Hamming distance between two 16-char hex hashes.
 * @param {string} h1
 * @param {string} h2
 * @returns {number} number of differing bits (0–64)
 */
export function hammingDistance(h1, h2) {
  if (!h1 || !h2 || h1.length !== 16 || h2.length !== 16) return 64;
  let dist = 0;
  for (let i = 0; i < 16; i++) {
    const xor = parseInt(h1[i], 16) ^ parseInt(h2[i], 16);
    // popcount nibble
    dist += [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4][xor];
  }
  return dist;
}

/**
 * @param {string} h1
 * @param {string} h2
 * @param {number} [threshold]
 * @returns {boolean}
 */
export function isDuplicateImage(h1, h2, threshold = DEDUP_HAMMING_THRESHOLD) {
  return hammingDistance(h1, h2) <= threshold;
}
