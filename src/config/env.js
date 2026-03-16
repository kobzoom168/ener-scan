import dotenv from "dotenv";

dotenv.config();

const requiredEnv = [
  "OPENAI_API_KEY",
  "CHANNEL_ACCESS_TOKEN",
  "CHANNEL_SECRET",
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`${key} missing`);
  }
}

export const env = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  CHANNEL_ACCESS_TOKEN: process.env.CHANNEL_ACCESS_TOKEN,
  CHANNEL_SECRET: process.env.CHANNEL_SECRET,
  PORT: process.env.PORT || 3000,
};