import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);
try {
  await conn.execute('ALTER TABLE `rate_wizard_shipments` ADD COLUMN `session_id` int');
  console.log('Migration 0060: session_id column added successfully');
} catch (err) {
  if (err.code === 'ER_DUP_FIELDNAME') {
    console.log('Migration 0060: session_id column already exists, skipping');
  } else {
    throw err;
  }
}
await conn.end();
