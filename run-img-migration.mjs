import { readFileSync } from 'fs';
import { createConnection } from 'mysql2/promise';
import { config } from 'dotenv';

config({ path: '.env' });

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) throw new Error('DATABASE_URL not set');

const conn = await createConnection(dbUrl);

const sql = readFileSync('./drizzle/migrations/0100_scan_images.sql', 'utf8');
const stmts = sql
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));

for (const stmt of stmts) {
  try {
    await conn.execute(stmt);
    console.log('OK:', stmt.slice(0, 80));
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') {
      console.log('SKIP (already exists):', stmt.slice(0, 80));
    } else {
      console.error('FAILED:', e.message);
      console.error('Statement:', stmt.slice(0, 120));
      process.exit(1);
    }
  }
}

await conn.end();
console.log('\nMigration complete.');
