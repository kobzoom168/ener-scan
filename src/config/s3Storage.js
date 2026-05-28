import { S3Client } from "@aws-sdk/client-s3";
import { env } from "./env.js";

export const s3Client = env.S3_ENDPOINT_URL
  ? new S3Client({
      region: env.S3_REGION || "auto",
      endpoint: env.S3_ENDPOINT_URL,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
    })
  : null;

export const S3_ENABLED = Boolean(s3Client && env.S3_ACCESS_KEY_ID);
