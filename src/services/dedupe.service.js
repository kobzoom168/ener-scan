import fs from "fs";
import path from "path";
import crypto from "crypto";
import imghash from "imghash";

const TEMP_DIR = path.join(process.cwd(), "tmp");
const seenHashes = [];

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

async function bufferToTempFile(buffer) {
  const fileName = `${crypto.randomUUID()}.jpg`;
  const filePath = path.join(TEMP_DIR, fileName);
  await fs.promises.writeFile(filePath, buffer);
  return filePath;
}

function hammingDistance(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;

  let distance = 0;
  for (let i = 0; i < a.length; i++) {
    const x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    distance += x.toString(2).split("1").length - 1;
  }
  return distance;
}

export async function getImageHash(imageBuffer) {
  const tempFile = await bufferToTempFile(imageBuffer);

  try {
    return await imghash.hash(tempFile, 16, "hex");
  } finally {
    await fs.promises.unlink(tempFile).catch(() => {});
  }
}

export async function isDuplicateImage(imageBuffer) {
  const hash = await getImageHash(imageBuffer);

  for (const oldHash of seenHashes) {
    const distance = hammingDistance(hash, oldHash);

    if (distance <= 6) {
      return true;
    }
  }

  seenHashes.push(hash);

  if (seenHashes.length > 500) {
    seenHashes.shift();
  }

  return false;
}