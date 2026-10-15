// เทสต์ระบบแยกของ grant-notify-recover.sh — psql/docker ปลอม (ไม่แตะ DB/Docker จริง) ครอบ: หลาย batch · แถวอายุน้อย · query ล้ม · RPC ล้ม ·
// docker ค้าง → deadline + เก็บ container · psql ค้าง → deadline · one-shot ล้มบางส่วนแล้วสำเร็จ · ค้างจนหมดเวลา → exit 5 + รายงาน
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const SCRIPT = new URL("./grant-notify-recover.sh", import.meta.url).pathname;
const ONESHOT = new URL("./grant-notify-oneshot.mjs", import.meta.url).pathname;
const results = [];

function setup(state) {
  const dir = mkdtempSync(join(tmpdir(), "gnr-"));
  writeFileSync(join(dir, "state.json"), JSON.stringify({ old: 0, young: 0, mode: "ok", oneshot: "ok", ...state }));
  writeFileSync(join(dir, "log.txt"), "");
  writeFileSync(join(dir, ".env"), "X=1\n");
  // fake psql: อ่าน -c <query> → ตอบจาก state · dbfail/dbhang ตาม mode
  writeFileSync(join(dir, "psql"), `#!/bin/bash
S="${dir}/state.json"; Q=""; while [ $# -gt 0 ]; do [ "$1" = "-c" ] && Q="$2"; shift; done
echo "psql: $Q" >> "${dir}/log.txt"
mode=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).mode)' "$S")
case "$Q" in
  *"left(payment_id"*) echo "deadbeef granted 2026-10-15 00:00:00+00 outbound=none"; exit 0;;
  *"granted_at >= now()"*) node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).young)' "$S"; exit 0;;
  *"count(*)"*)
    [ "$mode" = "dbfail" ] && { echo "ERROR:  relation does not exist" >&2; exit 1; }
    [ "$mode" = "dbhang" ] && { sleep 100; exit 0; }
    node -e 'const s=JSON.parse(require("fs").readFileSync(process.argv[1]));console.log(s.old+s.young)' "$S"; exit 0;;
esac
echo "unexpected query" >&2; exit 2`);
  // fake docker: image inspect ok · run → one-shot ปลอม (ประมวล ≤200 แถวอายุ>2นาที แล้ว "เวลาผ่านไป": young→old) · rm -f → log
  writeFileSync(join(dir, "docker"), `#!/bin/bash
S="${dir}/state.json"; echo "docker: $*" >> "${dir}/log.txt"
case "$1" in
  image) exit 0;;
  rm) echo "rm: $3" >> "${dir}/log.txt"; exit 0;;
  run)
    os=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).oneshot)' "$S")
    [ "$os" = "hang" ] && { sleep 100; exit 0; }
    [ "$os" = "rpcfail" ] && { echo '{"event":"GRANT_NOTIFY_ONESHOT_LIST_FAILED"}'; exit 2; }
    node -e '
      const fs=require("fs");const s=JSON.parse(fs.readFileSync(process.argv[1]));
      let take=Math.min(200,s.old); let rc=0;
      if(s.oneshot==="partialfail"){ take=Math.floor(take/2); rc=4; s.oneshot="ok"; }
      if(s.oneshot==="noop"){ take=0; }
      s.old-=take; s.old+=s.young; s.young=0; // เวลาผ่านไป 1 รอบ: แถวอายุน้อยกลายเป็น >2 นาที
      fs.writeFileSync(process.argv[1],JSON.stringify(s));
      console.log(JSON.stringify({event:"GRANT_NOTIFY_ONESHOT",scanned:take,enqueued:take,failed:rc?1:0}));
      process.exit(rc);' "$S"; exit $?;;
esac
exit 1`);
  chmodSync(join(dir, "psql"), 0o755); chmodSync(join(dir, "docker"), 0o755);
  return dir;
}
function run(dir, maxWait, extraEnv = {}) {
  const t0 = Date.now();
  const r = spawnSync("bash", [SCRIPT, "pro", "sha256:fakeimage", ONESHOT, String(maxWait)], {
    encoding: "utf8", env: { ...process.env, RECOVER_PSQL: join(dir, "psql"), RECOVER_DOCKER: join(dir, "docker"), RECOVER_SLEEP_STEP: "1", RECOVER_DIR_OVERRIDE: dir, RECOVER_SKIP_IMAGE_CHECK: "1", ...extraEnv },
  });
  const log = readFileSync(join(dir, "log.txt"), "utf8");
  return { code: r.status, out: r.stdout + r.stderr, log, seconds: (Date.now() - t0) / 1000, runs: (log.match(/^docker: run /gm) || []).length, rms: [...log.matchAll(/^rm: (\S+)/gm)].map((m) => m[1]) };
}
function finalState(dir) { return JSON.parse(readFileSync(join(dir, "state.json"), "utf8")); }
const pass = (name) => { results.push(name); console.log("PASS " + name); };

{ // A: หลาย batch 450 → 200+200+50 → 0
  const d = setup({ old: 450 }); const r = run(d, 60);
  assert.equal(r.code, 0, r.out); assert.equal(r.runs, 3); assert.equal(finalState(d).old, 0); assert.equal(r.rms.length, 3, "container ของทุกรอบถูกเก็บ"); assert.match(r.out, /DONE: pending_notify=0/);
  pass("A multi-batch 450 rows → 3 one-shot runs → pending=0 (containers removed each round)"); rmSync(d, { recursive: true, force: true });
}
{ // B: แถวอายุน้อย 5 → รอบแรกหยิบไม่ได้ รอ → รอบถัดไปจบ
  const d = setup({ old: 0, young: 5 }); const r = run(d, 60);
  assert.equal(r.code, 0, r.out); assert.ok(r.runs >= 2, "needs ≥2 rounds"); assert.match(r.out, /young\(<2min\)=5/); assert.match(r.out, /DONE/);
  pass("B young rows (<2min) wait then drain → exit 0"); rmSync(d, { recursive: true, force: true });
}
{ // C: query ล้ม → exit 3 ไม่รัน one-shot
  const d = setup({ old: 3, mode: "dbfail" }); const r = run(d, 60);
  assert.equal(r.code, 3, r.out); assert.equal(r.runs, 0); assert.match(r.out, /not zero/);
  pass("C DB count query fails → exit 3, never treated as zero, no one-shot"); rmSync(d, { recursive: true, force: true });
}
{ // D: RPC list ล้ม → exit 2
  const d = setup({ old: 3, oneshot: "rpcfail" }); const r = run(d, 60);
  assert.equal(r.code, 2, r.out); assert.equal(r.runs, 1); assert.equal(r.rms.length, 1); assert.match(r.out, /RPC failed/);
  pass("D one-shot RPC list fails → exit 2 after one run, container removed"); rmSync(d, { recursive: true, force: true });
}
{ // E: docker ค้าง → deadline 2s → exit 6 เร็ว + rm container ของรอบนั้น
  const d = setup({ old: 3, oneshot: "hang" }); const r = run(d, 2);
  assert.equal(r.code, 6, r.out); assert.ok(r.seconds < 12, `took ${r.seconds}s`); assert.match(r.out, /deadline reached while one-shot container was running/);
  assert.equal(r.rms.length, 1); assert.match(r.rms[0], /^grant-oneshot-\d+-\d+-r1$/); assert.match(r.out, /pending report:/);
  pass(`E docker run hangs → deadline → exit 6 in ${r.seconds.toFixed(1)}s, round container force-removed (${r.rms[0]})`); rmSync(d, { recursive: true, force: true });
}
{ // F: psql ค้าง → deadline → exit 6
  const d = setup({ old: 3, mode: "dbhang" }); const r = run(d, 2);
  assert.equal(r.code, 6, r.out); assert.ok(r.seconds < 12, `took ${r.seconds}s`); assert.match(r.out, /deadline reached while counting/); assert.equal(r.runs, 0);
  pass(`F psql hangs → deadline → exit 6 in ${r.seconds.toFixed(1)}s`); rmSync(d, { recursive: true, force: true });
}
{ // G: one-shot ล้มบางส่วน (exit 4) → รอ → รอบถัดไปสำเร็จ
  const d = setup({ old: 10, oneshot: "partialfail" }); const r = run(d, 60);
  assert.equal(r.code, 0, r.out); assert.match(r.out, /WARN: some grants failed to enqueue/); assert.equal(r.runs, 2);
  pass("G partial enqueue failure (exit 4) → retry → exit 0"); rmSync(d, { recursive: true, force: true });
}
{ // H: one-shot ไม่คืบ (noop) → หมดเวลาแบบรอบจบปกติ → exit 5 + รายงาน
  const d = setup({ old: 7, oneshot: "noop" }); const r = run(d, 3);
  assert.equal(r.code, 5, r.out); assert.match(r.out, /STILL PENDING after 3s/); assert.match(r.out, /deadbeef granted/); assert.ok(r.seconds < 10, `took ${r.seconds}s`); assert.equal(r.rms.length, r.runs, "ทุกรอบเก็บ container");
  pass(`H no progress → exit 5 with pending report in ${r.seconds.toFixed(1)}s`); rmSync(d, { recursive: true, force: true });
}
{ // I: max-wait ไม่ถูกต้อง / ไฟล์ one-shot ไม่มี → exit 1
  const d = setup({ old: 1 });
  assert.equal(run(d, "abc").code, 1); assert.equal(spawnSync("bash", [SCRIPT, "pro", "img", "/nonexistent.mjs", "5"], { encoding: "utf8", env: { ...process.env, RECOVER_SKIP_IMAGE_CHECK: "1" } }).status, 1);
  pass("I bad max-wait / missing one-shot → exit 1"); rmSync(d, { recursive: true, force: true });
}
console.log(`\nPASS grant-notify-recover: ${results.length} scenarios (fake psql/docker only; no real DB, Docker, staging or Pro touched)`);
