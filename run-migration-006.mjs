import { readFileSync } from 'fs';
import mysql from 'mysql2/promise';

const sql = readFileSync('./drizzle/006_edi_retailers_escalations.sql', 'utf8');
const statements = sql
  .split(';')
  .map(s => s.replace(/--[^\n]*/g, '').trim())
  .filter(s => s.length > 0);

const conn = await mysql.createConnection(process.env.DATABASE_URL);
for (const stmt of statements) {
  await conn.execute(stmt);
  console.log('OK:', stmt.slice(0, 60));
}
await conn.end();
console.log('Migration 006 complete.');
