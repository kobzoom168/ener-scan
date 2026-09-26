/**
 * Browser-flow — ปุ่ม "ยืนยันผ่าน LINE" กดจริง (Codex 26 ก.ย. 2026 รอบ 6)
 *
 * ไม่สร้าง signed cookie ข้ามขั้น: cookie ต้องมาจาก POST /api/liff/owner-session จริง (LINE verify ถูกจำลองที่ fetch)
 * "เบราว์เซอร์" = cookie jar + api() ที่ใส่ Authorization Bearer <idToken> + navigate() ที่บันทึกปลายทาง
 * ใช้โมดูลเดียวกับที่ฝังใน LIFF HTML (liffOwnerVerify.client.js)
 *
 * เคส: มีโปรไฟล์ / ไม่มีโปรไฟล์ (flow ต้องไม่แตะ /api/liff/profile) · token หมดอายุ · API ล้ม · cookie ออกไม่ได้ ·
 *       บัญชีอื่นเปิดลิงก์ · ไม่วน redirect เอง · หน้า LIFF ฝัง flow ก่อนเช็คโปรไฟล์
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
  SESSION_SECRET: "owner-verify-flow-secret", LIFF_ID: "2000000000-abcdefgh", LIFF_CHANNEL_ID: "2000000000", NODE_ENV: "test",
})) process.env[k] = v;
try {
  for (const line of readFileSync(new URL("../.env.example", import.meta.url), "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=/); if (m && !process.env[m[1]]) process.env[m[1]] = "test-placeholder";
  }
} catch { /* ignore */ }
register("./fixtures/ownerVault/hooks.mjs", import.meta.url);

const { default: express } = await import("express");
const { liffRouter } = await import("../src/routes/liff.routes.js?real");
const { default: reportRoutes } = await import("../src/routes/report.routes.js");
const { OWNER_COOKIE } = await import("../src/services/reports/ownerProof.util.js");
const { createOwnerVerifyFlow, readOwnerReturnPath, isOwnerVerifyRequest, createLiffApi, runOwnerVerifyBoot } = await import("../src/routes/liffOwnerVerify.client.js");

const A = "U" + "a".repeat(32), B = "U" + "b".repeat(32);
// LINE verify จำลอง: token → uid (หมดอายุ = ไม่ผ่าน)
const TOKENS = { "tok-A": A, "tok-B": B };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).includes("api.line.me/oauth2/v2.1/verify")) {
    const tok = new URLSearchParams(String(init?.body)).get("id_token");
    const uid = TOKENS[tok];
    return uid ? { ok: true, json: async () => ({ sub: uid, exp: Math.floor(Date.now() / 1000) + 300 }) } : { ok: false, json: async () => ({ error: "invalid" }) };
  }
  return realFetch(url, init);
};

// report fixture (เลนพระ) ของ A พร้อมคลัง 3 ชิ้น
const F = { reports: new Map(), libraries: new Map(), paid: new Map(), teaser: null, dailyPick: null };
globalThis.__ownerVaultFixtures = F; globalThis.__ownerVaultCalls = [];
const { buildSacredAmuletLibraryViewFromPayloadOnly } = await import("../src/services/reports/sacredAmuletLibrary.service.js");
const { normalizeReportPayloadForRender } = await import("../src/utils/reports/reportPayloadNormalize.util.js");
const baseSections = { whatItGives: [], messagePoints: [], ownerMatchReason: [], roleDescription: [], bestUseCases: [], weakMoments: [], guidanceTips: [], careNotes: [], miniRitual: [] };
const payload = { reportId: "r-A1", publicToken: "rpt-A1", scanId: "s-A1", userId: A, birthdateUsed: "15/06/1990", generatedAt: "2026-09-26T10:00:00.000Z", reportVersion: "1",
  object: { objectImageUrl: "https://img.test/A1.jpg" }, summary: { energyScore: 8.9, energyLevelLabel: "สูง", mainEnergyLabel: "คุ้มครอง", compatibilityPercent: 84 },
  sections: baseSections, trust: { trustNote: "" }, actions: {}, wording: {},
  amuletV1: { version: "1", scoringMode: "deterministic_v2", detection: { reason: "sacred_amulet_lane_v1", matchedSignals: [] },
    powerCategories: { protection: { key: "protection", score: 88, labelThai: "คุ้มครองป้องกัน" }, metta: { key: "metta", score: 70, labelThai: "เมตตาและคนเอ็นดู" }, baramee: { key: "baramee", score: 65, labelThai: "บารมีและอำนาจนำ" }, luck: { key: "luck", score: 89, labelThai: "โชคลาภและการเปิดทาง" }, fortune_anchor: { key: "fortune_anchor", score: 55, labelThai: "หนุนดวงและการตั้งหลัก" }, specialty: { key: "specialty", score: 50, labelThai: "งานเฉพาะทาง" } },
    primaryPower: "luck", secondaryPower: "metta", flexSurface: { headline: "พระเครื่อง", fitLine: "", bullets: [], mainEnergyShort: "โชคลาภ", tagline: "", mainEnergyWordingLine: "", htmlOpeningLine: "", heroNamingLine: "" }, htmlReport: { lifeAreaBlurbs: {}, usageCautionLines: [] } } };
F.reports.set("rpt-A1", { payload });
const base = buildSacredAmuletLibraryViewFromPayloadOnly(normalizeReportPayloadForRender(payload).payload);
const items = [1, 2, 3].map((i) => ({ ...base.byOverall[0], publicToken: `lib-A-${i}`, thumbUrl: `https://img.test/lib-A-${i}.jpg`, displayReportId: `LIB-A-${i}`, scanResultV2Id: `sr-A-${i}` }));
F.libraries.set(A, { amulet: { ...base, totalCount: 3, scanCount: 3, items, byOverall: items, topOverall: items[0], byFit: items } });

// server: นับ path ที่ถูกเรียก + log ที่ระบบพิมพ์
const hits = []; const logs = [];
const origLog = console.log, origErr = console.error;
console.log = (...a) => { logs.push(a.join(" ")); }; console.error = (...a) => { logs.push(a.join(" ")); };
const app = express();
app.use((req, _res, next) => { hits.push(req.path); next(); });
app.use(express.json()); app.use(liffRouter); app.use(reportRoutes);
const server = app.listen(0, "127.0.0.1"); await new Promise((r) => server.once("listening", r));
const port = server.address().port;

/** เบราว์เซอร์จำลอง: cookie jar จริงจาก Set-Cookie · api ใส่ Bearer จาก liff.getIDToken() ที่กำหนดได้ · navigate บันทึกปลายทาง */
function browser({ idToken, apiDown = false } = {}) {
  const jar = new Map(); const nav = [];
  const request = (path, { method = "GET", auth = true } = {}) => new Promise((resolve, reject) => {
    if (apiDown) return reject(new Error("network down"));
    const headers = {};
    if (auth && idToken) headers.authorization = `Bearer ${idToken}`;
    if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    const req = http.request({ hostname: "127.0.0.1", port, path, method, headers }, (res) => {
      for (const c of res.headers["set-cookie"] || []) { const [kv] = c.split(";"); const i = kv.indexOf("="); jar.set(kv.slice(0, i), kv.slice(i + 1)); }
      let text = ""; res.on("data", (d) => { text += d; }); res.on("end", () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, text, location: res.headers.location, json: async () => JSON.parse(text) }));
    }); req.on("error", reject); req.end();
  });
  const ui = { events: [], retry: null, verifying() { this.events.push("verifying"); }, failed(retry, detail) { this.events.push("failed:" + detail); this.retry = retry; }, noReturn() { this.events.push("no_return"); } };
  const flow = createOwnerVerifyFlow({ api: (p, o) => request(p, { method: o?.method || "GET" }), navigate: (p) => nav.push(p), ui });
  return { jar, nav, ui, flow, request };
}
const clickVerify = (b, search = "?view=owner&return=%2Fr%2Frpt-A1%2Flibrary") => {
  assert.equal(isOwnerVerifyRequest(search), true);
  return b.flow.run(readOwnerReturnPath(search));
};

test("มีโปรไฟล์หรือไม่มีโปรไฟล์ LIFF: กดยืนยัน → cookie จาก owner-session จริง → กลับ return path → เห็นคลังของตัวเอง · ไม่แตะ /api/liff/profile", async () => {
  for (const label of ["has-profile", "no-profile"]) {
    hits.length = 0;
    const b = browser({ idToken: "tok-A" });
    const r = await clickVerify(b);
    assert.equal(r.ok, true, label); assert.deepEqual(b.ui.events, ["verifying"]);
    assert.ok(b.jar.has(OWNER_COOKIE), `${label}: cookie ต้องมาจากเซิร์ฟเวอร์`);
    assert.deepEqual(b.nav, ["/r/rpt-A1/library"], "กลับ return path เดิม");
    assert.ok(!hits.includes("/api/liff/profile"), `${label}: ยืนยันเจ้าของต้องไม่ผูกกับโปรไฟล์`);
    const lib = await b.request(b.nav[0], { auth: false });
    assert.equal(lib.status, 200); for (const it of items) assert.ok(lib.text.includes(`/r/${it.publicToken}`));
    assert.ok(logs.some((l) => l.includes("OWNER_SESSION_ISSUED")));
  }
});

test("token หมดอายุ/ไม่ผ่าน LINE verify → 401 → แสดง 'ยืนยันไม่สำเร็จ' + ลองอีกครั้ง · ไม่ redirect ไม่มี cookie · ลองใหม่ด้วย token ดีจึงผ่าน", async () => {
  const b = browser({ idToken: "tok-expired" });
  const r = await clickVerify(b);
  assert.equal(r.ok, false); assert.equal(r.reason, "login_expired");
  assert.deepEqual(b.ui.events, ["verifying", "failed:login_expired"]); assert.equal(b.nav.length, 0); assert.ok(!b.jar.has(OWNER_COOKIE));
  assert.equal(typeof b.ui.retry, "function");
  // ผู้ใช้เปิดจาก LINE ใหม่ (token ดี) แล้วกด "ลองอีกครั้ง"
  const b2 = browser({ idToken: "tok-A" }); b2.ui.retry = b.ui.retry;
  const r2 = await b2.flow.run("/r/rpt-A1/library");
  assert.equal(r2.ok, true); assert.deepEqual(b2.nav, ["/r/rpt-A1/library"]);
});

test("API/network ล้ม → failed:network + ปุ่มลองอีกครั้ง (ไม่วนเอง) · เมื่อเครือข่ายกลับ กดลองอีกครั้งจึงผ่าน", async () => {
  const b = browser({ idToken: "tok-A", apiDown: true });
  const r = await clickVerify(b);
  assert.equal(r.reason, "network"); assert.equal(b.flow.attempts(), 1, "ล้มแล้วต้องไม่ retry อัตโนมัติ");
  assert.equal(b.nav.length, 0); assert.ok(!b.jar.has(OWNER_COOKIE));
  const b3 = browser({ idToken: "tok-A" });
  const r3 = await b3.flow.run("/r/rpt-A1/library"); assert.equal(r3.ok, true);
});

test("cookie ออกไม่ได้ฝั่งเซิร์ฟเวอร์ → 500 ok:false · ไม่ log ISSUED · frontend ไม่ถือว่าสำเร็จ", async () => {
  const origCookie = express.response.cookie; logs.length = 0;
  express.response.cookie = function () { throw new Error("cookie backend down"); };
  try {
    const b = browser({ idToken: "tok-A" });
    const r = await clickVerify(b);
    assert.equal(r.ok, false); assert.equal(r.reason, "server_500");
    assert.equal(b.nav.length, 0); assert.ok(!b.jar.has(OWNER_COOKIE));
    assert.ok(!logs.some((l) => l.includes("OWNER_SESSION_ISSUED")), "ห้าม log สำเร็จ");
    assert.ok(logs.some((l) => l.includes("OWNER_SESSION_COOKIE_FAILED")));
  } finally { express.response.cookie = origCookie; }
});

test("HTTP 200 แต่ body.ok ไม่ใช่ true → ไม่ถือว่าสำเร็จ (frontend ไม่ดูแค่สถานะ)", async () => {
  const nav = []; const ui = { events: [], verifying() {}, failed(_r, d) { this.events.push(d); }, noReturn() {} };
  const flow = createOwnerVerifyFlow({ api: async () => ({ ok: true, status: 200, json: async () => ({ ok: false }) }), navigate: (p) => nav.push(p), ui });
  const r = await flow.run("/r/rpt-A1/library");
  assert.equal(r.ok, false); assert.equal(nav.length, 0); assert.deepEqual(ui.events, ["server_200"]);
});

test("บัญชี B กดยืนยันจากลิงก์ของ A → ได้ cookie ของ B → เห็นรายงานแบบ guest ไม่เห็นคลังของ A · /library 302", async () => {
  const b = browser({ idToken: "tok-B" });
  const r = await clickVerify(b);
  assert.equal(r.ok, true, "B ยืนยันตัวเองได้ (แต่ไม่ใช่เจ้าของ A)");
  const lib = await b.request("/r/rpt-A1/library", { auth: false });
  assert.equal(lib.status, 302);
  const body = await b.request("/r/rpt-A1/body", { auth: false });
  assert.equal(body.status, 200); for (const it of items) assert.ok(!body.text.includes(it.publicToken), "คลังของ A ต้องไม่รั่วให้ B");
  assert.match(body.text, /data-owner-vault-cta="1"/);
});

test("ไม่วน redirect: หน้ารายงาน guest ไม่มี auto-redirect ไป LIFF · return path นอกโดเมนถูกปฏิเสธ", async () => {
  const b = browser({});
  const body = await b.request("/r/rpt-A1/body", { auth: false });
  assert.ok(!/http-equiv="refresh"|location\.(replace|href)\s*=\s*["'][^"']*view=owner/.test(body.text), "ห้าม auto-redirect ไปยืนยัน");
  assert.equal(readOwnerReturnPath("?view=owner&return=https%3A%2F%2Fevil.test"), "");
  assert.equal(readOwnerReturnPath("?liff.state=%3Fview%3Downer%26return%3D%252Fr%252Frpt-A1"), "/r/rpt-A1");
  const ui = { events: [], verifying() {}, failed() {}, noReturn() { this.events.push("no_return"); } };
  const flow = createOwnerVerifyFlow({ api: async () => { throw new Error("must not call"); }, navigate: () => { throw new Error("must not navigate"); }, ui });
  assert.equal((await flow.run("")).ok, false); assert.deepEqual(ui.events, ["no_return"]);
});

test("หน้า LIFF ฝังโมดูลเดียวกัน และรัน view=owner ก่อนเช็คโปรไฟล์", async () => {
  const b = browser({});
  const page = await b.request("/liff?view=owner&return=%2Fr%2Frpt-A1", { auth: false });
  assert.equal(page.status, 200);
  assert.match(page.text, /function createOwnerVerifyFlow\(/); assert.match(page.text, /function readOwnerReturnPath\(/);
  const iOwner = page.text.indexOf("if (isOwnerVerifyRequest(location.search))"); const iProfile = page.text.indexOf('api("/api/liff/profile")', iOwner - 2000);
  assert.ok(iOwner > 0 && iProfile > iOwner, "ยืนยันเจ้าของต้องมาก่อนการเรียกโปรไฟล์");
  assert.match(page.text, /ยืนยันไม่สำเร็จ กรุณาลองใหม่/); assert.match(page.text, /ลองอีกครั้ง/);
});

/** หน้า LIFF จริง: fetch จริงไปเซิร์ฟเวอร์ (คง cookie jar เอง) · liff.login เป็น spy · sessionStorage จำลอง */
function realLiffPage({ idToken }) {
  const jar = new Map(); const nav = []; const login = [];
  const storage = new Map();
  const fetchImpl = async (path, opts) => {
    const headers = { ...(opts?.headers || {}) };
    if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    const r = await realFetch(`http://127.0.0.1:${port}${path}`, { ...opts, headers });
    for (const c of r.headers.getSetCookie?.() || []) { const [kv] = c.split(";"); const i = kv.indexOf("="); jar.set(kv.slice(0, i), kv.slice(i + 1)); }
    return r;
  };
  const api = createLiffApi({ fetch: fetchImpl, liff: { getIDToken: () => idToken, login: () => login.push("login") }, sessionStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) } });
  const ui = { events: [], retry: null, verifying() { this.events.push("verifying"); }, failed(retry, d) { this.events.push("failed:" + d); this.retry = retry; }, noReturn() { this.events.push("no_return"); } };
  return { api, jar, nav, login, ui, storage, boot: (search) => runOwnerVerifyBoot({ search, api, navigate: (p) => nav.push(p), ui }) };
}
const withTimeout = (p, ms = 3000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("flow ค้าง (Promise ไม่จบ)")), ms))]);

test("[helper จริง] 401 บนเส้นยืนยัน → login_expired + ปุ่มลองอีกครั้ง · ไม่ auto-login · ไม่ redirect · Promise จบ", async () => {
  const pg = realLiffPage({ idToken: "tok-expired" });
  const r = await withTimeout(pg.boot("?view=owner&return=%2Fr%2Frpt-A1%2Flibrary"));
  assert.equal(r.ok, false); assert.equal(r.reason, "login_expired");
  assert.deepEqual(pg.ui.events, ["verifying", "failed:login_expired"]);
  assert.deepEqual(pg.login, [], "ห้าม liff.login() อัตโนมัติบนเส้นยืนยัน");
  assert.equal(pg.storage.get("liffReauth"), undefined, "ห้ามตั้ง liffReauth (กันวนล็อกอิน)");
  assert.equal(pg.nav.length, 0); assert.ok(!pg.jar.has(OWNER_COOKIE));
  assert.equal(typeof pg.ui.retry, "function");
  // กดลองอีกครั้งด้วย token เดิม → ยัง 401 → ยังไม่ login เอง ยังจบ
  const r2 = await withTimeout(pg.ui.retry());
  assert.equal(r2.reason, "login_expired"); assert.deepEqual(pg.login, []);
});

test("[helper จริง] happy path: token ดี → cookie จากเซิร์ฟเวอร์ → กลับ return path → คลังชัด", async () => {
  const pg = realLiffPage({ idToken: "tok-A" });
  const r = await withTimeout(pg.boot("?liff.state=%3Fview%3Downer%26return%3D%252Fr%252Frpt-A1%252Flibrary"));
  assert.equal(r.ok, true); assert.deepEqual(pg.nav, ["/r/rpt-A1/library"]); assert.ok(pg.jar.has(OWNER_COOKIE)); assert.deepEqual(pg.login, []);
  const lib = await pg.api("/r/rpt-A1/library", { noReauth: true });
  assert.equal(lib.status, 200); const html = await lib.text(); for (const it of items) assert.ok(html.includes(`/r/${it.publicToken}`));
});

test("[helper จริง] หน้าอื่นยังได้พฤติกรรมเดิม: 401 → liff.login() หนึ่งรอบ + ตั้ง liffReauth (ไม่เปลี่ยนหน้าจ่ายเงิน)", async () => {
  const pg = realLiffPage({ idToken: "tok-expired" });
  let settled = false;
  pg.api("/api/liff/owner-session", { method: "POST" }).then(() => { settled = true; });
  await new Promise((r) => setTimeout(r, 300));
  assert.deepEqual(pg.login, ["login"]); assert.equal(pg.storage.get("liffReauth"), "1"); assert.equal(settled, false, "รอบ re-login: Promise ค้างตามเดิม (พฤติกรรมเดิมของหน้าอื่น)");
});

test("หน้า LIFF ใช้ helper/boot ตัวเดียวกับเทสต์ (ฝัง createLiffApi + runOwnerVerifyBoot) และเส้นยืนยันส่ง noReauth", async () => {
  const b = browser({});
  const page = await b.request("/liff?view=owner", { auth: false });
  assert.match(page.text, /function createLiffApi\(/); assert.match(page.text, /var api = createLiffApi\(/);
  assert.match(page.text, /function runOwnerVerifyBoot\(/); assert.match(page.text, /return runOwnerVerifyBoot\(\{/);
  assert.ok(!page.text.includes("function api(path, opts){\n    opts = opts || {};"), "ไม่มี api() สำเนาเก่าในหน้า");
  const mod = readFileSync(new URL("../src/routes/liffOwnerVerify.client.js", import.meta.url), "utf8");
  assert.match(mod, /noReauth: true/);
});

test.after(() => { console.log = origLog; console.error = origErr; globalThis.fetch = realFetch; return new Promise((r) => server.close(r)); });
