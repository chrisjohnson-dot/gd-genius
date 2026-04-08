import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute('DESCRIBE put_away_scans');
rows.forEach(r => console.log(r.Field, '|', r.Type, '|', r.Null, '|', r.Default));
await conn.end();
