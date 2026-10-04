import { migrations, withDisposableDatabase } from '../scripts/lib/disposable-test-database.mjs';

// Test historical compatibility at the schema revision each regression targets.
// Every migration is still applied, including the later server-only boundaries.
const checkpoints = new Map([
  ['20260928072518_event_studios.sql', ['tests/event_studios_database.test.sql']],
  ['20260929051500_event_studios_fixes.sql', ['tests/memory_house_decorations.test.sql']],
  ['20260929125701_fix_event_analytics_schema.sql', ['tests/event_analytics_and_moderation.test.sql']],
  ['20260930134604_house_supported_placement_surfaces.sql', ['tests/memory_house_decorations_v2.test.sql']],
]);

withDisposableDatabase('events', ({ apply }) => {
  for (const file of migrations) {
    apply(`supabase/migrations/${file}`);
    for (const test of checkpoints.get(file) || []) apply(test);
  }
  console.log('[ALL PASS] Event database regressions and complete migration chain passed on an isolated database.');
});
