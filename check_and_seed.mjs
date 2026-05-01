import { createConnection } from 'mysql2/promise';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('No DATABASE_URL found');
  process.exit(1);
}

// Parse mysql://user:pass@host:port/db?ssl=...
const m = dbUrl.match(/mysql:\/\/([^:]+):([^@]+)@([^:/]+):(\d+)\/([^?]+)/);
if (!m) {
  console.error('Cannot parse DATABASE_URL:', dbUrl.substring(0, 60));
  process.exit(1);
}
const [, user, password, host, portStr, database] = m;
const port = parseInt(portStr || '4000');

const conn = await createConnection({ host, user, password, database, port, ssl: { rejectUnauthorized: false } });

// Check existing mock rows
const [existing] = await conn.execute(
  'SELECT extensivOrderId, referenceNum, clientName, lifecycleStatus, shipwellStatus FROM order_tracking WHERE extensivOrderId >= 900000001 ORDER BY extensivOrderId'
);
console.log(`Existing mock order rows: ${existing.length}`);
for (const r of existing) console.log(' ', r);

// Delete and re-insert mock orders
console.log('\nRe-seeding mock orders...');
const mockOrders = [
  {
    extensivOrderId: 900000001,
    referenceNum: 'GD-MOCK-001',
    poNum: 'PO-MOCK-001',
    configId: 1,
    clientId: 9001,
    clientName: 'Acme Corp',
    facilityId: 1,
    facilityName: 'COL-Columbus',
    shipToName: 'Acme Distribution Center',
    shipToCity: 'Chicago, IL',
    totalPieces: 48,
    skuCount: 3,
    lifecycleStatus: 'ship_ready',
    shipwellOrderId: 'sw-mock-001',
    shipwellShipmentId: 'shp-mock-001',
    shipwellPoUrl: 'https://app.shipwell.com/shipments/shp-mock-001',
    shipwellStatus: 'quoting',
    shipwellBidCount: 4,
    requiredShipDate: '2026-05-03',
    palletCount: 4,
    outboundLocation: 'Lane 1A',
  },
  {
    extensivOrderId: 900000002,
    referenceNum: 'GD-MOCK-002',
    poNum: 'PO-MOCK-002',
    configId: 1,
    clientId: 9002,
    clientName: 'NutriBlend Foods',
    facilityId: 1,
    facilityName: 'COL-Columbus',
    shipToName: 'NutriBlend Warehouse',
    shipToCity: 'Dallas, TX',
    totalPieces: 120,
    skuCount: 5,
    lifecycleStatus: 'ship_ready',
    shipwellOrderId: 'sw-mock-002',
    shipwellShipmentId: 'shp-mock-002',
    shipwellPoUrl: 'https://app.shipwell.com/shipments/shp-mock-002',
    shipwellStatus: 'quoting',
    shipwellBidCount: 3,
    requiredShipDate: '2026-05-05',
    palletCount: 10,
    outboundLocation: 'Lane 2B',
  },
  {
    extensivOrderId: 900000003,
    referenceNum: 'GD-MOCK-003',
    poNum: 'PO-MOCK-003',
    configId: 1,
    clientId: 9003,
    clientName: 'PetPals Inc',
    facilityId: 1,
    facilityName: 'COL-Columbus',
    shipToName: 'PetPals Fulfillment Hub',
    shipToCity: 'Atlanta, GA',
    totalPieces: 60,
    skuCount: 2,
    lifecycleStatus: 'ship_ready',
    shipwellOrderId: 'sw-mock-003',
    shipwellShipmentId: 'shp-mock-003',
    shipwellPoUrl: 'https://app.shipwell.com/shipments/shp-mock-003',
    shipwellStatus: 'quoting',
    shipwellBidCount: 2,
    requiredShipDate: '2026-04-30',
    palletCount: 5,
    outboundLocation: 'Lane 1C',
  },
  {
    extensivOrderId: 900000004,
    referenceNum: 'GD-MOCK-004',
    poNum: 'PO-MOCK-004',
    configId: 1,
    clientId: 9004,
    clientName: 'CleanHome Brands',
    facilityId: 1,
    facilityName: 'COL-Columbus',
    shipToName: 'CleanHome DC West',
    shipToCity: 'Los Angeles, CA',
    totalPieces: 240,
    skuCount: 8,
    lifecycleStatus: 'ship_ready',
    shipwellOrderId: 'sw-mock-004',
    shipwellShipmentId: 'shp-mock-004',
    shipwellPoUrl: 'https://app.shipwell.com/shipments/shp-mock-004',
    shipwellStatus: 'tendered',
    shipwellBidCount: 5,
    requiredShipDate: '2026-05-07',
    palletCount: 20,
    outboundLocation: 'Lane 3B',
  },
  {
    extensivOrderId: 900000005,
    referenceNum: 'GD-MOCK-005',
    poNum: 'PO-MOCK-005',
    configId: 1,
    clientId: 9005,
    clientName: 'Sunrise Supplements',
    facilityId: 1,
    facilityName: 'COL-Columbus',
    shipToName: 'Sunrise East DC',
    shipToCity: 'Philadelphia, PA',
    totalPieces: 36,
    skuCount: 2,
    lifecycleStatus: 'ship_ready',
    shipwellOrderId: 'sw-mock-005',
    shipwellShipmentId: 'shp-mock-005',
    shipwellPoUrl: 'https://app.shipwell.com/shipments/shp-mock-005',
    shipwellStatus: 'quoting',
    shipwellBidCount: 3,
    requiredShipDate: '2026-05-04',
    palletCount: 6,
    outboundLocation: 'Lane 3D',
  },
];

for (const o of mockOrders) {
  await conn.execute('DELETE FROM order_tracking WHERE extensivOrderId = ?', [o.extensivOrderId]);
  await conn.execute(`
    INSERT INTO order_tracking
      (extensivOrderId, referenceNum, poNum, configId, clientId, clientName,
       facilityId, facilityName, shipToName, shipToCity, totalPieces, skuCount,
       lifecycleStatus, shipwellOrderId, shipwellShipmentId, shipwellPoUrl,
       shipwellStatus, shipwellBidCount, requiredShipDate, palletCount,
       outboundLocation, shipReadyAt, shipwellStatusUpdatedAt,
       firstSeenAt, lastSyncedAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW(),NOW(),NOW())
  `, [
    o.extensivOrderId, o.referenceNum, o.poNum, o.configId,
    o.clientId, o.clientName, o.facilityId, o.facilityName,
    o.shipToName, o.shipToCity, o.totalPieces, o.skuCount,
    o.lifecycleStatus, o.shipwellOrderId, o.shipwellShipmentId,
    o.shipwellPoUrl, o.shipwellStatus, o.shipwellBidCount,
    o.requiredShipDate, o.palletCount, o.outboundLocation,
  ]);
  console.log(`  ✓ Inserted mock order ${o.referenceNum} (extensivOrderId=${o.extensivOrderId})`);
}

// Re-seed rates
console.log('\nRe-seeding mock carrier rates...');
await conn.execute('DELETE FROM shipwell_rates WHERE is_mock = 1');
const mockRates = [
  // Order 001 — 4 bids
  [900000001, 'shp-mock-001', 'Old Dominion Freight Line', 'ODFL', 'LTL Standard', 3, 189700, '2026-05-05', 'sw-rate-001a'],
  [900000001, 'shp-mock-001', 'XPO Logistics',             'XPOL', 'LTL Economy',  4, 162400, '2026-05-06', 'sw-rate-001b'],
  [900000001, 'shp-mock-001', 'Estes Express Lines',       'EXLA', 'LTL Standard', 3, 175500, '2026-05-05', 'sw-rate-001c'],
  [900000001, 'shp-mock-001', 'ABF Freight',               'ABFS', 'Volume LTL',   5, 148900, '2026-05-07', 'sw-rate-001d'],
  // Order 002 — 3 bids
  [900000002, 'shp-mock-002', 'FedEx Freight Priority',    'FXFE', 'LTL Priority', 2, 221300, '2026-05-05', 'sw-rate-002a'],
  [900000002, 'shp-mock-002', 'Old Dominion Freight Line', 'ODFL', 'LTL Standard', 3, 198600, '2026-05-06', 'sw-rate-002b'],
  [900000002, 'shp-mock-002', 'Saia LTL Freight',          'SAIA', 'LTL Standard', 3, 187200, '2026-05-06', 'sw-rate-002c'],
  // Order 003 — 2 bids (overdue)
  [900000003, 'shp-mock-003', 'XPO Logistics',             'XPOL', 'LTL Economy',  4, 143800, '2026-05-04', 'sw-rate-003a'],
  [900000003, 'shp-mock-003', 'Estes Express Lines',       'EXLA', 'LTL Standard', 3, 159200, '2026-05-03', 'sw-rate-003b'],
  // Order 004 — 5 bids
  [900000004, 'shp-mock-004', 'FedEx Freight Economy',     'FXFE', 'LTL Economy',  4, 312500, '2026-05-09', 'sw-rate-004a'],
  [900000004, 'shp-mock-004', 'Old Dominion Freight Line', 'ODFL', 'LTL Standard', 3, 298700, '2026-05-08', 'sw-rate-004b'],
  [900000004, 'shp-mock-004', 'UPS Freight',               'UPGF', 'LTL Standard', 3, 285400, '2026-05-08', 'sw-rate-004c'],
  [900000004, 'shp-mock-004', 'ABF Freight',               'ABFS', 'Volume LTL',   5, 261000, '2026-05-10', 'sw-rate-004d'],
  [900000004, 'shp-mock-004', 'Saia LTL Freight',          'SAIA', 'LTL Economy',  4, 271800, '2026-05-09', 'sw-rate-004e'],
  // Order 005 — 3 bids
  [900000005, 'shp-mock-005', 'Estes Express Lines',       'EXLA', 'LTL Standard', 2,  98400, '2026-05-06', 'sw-rate-005a'],
  [900000005, 'shp-mock-005', 'Old Dominion Freight Line', 'ODFL', 'LTL Standard', 2, 104700, '2026-05-06', 'sw-rate-005b'],
  [900000005, 'shp-mock-005', 'XPO Logistics',             'XPOL', 'LTL Economy',  3,  89900, '2026-05-07', 'sw-rate-005c'],
];

for (const [extId, shpId, carrier, scac, svc, days, cents, estDel, rateId] of mockRates) {
  await conn.execute(`
    INSERT INTO shipwell_rates
      (extensiv_order_id, shipwell_shipment_id, carrier_name, carrier_scac,
       service_level, transit_days, total_rate_cents, currency,
       estimated_delivery, is_selected, shipwell_rate_id, is_mock)
    VALUES (?,?,?,?,?,?,?,'USD',?,0,?,1)
  `, [extId, shpId, carrier, scac, svc, days, cents, estDel, rateId]);
}
console.log(`  ✓ Inserted ${mockRates.length} mock carrier rates`);

// Verify
const [finalRows] = await conn.execute(
  'SELECT extensivOrderId, referenceNum, clientName, lifecycleStatus, shipwellStatus FROM order_tracking WHERE extensivOrderId >= 900000001 ORDER BY extensivOrderId'
);
console.log(`\n✅ Final mock order count: ${finalRows.length}`);
for (const r of finalRows) console.log(' ', r);

await conn.end();
