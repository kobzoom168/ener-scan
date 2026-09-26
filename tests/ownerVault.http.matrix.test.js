/**
 * HTTP matrix — เจ้าของดูของเดิมครบทุกเลนโดยไม่ต้องจ่าย · ลิงก์แชร์ไม่เปิดคลัง (Codex 26 ก.ย. 2026)
 *
 * ของจริง: express + report.routes/controller + renderer + template ทุกเลน + owner cookie + LIFF owner-session
 * fixture (ผ่าน loader hook): report loader, library builders, สถานะจ่ายเงิน, teaser — ไม่แตะ DB/เครือข่าย
 *
 * เมทริกซ์: เลน พระ/กำไล/หิน × ผู้ชม เจ้าของ(cookie)/ไม่มี cookie/บัญชีอื่น × คลัง ≤5 / >5
 *           × สถานะจ่าย ไม่เคย/หมดอายุ/แพ็กอยู่ (ต้องไม่มีผล) × ไทย/อังกฤษ
 * เพิ่ม: หน้าคลัง /library · held/pending ยังไม่ปล่อย · ดูรายงานไม่แตะสิทธิ์ · owner-session ผ่าน LINE idToken
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { register } from "node:module";
import { readFileSync } from "node:fs";

for (const [k, v] of Object.entries({
  SUPABASE_URL: "http://127.0.0.1:9", LOCAL_POSTGREST_URL: "http://127.0.0.1:9",
  LOCAL_POSTGREST_ANON_KEY: "x", LOCAL_POSTGREST_SERVICE_KEY: "x", SUPABASE_SERVICE_ROLE_KEY: "x",
  OPENAI_API_KEY: "sk-test", CHANNEL_ACCESS_TOKEN: "t", CHANNEL_SECRET: "s", GEMINI_API_KEY: "g", REDIS_URL: "",
  SESSION_SECRET: "owner-vault-matrix-secret", LIFF_ID: "2000000000-abcdefgh", NODE_ENV: "test",
})) process.env[k] = v;
try {
  for (const line of readFileSync(new URL("../.env.example", import.meta.url), "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=/); if (m && !process.env[m[1]]) process.env[m[1]] = "test-placeholder";
  }
} catch { /* ignore */ }

register("./fixtures/ownerVault/hooks.mjs", import.meta.url);

const { default: express } = await import("express");
const { default: reportRoutes } = await import("../src/routes/report.routes.js");
const { buildOwnerCookieValue, OWNER_COOKIE, ownerVerifyUrl, isSafeOwnerReturnPath } =
  await import("../src/services/reports/ownerProof.util.js");
const { normalizeReportPayloadForRender } = await import("../src/utils/reports/reportPayloadNormalize.util.js");
const { buildSacredAmuletLibraryViewFromPayloadOnly } = await import("../src/services/reports/sacredAmuletLibrary.service.js");
const { buildCrystalBraceletLibraryViewFromPayloadOnly } = await import("../src/services/reports/crystalBraceletLibrary.service.js");
const { buildCrystalBraceletV1Slice } = await import("../src/crystalBracelet/crystalBraceletPayload.build.js");
const { buildMoldaviteV1Slice } = await import("../src/moldavite/moldavitePayload.build.js");
const { resolveMoldaviteDisplayNaming } = await import("../src/moldavite/moldaviteDisplayNaming.util.js");

const OWNER = "U" + "a".repeat(32), OTHER = "U" + "b".repeat(32);
const F = { reports: new Map(), libraries: new Map(), paid: new Map(), teaser: { suit: 88, img: "https://img.test/teaser.jpg", total: 8 }, dailyPick: null };
globalThis.__ownerVaultFixtures = F;
globalThis.__ownerVaultCalls = [];

// ───────── payload ต่อเลน (โครงจากเทสต์ render ของแต่ละเลน) ─────────
const baseSections = { whatItGives: [], messagePoints: [], ownerMatchReason: [], roleDescription: [], bestUseCases: [], weakMoments: [], guidanceTips: [], careNotes: [], miniRitual: [] };
function amuletPayload(token, userId) {
  return {
    reportId: `r-${token}`, publicToken: token, scanId: `s-${token}`, userId, birthdateUsed: "15/06/1990",
    generatedAt: "2026-09-26T10:00:00.000Z", reportVersion: "1",
    object: { objectImageUrl: `https://img.test/${token}.jpg` },
    summary: { energyScore: 8.9, energyLevelLabel: "สูง", mainEnergyLabel: "คุ้มครอง", compatibilityPercent: 84 },
    sections: baseSections, trust: { trustNote: "" }, actions: {}, wording: {},
    amuletV1: {
      version: "1", scoringMode: "deterministic_v2", detection: { reason: "sacred_amulet_lane_v1", matchedSignals: [] },
      powerCategories: {
        protection: { key: "protection", score: 88, labelThai: "คุ้มครองป้องกัน" }, metta: { key: "metta", score: 70, labelThai: "เมตตาและคนเอ็นดู" },
        baramee: { key: "baramee", score: 65, labelThai: "บารมีและอำนาจนำ" }, luck: { key: "luck", score: 89, labelThai: "โชคลาภและการเปิดทาง" },
        fortune_anchor: { key: "fortune_anchor", score: 55, labelThai: "หนุนดวงและการตั้งหลัก" }, specialty: { key: "specialty", score: 50, labelThai: "งานเฉพาะทาง" },
      },
      primaryPower: "luck", secondaryPower: "metta",
      flexSurface: { headline: "พระเครื่อง", fitLine: "", bullets: [], mainEnergyShort: "โชคลาภ", tagline: "", mainEnergyWordingLine: "", htmlOpeningLine: "", heroNamingLine: "" },
      htmlReport: { lifeAreaBlurbs: {}, usageCautionLines: [] },
    },
  };
}
function braceletPayload(token, userId) {
  const slice = buildCrystalBraceletV1Slice({ scanResultId: `rid-${token}`, seedKey: `seed-${token}`, detection: { reason: "crystal_bracelet_lane_v1", matchedSignals: [] }, energyScore: 7.5, mainEnergyLabel: "พลังสมดุล", ownerFitScore: 67, birthdateUsed: "10/04/1995" });
  return { reportId: `r-${token}`, publicToken: token, scanId: `s-${token}`, userId, birthdateUsed: "10/04/1995", generatedAt: "2026-09-26T10:00:00.000Z", reportVersion: "1",
    object: { objectImageUrl: `https://img.test/${token}.jpg` }, summary: { energyScore: 7.5, compatibilityPercent: 67, energyLevelLabel: "A" }, sections: baseSections, trust: { trustNote: "" }, actions: {}, wording: {}, crystalBraceletV1: slice };
}
function moldavitePayload(token, userId) {
  const naming = resolveMoldaviteDisplayNaming({ geminiSubtypeConfidence: 0.9, moldaviteDecisionSource: "gemini", detectionReason: "gemini_crystal_subtype" });
  const mv = buildMoldaviteV1Slice({ scanResultId: `rid-${token}`, detection: { reason: "keyword_match", matchedSignals: ["x"] }, seedKey: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", energyScore: 7.5, mainEnergyLabel: "เร่งการเปลี่ยนแปลง", displayNaming: naming });
  return { reportId: `r-${token}`, publicToken: token, scanId: `s-${token}`, userId, birthdateUsed: "15/03/1990", generatedAt: "2026-09-26T10:00:00.000Z", reportVersion: "1.0.0",
    object: { objectImageUrl: `https://img.test/${token}.jpg`, objectLabel: "วัตถุจากการสแกน", objectType: "" },
    summary: { energyScore: 7.5, energyLevelLabel: "สูง", mainEnergyLabel: mv.flexSurface.mainEnergyShort, compatibilityPercent: 76, compatibilityBand: "เข้ากันดี", summaryLine: "สรุปบรรทัดสำหรับรายงานทดสอบที่ยาวพอสำหรับ normalize ให้ผ่านเกณฑ์ขั้นต่ำของระบบ" },
    sections: { ...baseSections, roleDescription: "" }, trust: { trustNote: "n" }, actions: {}, wording: {}, moldaviteV1: mv };
}
/** ขยายคลังจากรายงานใบเดียวเป็น n ชิ้น (token/รูป/รหัสต่างกัน) */
function expandLibrary(base, n, prefix) {
  if (!base) return null;
  const proto = base.byOverall[0];
  const items = Array.from({ length: n }, (_, i) => ({ ...proto, publicToken: `${prefix}-${i + 1}`, thumbUrl: `https://img.test/${prefix}-${i + 1}.jpg`, displayReportId: `${prefix.toUpperCase()}-${i + 1}`, scanResultV2Id: `sr-${prefix}-${i + 1}`, powerTotal: (proto.powerTotal ?? proto.powerScore ?? 7) }));
  const out = { ...base, totalCount: n, scanCount: n, items, byOverall: items, topOverall: items[0] };
  for (const k of ["byFit", "byProtection", "byMetta", "byBaramee", "byLuck", "byFortuneAnchor", "bySpecialty"]) if (Array.isArray(base[k])) out[k] = items;
  return out;
}
const LANES = {
  amulet: { make: amuletPayload, libKey: "amulet", fromPayload: (p) => buildSacredAmuletLibraryViewFromPayloadOnly(normalizeReportPayloadForRender(p).payload), heading: "คลังพลังของคุณ", blurClass: /mv2r-blur|mv2r-pod--locked|mv2r-row--locked/ },
  bracelet: { make: braceletPayload, libKey: "bracelet", fromPayload: (p) => buildCrystalBraceletLibraryViewFromPayloadOnly(normalizeReportPayloadForRender(p).payload), heading: "คลังกำไลของคุณ", blurClass: /cb2-lib-blur|cb2-lib-unlock/ },
  moldavite: { make: moldavitePayload, libKey: null, fromPayload: () => null, heading: null, blurClass: /pk-tease-img--empty-never/ },
};

const app = express();
app.use(reportRoutes);
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const port = server.address().port;
function get(path, { cookie = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path, method: "GET", headers: { ...headers, ...(cookie ? { cookie: `${OWNER_COOKIE}=${encodeURIComponent(cookie)}` } : {}) } }, (res) => {
      let text = ""; res.on("data", (c) => { text += c; }); res.on("end", () => resolve({ status: res.statusCode, text, location: res.headers.location, setCookie: res.headers["set-cookie"] || [] }));
    });
    req.on("error", reject); req.end();
  });
}
const ownerCookie = buildOwnerCookieValue(OWNER), otherCookie = buildOwnerCookieValue(OTHER);
const PAY_URL_RE = /liff\.line\.me\/[^"' ]*view=pay|lin\.ee\/6YZeFZ1"[^>]*>(เปิดสิทธิ์|ซื้อ)/;
const FORBIDDEN_VIEW_PAYWALL = /เปิดสิทธิ์เพื่อดู|เปิดสิทธิ์ครั้งแรกแล้วดูได้ตลอด|เปิดค่าครูเพื่อดู|Unlock to view|Unlock once|Unlock to see/;

function setup(lane, n, { paid = false, token } = {}) {
  const L = LANES[lane];
  const tok = token || `rpt-${lane}-${n}`;
  const payload = L.make(tok, OWNER);
  F.reports.set(tok, { payload });
  const lib = expandLibrary(L.fromPayload(payload), n, `lib-${lane}`);
  F.libraries.set(OWNER, { amulet: lane === "amulet" ? lib : null, bracelet: lane === "bracelet" ? lib : null });
  F.paid.set(OWNER, paid);
  return { tok, lib };
}
const libTokens = (lib) => (lib?.byOverall || []).map((it) => it.publicToken);

for (const lane of Object.keys(LANES)) for (const n of [3, 8]) {
  test(`${lane} ×${n}: เจ้าของ (cookie) เห็นคลังครบ ชัด ไม่มีปุ่มซื้อเพื่อดู — ไม่ว่าจะจ่ายหรือไม่`, async () => {
    const htmls = [];
    for (const paid of [false, true]) {
      const { tok, lib } = setup(lane, n, { paid });
      const r = await get(`/r/${tok}/body`, { cookie: ownerCookie });
      assert.equal(r.status, 200, `${lane}/${n}/paid=${paid}`);
      assert.doesNotMatch(r.text, FORBIDDEN_VIEW_PAYWALL, "ห้ามมี paywall ของการดูของเดิม");
      assert.doesNotMatch(r.text, LANES[lane].blurClass, "ห้ามมี class เบลอ/ล็อก");
      assert.ok(!/view=pay/.test(r.text.slice(r.text.indexOf(LANES[lane].heading || "<body"))), "ไม่มีลิงก์จ่ายในส่วนคลัง/ท้ายหน้า");
      if (lib) {
        assert.match(r.text, new RegExp(LANES[lane].heading));
        const shown = libTokens(lib).filter((t) => r.text.includes(`/r/${t}`) || r.text.includes(`${t}.jpg`));
        if (lane === "amulet") assert.equal(shown.length, n, `${lane}: เห็นครบ ${n} ชิ้น (ได้ ${shown.length})`);
        else {
          // ส่วนคลังกำไลในหน้ารายงาน = อันดับ 1 + เด่นรายด้าน (ไม่มีลิสต์เต็มโดยดีไซน์ ไม่ใช่ paywall) → ต้องบอกจำนวนจริง + ชิ้นบนสุดชัด
          assert.ok(shown.length >= 1); assert.match(r.text, new RegExp(`${n} เส้น`));
        }
      }
      assert.ok(!/data-owner-vault-cta/.test(r.text), "เจ้าของไม่ต้องเห็นบล็อกยืนยัน");
      assert.match(r.text, /คลังของฉัน/);
      // teaser หนุนดวงวันนี้ = เปิด ไม่เบลอ ลิงก์ไปคลัง
      assert.ok(!/pk-tease-cta[^>]*href="[^"]*view=pay|mv2-tease-btn[^>]*href="[^"]*view=pay/.test(r.text));
      htmls.push(r.text.replace(/\d{2}:\d{2}/g, ""));
    }
    assert.equal(htmls[0], htmls[1], "สถานะจ่าย/ไม่จ่าย ต้องไม่เปลี่ยนหน้าดูของเดิมของเจ้าของ");
  });

  test(`${lane} ×${n}: ไม่มี cookie / cookie บัญชีอื่น → เห็นเฉพาะรายงานที่แชร์ ไม่มีข้อมูลคลัง มีทางยืนยันผ่าน LINE ไม่ใช่หน้าจ่าย`, async () => {
    const { tok, lib } = setup(lane, n);
    for (const [name, cookie] of [["no-cookie", null], ["other-account", otherCookie]]) {
      const r = await get(`/r/${tok}/body`, { cookie });
      assert.equal(r.status, 200, name);
      for (const t of libTokens(lib)) {
        assert.ok(!r.text.includes(`/r/${t}`) && !r.text.includes(`${t}.jpg`) && !r.text.includes(t.toUpperCase()), `${name}: ข้อมูลคลัง ${t} หลุด`);
      }
      if (LANES[lane].heading) assert.ok(!r.text.includes(LANES[lane].heading), `${name}: ห้ามมีหัวข้อคลัง`);
      assert.doesNotMatch(r.text, FORBIDDEN_VIEW_PAYWALL);
      assert.match(r.text, /data-owner-vault-cta="1"/, `${name}: ต้องมีบล็อกยืนยันเจ้าของ`);
      const cta = r.text.slice(r.text.indexOf('data-owner-vault-cta="1"'), r.text.indexOf("</section>", r.text.indexOf('data-owner-vault-cta="1"')));
      assert.match(cta, /view=owner&amp;return=%2Fr%2F/, "ปุ่มไปยืนยันผ่าน LINE แล้วกลับหน้าคลัง");
      assert.ok(!/view=pay/.test(cta), "บล็อกยืนยันห้ามพาไปหน้าจ่าย");
      assert.ok(!/img\.test\/teaser\.jpg/.test(r.text), "teaser ของเจ้าของต้องไม่โผล่ให้ guest");
    }
  });
}

test("หน้าคลัง /library: เจ้าของ 200 ครบทุกชิ้น ไม่ล็อก · ไม่มี cookie/บัญชีอื่น → 302 กลับรายงาน ไม่รั่ว", async () => {
  const { tok, lib } = setup("amulet", 8);
  const own = await get(`/r/${tok}/library`, { cookie: ownerCookie });
  assert.equal(own.status, 200);
  assert.doesNotMatch(own.text, FORBIDDEN_VIEW_PAYWALL); assert.doesNotMatch(own.text, /alib-row--locked|alib-row-img--blur|alib-pod--locked|alib-today-locked/);
  for (const t of libTokens(lib)) assert.ok(own.text.includes(`/r/${t}`), `คลังต้องมี ${t}`);
  assert.match(own.text, /หนุนดวงวันนี้|แรงสุดโดยรวม/);
  for (const cookie of [null, otherCookie]) {
    const r = await get(`/r/${tok}/library`, { cookie });
    assert.equal(r.status, 302); assert.equal(r.location, `/r/${tok}`);
    for (const t of libTokens(lib)) assert.ok(!r.text.includes(t));
  }
});

test("held/pending/failed ยังไม่ถูกปล่อย — ทั้งเจ้าของและ guest", async () => {
  F.reports.set("rpt-held", { accessError: { httpStatus: 503, code: "REPORT_UNAVAILABLE" } });
  for (const cookie of [ownerCookie, null]) {
    const r = await get("/r/rpt-held/body", { cookie });
    assert.equal(r.status, 503); assert.ok(!/data-owner-vault-cta|คลังพลังของคุณ/.test(r.text));
    const l = await get("/r/rpt-held/library", { cookie });
    assert.ok(l.status !== 200);
  }
});

test("ภาษาอังกฤษ (?lang=en) ให้ผลสิทธิ์ตรงกับไทย: เจ้าของครบ · guest ไม่มีคลัง", async () => {
  const { tok, lib } = setup("amulet", 8);
  const own = await get(`/r/${tok}/body?lang=en`, { cookie: ownerCookie });
  assert.equal(own.status, 200); assert.doesNotMatch(own.text, FORBIDDEN_VIEW_PAYWALL);
  assert.equal(libTokens(lib).filter((t) => own.text.includes(`/r/${t}`)).length, 8);
  const guest = await get(`/r/${tok}/body?lang=en`);
  assert.equal(guest.status, 200); for (const t of libTokens(lib)) assert.ok(!guest.text.includes(`/r/${t}`));
  assert.match(guest.text, /data-owner-vault-cta="1"/);
});

test("ดูรายงาน/คลัง ไม่หักสิทธิ์และไม่อ่านสถานะจ่ายเงิน (เส้นดูของเดิมไม่ผูกกับแพ็ก)", async () => {
  globalThis.__ownerVaultCalls.length = 0;
  const { tok } = setup("bracelet", 8, { paid: false });
  await get(`/r/${tok}/body`, { cookie: ownerCookie }); await get(`/r/${tok}/body`); await get(`/r/${tok}/library`, { cookie: ownerCookie });
  assert.ok(!globalThis.__ownerVaultCalls.some(([k]) => k === "hasRecentPaidAccess"), "หน้าดูของเดิมต้องไม่เรียก hasRecentPaidAccess");
  const ctl = readFileSync(new URL("../src/controllers/report.controller.js", import.meta.url), "utf8");
  assert.ok(!/checkScanAccess|claim_paid_scan_decrement|bonus_scans|hasRecentPaidAccess\(/.test(ctl), "controller ต้องไม่แตะสิทธิ์สแกน");
});

test("owner-session (LIFF): ต้องมี LINE idToken ที่ verify ได้ → ออก cookie เจ้าของ · ไม่มี token = 401 ไม่มี cookie · uid มาจาก idToken ไม่ใช่ body", async () => {
  process.env.LIFF_CHANNEL_ID = "2000000000";
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("api.line.me/oauth2/v2.1/verify")) {
      const tok = new URLSearchParams(String(init?.body)).get("id_token");
      if (tok === "good-token") return { ok: true, json: async () => ({ sub: OWNER, exp: Math.floor(Date.now() / 1000) + 300 }) };
      return { ok: false, json: async () => ({}) };
    }
    return realFetch(url, init);
  };
  try {
    const { liffRouter } = await import("../src/routes/liff.routes.js?real");
    const app2 = express(); app2.use(express.json()); app2.use(liffRouter); app2.use(reportRoutes);
    const s2 = app2.listen(0, "127.0.0.1"); await new Promise((r) => s2.once("listening", r));
    const p2 = s2.address().port;
    const post = (headers, body) => new Promise((resolve, reject) => {
      const req = http.request({ hostname: "127.0.0.1", port: p2, path: "/api/liff/owner-session", method: "POST", headers: { "content-type": "application/json", ...headers } }, (res) => {
        let t = ""; res.on("data", (c) => { t += c; }); res.on("end", () => resolve({ status: res.statusCode, text: t, setCookie: res.headers["set-cookie"] || [] }));
      }); req.on("error", reject); req.end(body || "");
    });
    const noTok = await post({}, JSON.stringify({ userId: OWNER }));
    assert.equal(noTok.status, 401); assert.equal(noTok.setCookie.length, 0, "ไม่มี token ห้ามออก cookie");
    const bad = await post({ authorization: "Bearer bad" }, "");
    assert.equal(bad.status, 401); assert.equal(bad.setCookie.length, 0);
    const ok = await post({ authorization: "Bearer good-token" }, JSON.stringify({ userId: OTHER }));
    assert.equal(ok.status, 200);
    const sc = ok.setCookie.find((c) => c.startsWith(`${OWNER_COOKIE}=`));
    assert.ok(sc, "ต้องออก cookie เจ้าของ"); assert.match(sc, /HttpOnly/i); assert.match(sc, /SameSite=Lax/i);
    const cookieVal = decodeURIComponent(sc.split(";")[0].slice(OWNER_COOKIE.length + 1));
    // cookie ที่ได้ = ของ OWNER (จาก idToken) ไม่ใช่ OTHER (จาก body) → เปิดคลังของ OWNER ได้, ของ OTHER ไม่ได้
    const { tok } = setup("amulet", 3);
    const lib = await new Promise((resolve, reject) => {
      const req = http.request({ hostname: "127.0.0.1", port: p2, path: `/r/${tok}/library`, method: "GET", headers: { cookie: `${OWNER_COOKIE}=${encodeURIComponent(cookieVal)}` } }, (res) => { let t = ""; res.on("data", (c) => { t += c; }); res.on("end", () => resolve({ status: res.statusCode, text: t })); }); req.on("error", reject); req.end();
    });
    assert.equal(lib.status, 200, "cookie จาก owner-session เปิดคลังของเจ้าของได้");
    F.reports.set("rpt-of-other", { payload: amuletPayload("rpt-of-other", OTHER) });
    const notMine = await new Promise((resolve, reject) => {
      const req = http.request({ hostname: "127.0.0.1", port: p2, path: "/r/rpt-of-other/library", method: "GET", headers: { cookie: `${OWNER_COOKIE}=${encodeURIComponent(cookieVal)}` } }, (res) => { resolve({ status: res.statusCode }); res.resume(); }); req.on("error", reject); req.end();
    });
    assert.equal(notMine.status, 302, "cookie ของ OWNER เปิดคลังของ OTHER ไม่ได้ (สลับบัญชี A/B)");
    s2.close();
  } finally { globalThis.fetch = realFetch; }
});

test("ownerVerifyUrl: ไปที่ LIFF view=owner กลับได้เฉพาะ path ในโดเมน · ห้ามใส่ uid/token อื่นในลิงก์", () => {
  const u = ownerVerifyUrl("/r/abc/library");
  assert.match(u, /^https:\/\/liff\.line\.me\/2000000000-abcdefgh\?view=owner&return=%2Fr%2Fabc%2Flibrary$/);
  assert.match(ownerVerifyUrl("https://evil.test/x"), /return=%2F$/);
  assert.match(ownerVerifyUrl("/r/abc/../../etc"), /return=%2F$/);
  assert.equal(isSafeOwnerReturnPath("/myscans/ms_abc"), true); assert.equal(isSafeOwnerReturnPath("//evil"), false);
  const liff = readFileSync(new URL("../src/routes/liff.routes.js", import.meta.url), "utf8");
  assert.match(liff, /view=owner/); assert.match(liff, /\/api\/liff\/owner-session/);
  assert.ok(!/req\.(query|body)\.(uid|userId|lineUserId)/.test(liff.slice(liff.indexOf("/api/liff/owner-session"), liff.indexOf("/api/liff/owner-session") + 1200)), "owner-session ห้ามอ่าน uid จาก query/body");
});

test("ช่องทาง LINE: ไม่มีเกตจ่ายเงินสำหรับอันดับ/ชิ้นเด่น/หนุนดวงของเจ้าของ", () => {
  const lw = readFileSync(new URL("../src/routes/lineWebhook.js", import.meta.url), "utf8");
  const gate = lw.slice(lw.indexOf("async function maybeHandleRankingQueryGate"), lw.indexOf("async function maybeHandleAxisTopPieceQuery"));
  assert.ok(!/hasRecentPaidAccess|RANKING_QUERY_REDIRECTED_UNPAID/.test(gate)); assert.match(gate, /return false;/);
  const axis = lw.slice(lw.indexOf("async function maybeHandleAxisTopPieceQuery"), lw.indexOf("async function", lw.indexOf("async function maybeHandleAxisTopPieceQuery") + 10));
  assert.ok(!/hasRecentPaidAccess|<= ?5|เปิดสิทธิ์/.test(axis));
  const dp = readFileSync(new URL("../src/services/dailyLuckyPickPush.service.js", import.meta.url), "utf8");
  assert.ok(!/hasRecentPaidAccess|piecesCount <= 5/.test(dp), "daily pick push ไม่ผูกกับแพ็ก/จำนวนชิ้น");
  assert.match(dp, /const open = true;/);
  for (const f of ["amuletReportV2", "crystalBraceletReportV2", "moldaviteReportV2", "amuletLibraryRanking"]) {
    const t = readFileSync(new URL(`../src/templates/reports/${f}.template.js`, import.meta.url), "utf8").split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    assert.ok(!/memberAccess|censorAll|lockedAll|เปิดสิทธิ์เพื่อดู|filter:\s*blur\(9px\)/.test(t), `${f} ยังมี paywall/blur ของการดูของเดิม`);
  }
});

test.after(() => new Promise((r) => server.close(r)));
