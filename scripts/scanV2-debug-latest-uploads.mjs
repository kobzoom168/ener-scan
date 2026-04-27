import { env } from "../src/config/env.js";
import { listRecentScanUploadsDebug } from "../src/stores/scanV2/scanUploads.db.js";

const rawLimit = process.argv[2];
const limit = rawLimit ? Number(rawLimit) : 20;

async function main() {
  const rows = await listRecentScanUploadsDebug(limit);
  console.log(
    JSON.stringify(
      {
        event: "SCAN_V2_DEBUG_LATEST_UPLOADS",
        appEnv: env.APP_ENV,
        limit: Number.isFinite(limit) ? limit : 20,
        count: rows.length,
        rows,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(
    JSON.stringify({
      event: "SCAN_V2_DEBUG_LATEST_UPLOADS_ERROR",
      reason: String(err?.message || err).slice(0, 300),
    }),
  );
  process.exitCode = 1;
});
