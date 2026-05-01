import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';

const sql = readFileSync('./drizzle/migrations/0103_shipping_documents.sql', 'utf8');
const stmts = sql.split(';').map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith('--'));

const conn = await mysql.createConnection(process.env.DATABASE_URL);
for (const stmt of stmts) {
  try {
    await conn.execute(stmt);
    console.log('OK:', stmt.slice(0, 80));
  } catch (e) {
    console.error('ERR:', e.message, '\n  SQL:', stmt.slice(0, 80));
  }
}
await conn.end();
console.log('Migration complete.');
