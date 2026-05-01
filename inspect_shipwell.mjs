import mysql from 'mysql2/promise';

const url = process.env.DATABASE_URL;
const m = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
const conn = await mysql.createConnection({
  host: m[3], port: parseInt(m[4]), user: m[1], password: m[2], database: m[5],
  ssl: { rejectUnauthorized: false }
});

// Show columns
const [cols] = await conn.execute('DESCRIBE shipwell_configs');
console.log('=== shipwell_configs columns ===');
for (const c of cols) console.log(' ', c.Field, c.Type, c.Null, c.Default);

// Show rows (mask token)
const [rows] = await conn.execute('SELECT * FROM shipwell_configs LIMIT 5');
for (const r of rows) {
  if (r.apiToken) r.apiToken = r.apiToken.substring(0, 8) + '...';
  if (r.password) r.password = '***';
}
console.log('\n=== rows ===');
console.log(JSON.stringify(rows, null, 2));

await conn.end();
