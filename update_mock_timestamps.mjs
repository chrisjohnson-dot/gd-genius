import mysql from 'mysql2/promise';

const url = process.env.DATABASE_URL;
if (!url) { console.error('No DATABASE_URL'); process.exit(1); }
const m = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
if (!m) { console.error('Bad URL:', url); process.exit(1); }

const conn = await mysql.createConnection({
  host: m[3], port: parseInt(m[4]), user: m[1], password: m[2], database: m[5],
  ssl: { rejectUnauthorized: false }
});

const now = Date.now();
const updates = [
  { ref: 'GD-MOCK-001', quotingStart: new Date(now - 3*3600*1000),   lastBid: new Date(now - 2.5*3600*1000) },
  { ref: 'GD-MOCK-002', quotingStart: new Date(now - 1.5*3600*1000), lastBid: new Date(now - 45*60*1000) },
  { ref: 'GD-MOCK-003', quotingStart: new Date(now - 4*3600*1000),   lastBid: new Date(now - 3.8*3600*1000) },
  { ref: 'GD-MOCK-004', quotingStart: new Date(now - 0.5*3600*1000), lastBid: new Date(now - 20*60*1000) },
  { ref: 'GD-MOCK-005', quotingStart: new Date(now - 2.5*3600*1000), lastBid: new Date(now - 2*3600*1000) },
];

for (const u of updates) {
  const [r] = await conn.execute(
    'UPDATE order_tracking SET shipwellQuotingStartedAt=?, shipwellLastBidAt=? WHERE referenceNum=?',
    [u.quotingStart, u.lastBid, u.ref]
  );
  console.log(u.ref, r.affectedRows, 'rows updated');
}

await conn.end();
console.log('Done');
