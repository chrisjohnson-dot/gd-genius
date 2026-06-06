import { createConnection } from 'mysql2/promise';
import crypto from 'crypto';

const conn = await createConnection(process.env.DATABASE_URL);

// Add badge_token column if it doesn't exist
try {
  await conn.query('ALTER TABLE team_accounts ADD COLUMN badge_token VARCHAR(64) NULL');
  console.log('Added badge_token column');
} catch (e) {
  if (e.code === 'ER_DUP_FIELDNAME' || e.sqlMessage?.includes('Duplicate column')) {
    console.log('badge_token column already exists');
  } else {
    throw e;
  }
}

// Generate unique tokens for all accounts that don't have one
const [accounts] = await conn.query('SELECT id, username, name, role FROM team_accounts WHERE badge_token IS NULL AND active = 1');
console.log('Accounts needing tokens:', accounts.length);

const tokens = [];
for (const acc of accounts) {
  const token = 'GDLOGIN-' + acc.username.toUpperCase() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  await conn.query('UPDATE team_accounts SET badge_token = ? WHERE id = ?', [token, acc.id]);
  console.log(acc.username + ' (' + acc.role + '): ' + token);
  tokens.push({ username: acc.username, name: acc.name, role: acc.role, token });
}

// Also show all existing tokens
const [all] = await conn.query('SELECT username, name, role, badge_token FROM team_accounts WHERE active = 1 ORDER BY id');
console.log('\nAll active accounts with badge tokens:');
for (const a of all) {
  console.log(a.username + ' (' + a.role + '): ' + a.badge_token);
}

await conn.end();
