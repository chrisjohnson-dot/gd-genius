/**
 * Pull live Shipwell shipments (quoting + tendered) using API key,
 * fetch carrier bids for each, and sync into order_tracking + shipwell_rates.
 */
import mysql from 'mysql2/promise';
import axios from 'axios';

const TOKEN = '27d0e8d40dce3f190158e56767727df6';
const BASE = 'https://api.shipwell.com';
const headers = { Authorization: `Token ${TOKEN}`, 'Content-Type': 'application/json' };

// ─── DB connection ────────────────────────────────────────────────────────────
const url = process.env.DATABASE_URL;
const m = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
const conn = await mysql.createConnection({
  host: m[3], port: parseInt(m[4]), user: m[1], password: m[2], database: m[5],
  ssl: { rejectUnauthorized: false }
});

// ─── Update the stored config to use API key ──────────────────────────────────
await conn.execute(
  'UPDATE shipwell_configs SET cachedToken=?, tokenExpiresAt=? WHERE isActive=1',
  [TOKEN, new Date(Date.now() + 365 * 24 * 3600 * 1000)]
);
console.log('Updated stored token to API key.');

// ─── Fetch all shipments for a given status ───────────────────────────────────
async function fetchShipments(status) {
  const results = [];
  let page = 1;
  while (true) {
    try {
      const res = await axios.get(`${BASE}/v2/shipments/`, {
        headers,
        params: { status, page_size: 20, page },
      });
      const data = res.data;
      const batch = data.results || [];
      results.push(...batch);
      console.log(`  ${status} page ${page}: ${batch.length} shipments (total: ${results.length})`);
      if (!data.next || batch.length === 0) break;
      page++;
    } catch (e) {
      if (e.response?.status === 404) break; // no more pages
      throw e;
    }
  }
  return results;
}

// ─── Fetch carrier bids for a shipment ───────────────────────────────────────
async function fetchBids(shipmentId) {
  try {
    const res = await axios.get(`${BASE}/v2/quoting/carrier-bids/`, {
      headers,
      params: { shipment_id: shipmentId, page_size: 50 },
    });
    return res.data.results || [];
  } catch {
    return [];
  }
}

// ─── Normalize status ─────────────────────────────────────────────────────────
function normalizeStatus(raw) {
  if (!raw) return 'unknown';
  const s = raw.toLowerCase().replace(/[\s-]/g, '_');
  if (s.includes('delivered')) return 'delivered';
  if (s.includes('in_transit') || s.includes('intransit') || s.includes('picked_up')) return 'in_transit';
  if (s.includes('carrier_confirmed') || s.includes('confirmed')) return 'carrier_confirmed';
  if (s.includes('tendered')) return 'tendered';
  if (s.includes('quoting') || s.includes('quote')) return 'quoting';
  if (s.includes('cancel')) return 'cancelled';
  return 'unknown';
}

// ─── Main ─────────────────────────────────────────────────────────────────────
console.log('\nFetching quoting shipments...');
const quotingShipments = await fetchShipments('quoting');
console.log('Fetching tendered shipments...');
const tenderedShipments = await fetchShipments('tendered');
const allShipments = [...quotingShipments, ...tenderedShipments];
console.log(`\nTotal shipments to process: ${allShipments.length}`);

if (allShipments.length === 0) {
  console.log('No active shipments found.');
  await conn.end();
  process.exit(0);
}

let matched = 0, stubCreated = 0, skipped = 0;

for (const s of allShipments) {
  const shipmentId = s.id;
  const refId = s.reference_id || s.customer_reference_number || null;
  const normalizedStatus = normalizeStatus(s.status);
  const createdAt = s.created_at ? new Date(s.created_at) : null;

  process.stdout.write(`\nShipment ${shipmentId} | ref: ${refId} | ${s.status} → ${normalizedStatus}`);

  // Skip delivered/cancelled
  if (normalizedStatus === 'delivered' || normalizedStatus === 'cancelled') {
    process.stdout.write(' [SKIP]\n');
    skipped++;
    continue;
  }

  // Try to find matching order by reference number
  let orderRow = null;
  if (refId) {
    const [rows] = await conn.execute(
      'SELECT id, extensivOrderId, referenceNum FROM order_tracking WHERE referenceNum = ? LIMIT 1',
      [refId]
    );
    if (rows.length) orderRow = rows[0];
  }
  // Also try by existing shipwellShipmentId
  if (!orderRow) {
    const [rows] = await conn.execute(
      'SELECT id, extensivOrderId, referenceNum FROM order_tracking WHERE shipwellShipmentId = ? LIMIT 1',
      [shipmentId]
    );
    if (rows.length) orderRow = rows[0];
  }

  // Fetch bids
  const bids = await fetchBids(shipmentId);
  const bidCount = bids.length;
  process.stdout.write(` | bids: ${bidCount}`);

  // Find last bid timestamp
  let lastBidAt = null;
  for (const bid of bids) {
    const t = bid.created_at ? new Date(bid.created_at) : null;
    if (t && (!lastBidAt || t > lastBidAt)) lastBidAt = t;
  }

  if (orderRow) {
    matched++;
    process.stdout.write(` | matched → ${orderRow.referenceNum}\n`);

    // Clear old non-mock rates
    await conn.execute(
      'DELETE FROM shipwell_rates WHERE extensivOrderId = ? AND isMock = 0',
      [orderRow.extensivOrderId]
    );

    // Insert live rates
    for (const bid of bids) {
      const carrierName = bid.carrier?.name || bid.carrier_name || 'Unknown Carrier';
      const scac = bid.carrier?.scac_code || bid.scac || null;
      const serviceLevel = bid.service_level?.name || bid.service_name || null;
      const transitDays = bid.transit_days ?? null;
      const totalCents = bid.total_charge_amount != null
        ? Math.round(parseFloat(bid.total_charge_amount) * 100)
        : bid.rate_amount != null
        ? Math.round(parseFloat(bid.rate_amount) * 100)
        : 0;
      const estDelivery = bid.estimated_delivery_date || bid.delivery_date || null;

      await conn.execute(
        `INSERT INTO shipwell_rates
          (extensivOrderId, carrierName, carrierScac, serviceLevel, transitDays,
           totalRateCents, estimatedDelivery, isSelected, isMock, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, NOW(), NOW())`,
        [orderRow.extensivOrderId, carrierName, scac, serviceLevel, transitDays, totalCents, estDelivery]
      );
    }

    // Update order_tracking
    await conn.execute(
      `UPDATE order_tracking SET
        shipwellShipmentId = ?,
        shipwellStatus = ?,
        shipwellBidCount = ?,
        shipwellStatusUpdatedAt = NOW(),
        shipwellLastBidAt = COALESCE(?, shipwellLastBidAt),
        shipwellQuotingStartedAt = COALESCE(shipwellQuotingStartedAt, ?)
       WHERE id = ?`,
      [shipmentId, normalizedStatus, bidCount, lastBidAt, createdAt, orderRow.id]
    );

  } else {
    // Create stub order so it shows on the Shipping Quotes page
    process.stdout.write(` | no match — creating stub\n`);
    const clientName = s.customer?.name || s.shipper_name || refId || 'Unknown';
    const destCity = s.stops?.[s.stops?.length - 1]?.location?.address?.city || 'Unknown';
    const fakeExtensivId = -(Math.abs(shipmentId.hashCode?.() ?? Date.now() % 999999));

    // Use a deterministic negative ID based on shipment UUID
    const hashNum = shipmentId.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 0);
    const fakeId = Math.abs(hashNum) % 900000 + 100000;

    try {
      const [existing] = await conn.execute(
        'SELECT id FROM order_tracking WHERE shipwellShipmentId = ? LIMIT 1', [shipmentId]
      );
      if (existing.length === 0) {
        await conn.execute(
          `INSERT INTO order_tracking
            (extensivOrderId, referenceNum, clientName, shipToName, shipToCity,
             lifecycleStatus, shipwellShipmentId, shipwellStatus, shipwellBidCount,
             shipwellStatusUpdatedAt, shipwellQuotingStartedAt, shipwellLastBidAt,
             firstSeenAt, lastSyncedAt)
           VALUES (?, ?, ?, ?, ?, 'ship_ready', ?, ?, ?, NOW(), ?, ?, NOW(), NOW())`,
          [
            -fakeId, refId || shipmentId, clientName, destCity, destCity,
            shipmentId, normalizedStatus, bidCount, createdAt, lastBidAt
          ]
        );
        stubCreated++;

        // Insert rates for stub
        const [stubRow] = await conn.execute(
          'SELECT id, extensivOrderId FROM order_tracking WHERE shipwellShipmentId = ? LIMIT 1', [shipmentId]
        );
        if (stubRow.length && bids.length > 0) {
          for (const bid of bids) {
            const carrierName = bid.carrier?.name || bid.carrier_name || 'Unknown Carrier';
            const scac = bid.carrier?.scac_code || bid.scac || null;
            const serviceLevel = bid.service_level?.name || bid.service_name || null;
            const transitDays = bid.transit_days ?? null;
            const totalCents = bid.total_charge_amount != null
              ? Math.round(parseFloat(bid.total_charge_amount) * 100)
              : bid.rate_amount != null
              ? Math.round(parseFloat(bid.rate_amount) * 100)
              : 0;
            const estDelivery = bid.estimated_delivery_date || bid.delivery_date || null;
            await conn.execute(
              `INSERT INTO shipwell_rates
                (extensivOrderId, carrierName, carrierScac, serviceLevel, transitDays,
                 totalRateCents, estimatedDelivery, isSelected, isMock, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, NOW(), NOW())`,
              [stubRow[0].extensivOrderId, carrierName, scac, serviceLevel, transitDays, totalCents, estDelivery]
            );
          }
        }
      }
    } catch (e) {
      console.log(`  Warning: stub insert failed: ${e.message}`);
    }
  }
}

console.log(`\n=== Summary ===`);
console.log(`Matched to existing orders: ${matched}`);
console.log(`Stub orders created:        ${stubCreated}`);
console.log(`Skipped (delivered/cancelled): ${skipped}`);

// Also update the stored config to use API key auth going forward
await conn.execute(
  "UPDATE shipwell_configs SET email='api-key', password=? WHERE isActive=1",
  [TOKEN]
);

await conn.end();
console.log('\nDone.');
