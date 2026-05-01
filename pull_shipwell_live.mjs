/**
 * Pull live Shipwell shipments and sync them into order_tracking + shipwell_rates.
 * Matches by: shipment reference_id or customer_reference_number → order referenceNum
 */
import mysql from 'mysql2/promise';
import axios from 'axios';

const url = process.env.DATABASE_URL;
const m = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
const conn = await mysql.createConnection({
  host: m[3], port: parseInt(m[4]), user: m[1], password: m[2], database: m[5],
  ssl: { rejectUnauthorized: false }
});

// ─── 1. Get Shipwell credentials ──────────────────────────────────────────────
const [cfgRows] = await conn.execute(
  'SELECT email, password, environment, cachedToken, tokenExpiresAt FROM shipwell_configs WHERE isActive=1 LIMIT 1'
);
if (!cfgRows.length) { console.error('No active Shipwell config'); process.exit(1); }
const cfg = cfgRows[0];
const BASE = cfg.environment === 'production'
  ? 'https://api.shipwell.com'
  : 'https://sandbox-api.shipwell.com';

// ─── 2. Authenticate ──────────────────────────────────────────────────────────
console.log(`Authenticating as ${cfg.email} on ${cfg.environment}...`);
let token = cfg.cachedToken;
const now = new Date();
if (!token || !cfg.tokenExpiresAt || new Date(cfg.tokenExpiresAt) <= now) {
  const authRes = await axios.post(`${BASE}/v2/auth/`, {
    email: cfg.email,
    password: cfg.password,
  });
  token = authRes.data.token;
  const expiresAt = new Date(Date.now() + 23 * 3600 * 1000); // ~23h
  await conn.execute(
    'UPDATE shipwell_configs SET cachedToken=?, tokenExpiresAt=? WHERE isActive=1',
    [token, expiresAt]
  );
  console.log('New token obtained.');
} else {
  console.log('Using cached token.');
}

const headers = { Authorization: `Token ${token}` };

// ─── 3. Fetch all quoting + tendered shipments from Shipwell ──────────────────
async function fetchShipments(status) {
  const results = [];
  let page = 1;
  while (true) {
    const res = await axios.get(`${BASE}/v2/shipments/`, {
      headers,
      params: { status, page_size: 100, page },
    });
    const data = res.data;
    results.push(...(data.results || []));
    console.log(`  ${status} page ${page}: ${data.results?.length ?? 0} shipments (total so far: ${results.length}/${data.count})`);
    if (!data.next || results.length >= data.count) break;
    page++;
  }
  return results;
}

console.log('\nFetching quoting shipments...');
const quotingShipments = await fetchShipments('quoting');
console.log('Fetching tendered shipments...');
const tenderedShipments = await fetchShipments('tendered');

const allShipments = [...quotingShipments, ...tenderedShipments];
console.log(`\nTotal shipments to process: ${allShipments.length}`);

if (allShipments.length === 0) {
  console.log('No active quoting/tendered shipments found in Shipwell.');
  await conn.end();
  process.exit(0);
}

// ─── 4. For each shipment, try to match to an order in the DB ─────────────────
let matched = 0, unmatched = 0, created = 0;

for (const s of allShipments) {
  const shipmentId = s.id;
  const refId = s.reference_id || s.customer_reference_number || null;
  const rawStatus = s.status ?? null;
  const normalizedStatus = normalizeStatus(rawStatus);
  const createdAt = s.created_at ? new Date(s.created_at) : null;

  console.log(`\nShipment ${shipmentId} | ref: ${refId} | status: ${rawStatus} → ${normalizedStatus}`);

  // Try to find matching order by reference number
  let orderRow = null;
  if (refId) {
    const [rows] = await conn.execute(
      'SELECT id, extensivOrderId, referenceNum, shipwellShipmentId FROM order_tracking WHERE referenceNum = ? LIMIT 1',
      [refId]
    );
    if (rows.length) orderRow = rows[0];
  }

  // Also try matching by shipwellShipmentId already stored
  if (!orderRow) {
    const [rows] = await conn.execute(
      'SELECT id, extensivOrderId, referenceNum, shipwellShipmentId FROM order_tracking WHERE shipwellShipmentId = ? LIMIT 1',
      [shipmentId]
    );
    if (rows.length) orderRow = rows[0];
  }

  if (orderRow) {
    matched++;
    console.log(`  ✓ Matched to order ${orderRow.referenceNum} (id=${orderRow.id})`);

    // Get bid count
    let bidCount = 0;
    try {
      const bidRes = await axios.get(`${BASE}/v2/quoting/carrier-bids/`, {
        headers,
        params: { shipment_id: shipmentId, 'page-size': 100 },
      });
      bidCount = bidRes.data.total_count ?? bidRes.data.results?.length ?? 0;
      console.log(`  Bids: ${bidCount}`);

      // Pull full bid details for rates
      const bids = bidRes.data.results || [];
      if (bids.length > 0) {
        // Clear existing rates for this order
        await conn.execute(
          'DELETE FROM shipwell_rates WHERE extensivOrderId = ? AND isMock = 0',
          [orderRow.extensivOrderId]
        );

        let lastBidAt = null;
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
          const bidCreatedAt = bid.created_at ? new Date(bid.created_at) : null;

          if (bidCreatedAt && (!lastBidAt || bidCreatedAt > lastBidAt)) {
            lastBidAt = bidCreatedAt;
          }

          await conn.execute(
            `INSERT INTO shipwell_rates
              (extensivOrderId, carrierName, carrierScac, serviceLevel, transitDays,
               totalRateCents, estimatedDelivery, isSelected, isMock, createdAt, updatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, NOW(), NOW())
             ON DUPLICATE KEY UPDATE
               carrierName=VALUES(carrierName), totalRateCents=VALUES(totalRateCents),
               transitDays=VALUES(transitDays), estimatedDelivery=VALUES(estimatedDelivery),
               updatedAt=NOW()`,
            [orderRow.extensivOrderId, carrierName, scac, serviceLevel, transitDays,
             totalCents, estDelivery]
          );
        }

        // Update lastBidAt
        if (lastBidAt) {
          await conn.execute(
            'UPDATE order_tracking SET shipwellLastBidAt=? WHERE id=?',
            [lastBidAt, orderRow.id]
          );
        }
      }
    } catch (e) {
      console.log(`  Warning: could not fetch bids: ${e.message}`);
    }

    // Update order_tracking with live Shipwell data
    await conn.execute(
      `UPDATE order_tracking SET
        shipwellShipmentId = ?,
        shipwellStatus = ?,
        shipwellBidCount = ?,
        shipwellStatusUpdatedAt = NOW(),
        shipwellQuotingStartedAt = COALESCE(shipwellQuotingStartedAt, ?)
       WHERE id = ?`,
      [shipmentId, normalizedStatus, bidCount, createdAt, orderRow.id]
    );
    console.log(`  ✓ Updated order_tracking: status=${normalizedStatus}, bids=${bidCount}`);

  } else {
    unmatched++;
    console.log(`  ✗ No matching order found for ref="${refId}" — creating stub entry`);

    // Try to get more details from the shipment
    const origin = s.stops?.[0]?.location?.address?.city || 'Unknown';
    const dest = s.stops?.[s.stops?.length - 1]?.location?.address?.city || 'Unknown';
    const clientName = s.customer?.name || s.shipper_name || refId || 'Unknown';

    // Insert a stub order_tracking row so it shows on the page
    try {
      await conn.execute(
        `INSERT INTO order_tracking
          (extensivOrderId, referenceNum, clientName, shipToName, shipToCity,
           lifecycleStatus, shipwellShipmentId, shipwellStatus, shipwellBidCount,
           shipwellStatusUpdatedAt, shipwellQuotingStartedAt,
           firstSeenAt, lastSyncedAt)
         VALUES (?, ?, ?, ?, ?, 'ship_ready', ?, ?, 0, NOW(), ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE
           shipwellShipmentId=VALUES(shipwellShipmentId),
           shipwellStatus=VALUES(shipwellStatus),
           shipwellStatusUpdatedAt=NOW()`,
        [
          -1 * (Date.now() % 1000000), // fake extensivOrderId (negative to avoid conflicts)
          refId || shipmentId,
          clientName,
          dest,
          dest,
          shipmentId,
          normalizedStatus,
          createdAt,
        ]
      );
      created++;
      console.log(`  ✓ Created stub order for shipment ${shipmentId}`);
    } catch (e) {
      console.log(`  Warning: could not create stub: ${e.message}`);
    }
  }
}

console.log(`\n=== Summary ===`);
console.log(`Matched to existing orders: ${matched}`);
console.log(`Unmatched (stub created):   ${created}`);
console.log(`Unmatched (no stub):        ${unmatched - created}`);

await conn.end();

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
