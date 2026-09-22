import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const ref = 'svbmupgifhafrehdfomx';
const migrations = [
  '20260921010000_media_moderation_expansion.sql',
  '20260921150917_memory_accounts_and_nfc_links.sql',
  '20260921153205_image_moderation_access.sql',
  '20260921163000_pin_hint_support.sql',
  '20260922100000_security_hardening.sql'
];

function runSql(sql) {
  const tmpFile = '.local_apply_tmp.sql';
  fs.writeFileSync(tmpFile, sql, 'utf8');
  try {
    const r = spawnSync(
      process.execPath,
      ['node_modules/supabase/dist/supabase.js', 'db', 'query', '--linked', '--project-ref', ref, '-f', tmpFile],
      { encoding: 'utf8', timeout: 60000 }
    );
    if (r.status !== 0) {
      throw new Error(`Database query failed (code ${r.status}): ${r.stderr || r.stdout}`);
    }
    return r.stdout;
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
}

console.log('=== Applying Missing Migrations to Cloud Supabase ===');

for (const file of migrations) {
  const version = file.match(/^([0-9]+)/)[1];
  console.log(`\n--> Applying ${file} (version ${version})...`);
  
  const content = fs.readFileSync(`supabase/migrations/${file}`, 'utf8');
  const sql = `
BEGIN;
${content.replace(/^BEGIN;\s*/gm, '').replace(/COMMIT;\s*$/gm, '')}
INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('${version}') ON CONFLICT DO NOTHING;
COMMIT;
`;
  
  runSql(sql);
  console.log(`✓ Applied ${file} successfully.`);
}

console.log('\nReloading PostgREST schema cache...');
runSql("NOTIFY pgrst, 'reload schema';");
console.log('✓ Schema reloaded.');
