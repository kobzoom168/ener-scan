import fs from "fs";
import path from "path";
import crypto from "crypto";
import imghash from "imghash";

const TEMP_DIR = path.join(process.cwd(), "tmp");
const seenHashes = new Set();

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

async function bufferToTempFile(buffer) {
  const fileName = `${crypto.randomUUID()}.jpg`;
  const filePath = path.join(TEMP_DIR, fileName);
  await fs.promises.writeFile(filePath, buffer);
  return filePath;
}

export async function getImageHash(imageBuffer) {
  const tempFile = await bufferToTempFile(imageBuffer);

  try {
    const hash = await imghash.hash(tempFile, 16, "hex");
    return hash;
  } finally {
    await fs.promises.unlink(tempFile).catch(() => {});
  }
}

export async function isDuplicateImage(imageBuffer) {
  const hash = await getImageHash(imageBuffer);

  if (seenHashes.has(hash)) {
    return true;
  }

  seenHashes.add(hash);
  return false;
}