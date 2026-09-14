import { readFileSync, writeFileSync } from 'node:fs';

const deploy = readFileSync('supabase/production_schema_deploy.sql', 'utf8');
const articles = readFileSync('supabase/migrations/20260914_articles_system.sql', 'utf8');

// Loại bỏ phần articles đã bị lỗi trước đó nếu có
const cleanDeploy = deploy.split('-- ==============================================================================\n-- 7. HỆ THỐNG BÀI VIẾT')[0].trim();

const cleanArticles = articles.replace(/^BEGIN;\s*/m, '').replace(/COMMIT;\s*$/m, '').trim();

const finalSql = `${cleanDeploy}

-- ==============================================================================
-- 7. HỆ THỐNG BÀI VIẾT, BÌNH LUẬN & TƯƠNG TÁC (ARTICLES & ENGAGEMENT)
-- ==============================================================================
${cleanArticles}

COMMIT;
`;

writeFileSync('supabase/production_schema_deploy.sql', finalSql, 'utf8');
console.log('Successfully written clean production_schema_deploy.sql');
