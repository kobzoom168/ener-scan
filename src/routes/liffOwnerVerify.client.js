/**
 * เส้น "ยืนยันเจ้าของผ่าน LINE" ฝั่งเบราว์เซอร์ (Codex 26 ก.ย. 2026 รอบ 6)
 *
 * ใช้ 2 ทาง: ฝัง source เข้าใน LIFF HTML (buildLiffHtml) และ import ตรงใน Node เพื่อทดสอบการกดจริง
 * (deps: api / navigate / ui ถูกฉีดเข้ามา จึงรันได้ทั้งในเบราว์เซอร์และในเทสต์)
 *
 * กติกา
 *   - ไม่ผูกกับโปรไฟล์ LIFF: มี LINE idToken (liff login แล้ว) ก็ยืนยันได้ ไม่ต้องกรอกอะไร
 *   - สำเร็จ = HTTP 200 **และ** body.ok === true เท่านั้น → กลับ return path เดิม
 *   - ล้ม (401/5xx/network/ok:false) = แสดง "ยืนยันไม่สำเร็จ กรุณาลองใหม่" + ปุ่มลองอีกครั้ง — ไม่ redirect ไม่วนเอง
 *   - return path ต้องเป็น path ในโดเมนนี้เท่านั้น (/r/... หรือ /myscans/...)
 */
export function isSafeOwnerReturnPathClient(p) {
  return /^\/(r|myscans)\/[A-Za-z0-9._%-]+(\/[a-z-]+)?$/.test(String(p || ""));
}

/** อ่าน return path จาก ?return= หรือจาก liff.state */
export function readOwnerReturnPath(search) {
  var qs = new URLSearchParams(String(search || ""));
  var ret = qs.get("return") || "";
  var st = qs.get("liff.state") || "";
  if (!ret && st) { try { ret = new URLSearchParams(st.replace(/^\?/, "")).get("return") || ""; } catch (e) { /* ignore */ } }
  try { ret = decodeURIComponent(ret); } catch (e) { /* ignore */ }
  return isSafeOwnerReturnPathClient(ret) ? ret : "";
}

export function isOwnerVerifyRequest(search) {
  var qs = new URLSearchParams(String(search || ""));
  var st = qs.get("liff.state") || "";
  return qs.get("view") === "owner" || st.indexOf("view=owner") !== -1;
}

/**
 * @param {{ api: (path: string, opts?: object) => Promise<{ ok: boolean, status: number, json: () => Promise<any> }>,
 *           navigate: (path: string) => void,
 *           ui: { verifying: () => void, failed: (retry: () => void, detail: string) => void, noReturn: () => void } }} deps
 */
export function createOwnerVerifyFlow(deps) {
  var attempts = 0;
  function run(returnPath) {
    if (!isSafeOwnerReturnPathClient(returnPath)) { deps.ui.noReturn(); return Promise.resolve({ ok: false, reason: "bad_return" }); }
    attempts += 1;
    deps.ui.verifying();
    return deps.api("/api/liff/owner-session", { method: "POST" })
      .then(function (r) {
        return r.json().catch(function () { return null; }).then(function (j) {
          var ok = Boolean(r && r.ok && r.status === 200 && j && j.ok === true);
          if (ok) { deps.navigate(returnPath); return { ok: true, attempts: attempts }; }
          var detail = r && r.status === 401 ? "login_expired" : "server_" + (r ? r.status : "0");
          deps.ui.failed(function () { return run(returnPath); }, detail);
          return { ok: false, reason: detail, attempts: attempts };
        });
      })
      .catch(function () {
        deps.ui.failed(function () { return run(returnPath); }, "network");
        return { ok: false, reason: "network", attempts: attempts };
      });
  }
  return { run: run, attempts: function () { return attempts; } };
}

/**
 * ตัวเรียก API ของหน้า LIFF (ตัวจริงที่ทุกหน้าใช้ — ย้ายมาที่นี่เพื่อให้เทสต์ผ่าน helper เดียวกัน)
 * ทุกคำขอใส่ LINE idToken · 401 → re-login หนึ่งรอบ (พฤติกรรมเดิมของหน้าจ่ายเงิน/หน้าอื่น)
 * ยกเว้น opts.noReauth = true (เส้นยืนยันเจ้าของ): คืน response 401 ตรง ๆ ให้ผู้เรียกแสดงข้อความ — ไม่ auto-login ไม่ค้าง Promise
 * @param {{ fetch: Function, liff: { getIDToken?: Function, login: Function }, sessionStorage: { getItem: Function, setItem: Function } }} env
 */
export function createLiffApi(env) {
  return function api(path, opts) {
    opts = opts || {};
    var h = opts.headers || {};
    try { h["Authorization"] = "Bearer " + (env.liff.getIDToken() || ""); } catch (e) { /* ไม่มี token = ให้เซิร์ฟเวอร์ตอบ 401 */ }
    opts.headers = h;
    var noReauth = opts.noReauth === true;
    delete opts.noReauth;
    return env.fetch(path, opts).then(function (r) {
      if (r.status === 401 && !noReauth && !env.sessionStorage.getItem("liffReauth")) {
        env.sessionStorage.setItem("liffReauth", "1");
        env.liff.login();
        return new Promise(function () {});
      }
      return r;
    });
  };
}

/**
 * ทางเข้าเส้นยืนยันเจ้าของจาก boot (ตัวจริงที่หน้า LIFF เรียก): อ่าน return path จาก URL แล้วรัน flow ด้วย api จริง
 * เรียก api แบบ noReauth เสมอ → 401 มาถึง flow → "login_expired" + ปุ่มลองอีกครั้ง (ไม่ auto-login)
 */
export function runOwnerVerifyBoot(env) {
  var flow = createOwnerVerifyFlow({
    api: function (path, opts) { return env.api(path, Object.assign({}, opts || {}, { noReauth: true })); },
    navigate: env.navigate,
    ui: env.ui,
  });
  return flow.run(readOwnerReturnPath(env.search));
}
