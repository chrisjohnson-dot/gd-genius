import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
// First describe the table to get correct column names
const [cols] = await conn.execute('DESCRIBE extensiv_configs');
console.log('Columns:', cols.map(c => c.Field).join(', '));
const [rows] = await conn.execute('SELECT * FROM extensiv_configs LIMIT 5');
// Mask secrets before printing
const safe = rows.map(r => ({
  ...r,
  client_secret: r.client_secret ? '***' : null,
  clientSecret: r.clientSecret ? '***' : null,
}));
console.log(JSON.stringify(safe, null, 2));
await conn.end();
