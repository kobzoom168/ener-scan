// No production config or ports. Removes ONLY the disposable container it creates.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const container='ener-token-nginx-codex-test';
const path=name=>fileURLToPath(new URL(`../../ops/nginx/${name}`,import.meta.url));
const docker=a=>execFileSync('docker',a,{encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
let created=false;
try {
  docker(['run','-d','--name',container,'--network','none','--memory','96m',
    '-v',`${path('private-token-access-log.conf')}:/etc/nginx/private-token-access-log.conf:ro`,
    '-v',`${path('private-token-test.conf')}:/etc/nginx/nginx.conf:ro`,'nginx:alpine']);
  created=true;
  docker(['exec',container,'nginx','-t']);
  const paths=['/myscans/SYNTHETIC_OWNER_TOKEN?token=QUERY_SECRET','/r/SYNTHETIC_REPORT_TOKEN/library',
    '/api/public-report/SYNTHETIC_API_TOKEN','/%6dyscans/SYNTHETIC_ENCODED_TOKEN','/health?token=QUERY_SECRET'];
  for(const p of paths) {
    const body=docker(['exec',container,'wget','-qO-','--header=Referer: https://example.invalid/myscans/REFERER_SECRET',`http://127.0.0.1:8080${p}`]);
    assert.equal(body,'upstream-route-unchanged');
  }
  const logs=docker(['exec',container,'cat','/tmp/ener-private-access.log']);
  assert.doesNotMatch(logs,/SYNTHETIC|QUERY_SECRET|REFERER_SECRET|\?token=/);
  assert.match(logs,/\/myscans\/\[redacted\]/);
  assert.match(logs,/\/r\/\[redacted\]/);
  assert.match(logs,/\/api\/public-report\/\[redacted\]/);
  assert.match(logs,/GET \/health HTTP/);
  console.log('PASS nginx -t; 5 proxy requests unchanged; path/query/referrer secrets absent');
} finally {
  if(created) { docker(['rm','-fv',container]); console.log('Disposable nginx removed'); }
}
