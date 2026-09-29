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
  process.exit(process.argv.includes('--allow-skip') ? 0 : 1);
}

// 2. Làm sạch bảng event cũ và chuẩn bị quyền môi trường kiểm thử
spawnSync(
  'docker',
  ['exec', '-i', container, 'psql', '-U', 'supabase_admin', '-d', 'postgres'],
  {
    input: `
      DROP TABLE IF EXISTS public.event_moderation_audit CASCADE;
      DROP TABLE IF EXISTS public.event_replies CASCADE;
      DROP TABLE IF EXISTS public.event_content_reports CASCADE;
      DROP TABLE IF EXISTS public.event_rate_limits CASCADE;
      DROP TABLE IF EXISTS public.event_analytics_logs CASCADE;
      DROP TABLE IF EXISTS public.memory_houses CASCADE;
      DROP TABLE IF EXISTS public.memory_matches CASCADE;
      GRANT ALL ON SCHEMA realtime TO postgres;
      CREATE TABLE IF NOT EXISTS realtime.messages (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        topic text NOT NULL,
        extension text NOT NULL DEFAULT 'broadcast',
        inserted_at timestamptz DEFAULT now() NOT NULL
      );
      ALTER TABLE realtime.messages OWNER TO postgres;
      CREATE OR REPLACE FUNCTION realtime.send(message jsonb, event text, topic text, private boolean DEFAULT false)
      RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
      BEGIN
        PERFORM pg_notify('realtime', jsonb_build_object('event', event, 'topic', topic, 'payload', message)::text);
      END;
      $$;
      ALTER FUNCTION realtime.send(jsonb, text, text, boolean) OWNER TO postgres;
    `,
    encoding: 'utf8',
    timeout: 15000
  }
);

// 3. Áp dụng migration vào container
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

for (const file of [
  'supabase/migrations/20260928170000_memory_house_decorations.sql',
  'supabase/migrations/20260928175012_event_media_owner_storage.sql',
  'supabase/migrations/20260929033824_match_draft_validation.sql',
  'supabase/migrations/20260929042933_event_analytics_and_moderation.sql',
  'supabase/migrations/20260929051500_event_studios_fixes.sql',
  'tests/memory_house_decorations.test.sql',
  'supabase/migrations/20260929060533_event_studios_completion.sql',
  'supabase/migrations/20260929125701_fix_event_analytics_schema.sql',
  'tests/event_analytics_and_moderation.test.sql',
  'supabase/migrations/20260929200000_freeform_house_decorations_v2.sql',
  'tests/memory_house_decorations_v2.test.sql',
  'supabase/migrations/20260929210000_admin_article_deletion.sql'
]) {
  const result=spawnSync('docker',['exec','-i',container,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{
    input:readFileSync(file,'utf8'),encoding:'utf8',timeout:60000
  });
  if(result.status!==0){console.error(result.stderr||result.error?.message||result.stdout);process.exit(1);}
  console.log(`[PASS] ${file}`);
}
console.log('\n================================================================');
console.log('  [PASS] Local PostgreSQL database integration verified on container ' + container);
console.log('================================================================');
