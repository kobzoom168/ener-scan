// loader hook สำหรับ HTTP matrix test คลังเจ้าของ: แทนที่ store/บริการที่ต้องใช้ DB ด้วย fixture ในหน่วยความจำ
// (ของจริงที่ยังใช้: express, report.routes/controller, renderer, template ทุกเลน, ownerProof cookie, liff owner-session)
export async function resolve(specifier, context, nextResolve) {
  const parent = String(context.parentURL || "");
  const fromFake = parent.includes("/tests/fixtures/ownerVault/");
  if (!fromFake && !specifier.includes("?real")) {
    const map = {
      "reports/reportQuery.service.js": "fake-reportQuery.mjs",
      "reports/sacredAmuletLibrary.service.js": "fake-sacredAmuletLibrary.mjs",
      "reports/crystalBraceletLibrary.service.js": "fake-crystalBraceletLibrary.mjs",
      "services/everPaid.service.js": "fake-everPaid.mjs",
      "routes/liff.routes.js": "fake-liffRoutes.mjs",
    };
    for (const [suffix, fake] of Object.entries(map)) {
      if (specifier.endsWith(suffix) && !parent.includes("/tests/")) {
        return { url: new URL(`./${fake}`, import.meta.url).href, shortCircuit: true };
      }
    }
  }
  return nextResolve(specifier.replace(/\?real$/, ""), context);
}
