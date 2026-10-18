import {migrations,withDisposableDatabase} from '../scripts/lib/disposable-test-database.mjs';

withDisposableDatabase('guest_house',({apply})=>{
  for(const file of migrations)apply(`supabase/migrations/${file}`);
  apply('tests/guest_house_database.test.sql');
  console.log('[ALL PASS] Guest-house SQL lifecycle, ownership, closure, registration, cleanup and grants on the complete migration chain.');
});
