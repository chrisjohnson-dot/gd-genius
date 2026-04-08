import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const statements = [
  "ALTER TABLE `put_away_scans` ADD COLUMN `transactionId` int NULL",
  "ALTER TABLE `put_away_scans` ADD COLUMN `facilityName` varchar(256) NULL",
  "ALTER TABLE `put_away_scans` ADD COLUMN `commitMode` enum('extensiv','scan') DEFAULT 'scan'",
];

for (const stmt of statements) {
  try {
    await conn.execute(stmt);
    console.log('OK:', stmt.slice(0, 80));
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') {
      console.log('SKIP (already exists):', stmt.slice(0, 80));
    } else {
      console.error('ERR:', e.message);
    }
  }
}

await conn.end();
console.log('Done.');
