/**
 * Seed mu_labels table from RENO and COL inventory Excel exports.
 * The "Movable Unit" column contains the MU label.
 * Looks up facility IDs from extensiv_facilities table by name match.
 */
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const XLSX = require('/home/ubuntu/gd-allocation-agent/node_modules/.pnpm/xlsx@0.18.5/node_modules/xlsx/lib/xlsx.js');

// Find mysql2
const mysql2Path = '/home/ubuntu/gd-allocation-agent/node_modules/.pnpm/mysql2@3.15.1/node_modules/mysql2/promise/index.js';
const mysql = require(mysql2Path);

const FILES = [
  { path: '/home/ubuntu/upload/RENOinventoryGridExport-20260430020523.xlsx', facilityName: 'RENO' },
  { path: '/home/ubuntu/upload/COLinventoryGridExport-20260430020523.xlsx', facilityName: 'COL' },
];

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  console.log('Connected to DB');

  // Get all facilities
  const [facilities] = await conn.execute('SELECT id, name FROM extensiv_facilities');
  console.log('Facilities:', facilities.map(f => `${f.id}:${f.name}`).join(', '));

  // Get the first active config
  const [configs] = await conn.execute('SELECT id FROM extensiv_configs WHERE is_active = 1 LIMIT 1');
  if (!configs.length) { console.error('No active config found'); process.exit(1); }
  const configId = configs[0].id;
  console.log('Using config_id:', configId);

  let totalInserted = 0;
  let totalSkipped = 0;

  for (const { path, facilityName } of FILES) {
    // Find facility ID by name (case-insensitive partial match)
    const facility = facilities.find(f =>
      f.name.toUpperCase().includes(facilityName.toUpperCase()) ||
      facilityName.toUpperCase().includes(f.name.toUpperCase().split(' ')[0])
    );
    if (!facility) {
      console.warn(`No facility found matching "${facilityName}" — available: ${facilities.map(f => f.name).join(', ')}`);
      continue;
    }
    console.log(`\nProcessing ${facilityName} (facility_id=${facility.id}) from ${path}`);

    // Read Excel
    const wb = XLSX.readFile(path);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
    console.log(`  Total rows: ${rows.length}`);
    console.log(`  Columns: ${Object.keys(rows[0] || {}).join(', ')}`);

    let inserted = 0;
    let skipped = 0;

    for (const row of rows) {
      const muLabel = row['Movable Unit'];
      if (!muLabel || String(muLabel).trim() === '' || String(muLabel).trim().toLowerCase() === 'null') {
        skipped++;
        continue;
      }
      const sku = String(row['SKU'] || '').trim();
      const muType = String(row['Movable Unit Type'] || 'Pallet').trim();
      const qty = parseInt(row['On Hand Primary'] || '0', 10) || 0;
      const location = String(row['Location'] || '').trim();
      const muLabelStr = String(muLabel).trim();

      try {
        await conn.execute(
          `INSERT INTO mu_labels
            (config_id, facility_id, transaction_id, receiver_item_id, sku, mu_label, mu_type, qty, synced_to_extensiv, created_at)
           VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, 0, ?)
           ON DUPLICATE KEY UPDATE
             sku = VALUES(sku),
             mu_type = VALUES(mu_type),
             qty = VALUES(qty),
             created_at = VALUES(created_at)`,
          [configId, facility.id, sku, muLabelStr, muType, qty, Date.now()]
        );
        inserted++;
      } catch (err) {
        console.error(`  Upsert error for MU=${muLabelStr}: ${err.message}`);
      }
    }
    console.log(`  Inserted/updated: ${inserted}, Skipped (no MU): ${skipped}`);
    totalInserted += inserted;
    totalSkipped += skipped;
  }

  console.log(`\nDone. Total upserted: ${totalInserted}, Total skipped (no MU): ${totalSkipped}`);

  // Verify
  const [countRows] = await conn.execute('SELECT facility_id, COUNT(*) as cnt FROM mu_labels GROUP BY facility_id');
  console.log('mu_labels counts by facility:', countRows);

  await conn.end();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
