import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const container = process.env.EMORIA_CONTAINER || 'supabase_db_emoria-sandbox';
const migrationFile = 'supabase/migrations/20260928072518_event_studios.sql';
const testSqlFile = 'tests/event_studios_database.test.sql';

console.log('================================================================');
console.log('  EMORIA LUXURY - EVENT STUDIOS DATABASE INTEGRATION TEST');
console.log('================================================================\n');

// 1. Kiểm tra tính khả dụng của Docker và container
let dockerRunning = false;
try {
  const check = spawnSync('docker', ['ps', '--filter', `name=${container}`, '--format', '{{.Names}}'], {
    encoding: 'utf8',
    timeout: 5000
  });
  if (check.status === 0 && check.stdout && check.stdout.includes(container)) {
    dockerRunning = true;
  }
} catch {
  dockerRunning = false;
}

if (!dockerRunning) {
  console.log(`[SKIPPED / UNVERIFIED] Container '${container}' không truy cập được hoặc Docker Desktop chưa bật.`);
  console.log('[UNVERIFIED] Database integration test CHƯA ĐƯỢC CHẠY và KHÔNG ĐƯỢC XÁC NHẬN (UNVERIFIED) trên PostgreSQL.');
  process.exit(0);
}

// 2. Áp dụng migration vào container
console.log(`Đang áp dụng migration ${migrationFile} vào container ${container}...`);
const applyRes = spawnSync(
  'docker',
  ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
  { input: readFileSync(migrationFile, 'utf8'), encoding: 'utf8', timeout: 60000 }
);

if (applyRes.status !== 0) {
  console.error(`[ERROR] Không thể áp dụng migration:\n${applyRes.stderr || applyRes.stdout}`);
  process.exit(1);
}
console.log(`[PASS] Đã áp dụng migration: ${migrationFile}`);

// 3. Thực thi kiểm thử regression SQL
console.log(`Đang thực thi kiểm thử SQL ${testSqlFile}...`);
const testRes = spawnSync(
  'docker',
  ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
  { input: readFileSync(testSqlFile, 'utf8'), encoding: 'utf8', timeout: 60000 }
);

if (testRes.status !== 0) {
  console.error(`[ERROR] Kiểm thử regression SQL thất bại:\n${testRes.stderr || testRes.stdout}`);
  process.exit(1);
}

console.log(`[PASS] Đã thực thi thành công SQL regression test: ${testSqlFile}`);
console.log('\n================================================================');
console.log('  [PASS] Local PostgreSQL database integration verified on container ' + container);
console.log('================================================================');
