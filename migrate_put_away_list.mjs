import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';

const sql = readFileSync('drizzle/0048_put_away_scans_list_columns.sql', 'utf8');
const statements = sql
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));

const conn = await mysql.createConnection(process.env.DATABASE_URL);
for (const stmt of statements) {
  try {
    await conn.execute(stmt);
    console.log('OK:', stmt.slice(0, 80));
  } catch (e) {
    console.error('ERR:', e.message);
  }
}
await conn.end();
console.log('Migration complete.');
