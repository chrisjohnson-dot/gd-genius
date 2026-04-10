/**
 * Live Rate Wizard Test
 * Simulates a real small parcel rate request from Groveport OH to a sample destination
 * using all configured carriers (FedEx, USPS, UPS, OnTrac, DHL).
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Load env
const dotenv = require('dotenv');
dotenv.config({ path: '.env' });

// Import carrier fetchers
const { fetchAllCarrierRates } = await import('./server/carriers/index.ts').catch(async () => {
  // Try compiled version
  const { fetchFedExRates } = await import('./server/carriers/fedex.ts');
  const { fetchUSPSRates } = await import('./server/carriers/usps.ts');
  const { fetchUPSRates } = await import('./server/carriers/ups.ts');
  const { fetchOnTracRates } = await import('./server/carriers/ontrac.ts');
  const { fetchDHLRates } = await import('./server/carriers/dhl.ts');
  return {
    fetchAllCarrierRates: async (input) => {
      const results = await Promise.allSettled([
        fetchFedExRates(input),
        fetchUSPSRates(input),
        fetchUPSRates(input),
        fetchOnTracRates(input),
        fetchDHLRates(input),
      ]);
      return results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
    }
  };
});

const testInput = {
  originName: "Go Direct America",
  originAddress1: "5830 Saltzgaber Rd",
  originCity: "Groveport",
  originState: "OH",
  originPostal: "43125",
  originCountry: "US",
  destName: "Test Recipient",
  destAddress1: "123 Main St",
  destCity: "Los Angeles",
  destState: "CA",
  destPostal: "90210",
  destCountry: "US",
  isResidential: true,
  weightLbs: 3.5,
  lengthIn: 12,
  widthIn: 9,
  heightIn: 4,
};

console.log("=== Live Rate Wizard Test ===");
console.log(`Origin: ${testInput.originAddress1}, ${testInput.originCity} ${testInput.originState} ${testInput.originPostal}`);
console.log(`Destination: ${testInput.destCity}, ${testInput.destState} ${testInput.destPostal}`);
console.log(`Package: ${testInput.weightLbs} lbs, ${testInput.lengthIn}×${testInput.widthIn}×${testInput.heightIn} in`);
console.log("");

const rates = await fetchAllCarrierRates(testInput);

if (rates.length === 0) {
  console.log("❌ No rates returned from any carrier");
} else {
  console.log(`✅ ${rates.length} rate(s) returned:\n`);
  // Group by carrier
  const byCarrier = {};
  for (const r of rates) {
    if (!byCarrier[r.carrierName]) byCarrier[r.carrierName] = [];
    byCarrier[r.carrierName].push(r);
  }
  for (const [carrier, carrierRates] of Object.entries(byCarrier)) {
    console.log(`  ${carrier}:`);
    for (const r of carrierRates.sort((a, b) => a.totalCost - b.totalCost)) {
      const transit = r.transitDays === 99 ? "?" : `${r.transitDays}d`;
      console.log(`    ${r.service.padEnd(35)} $${r.totalCost.toFixed(2).padStart(7)}  [${transit}]`);
    }
    console.log("");
  }
  const cheapest = rates.reduce((a, b) => a.totalCost < b.totalCost ? a : b);
  const fastest = rates.reduce((a, b) => a.transitDays < b.transitDays ? a : b);
  console.log(`💰 Cheapest: ${cheapest.carrierName} ${cheapest.service} — $${cheapest.totalCost.toFixed(2)}`);
  console.log(`⚡ Fastest:  ${fastest.carrierName} ${fastest.service} — ${fastest.transitDays}d ($${fastest.totalCost.toFixed(2)})`);
}
