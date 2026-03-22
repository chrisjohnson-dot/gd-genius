/**
 * Seed client_visibility from the selected-customers TSV.
 * Upserts all customers under configId=3 (the single GD Allocation config).
 * Preserves existing isVisible values — only inserts rows that don't exist yet.
 * Run with: node scripts/seed-client-visibility.mjs
 */

import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

// ─── Master customer list from TSV ───────────────────────────────────────────
const customers = [
  { id: 145, name: "Amercare" },
  { id: 205, name: "Bamboo Sports and Skateboards" },
  { id: 160, name: "BeatBox" },
  { id: 179, name: "BigBoi" },
  { id: 220, name: "Biggest Little Skincare Co." },
  { id: 231, name: "Birch Babe" },
  { id: 154, name: "Bliss Beauty" },
  { id: 191, name: "BOBA" },
  { id: 37,  name: "Browluxe" },
  { id: 204, name: "Bubblegum Kids" },
  { id: 177, name: "Caboo" },
  { id: 226, name: "CanPrev" },
  { id: 100, name: "Chlorophyll Water" },
  { id: 212, name: "Clew" },
  { id: 113, name: "Click & Grow" },
  { id: 208, name: "CorporateGifts.com" },
  { id: 202, name: "Daily Nouri" },
  { id: 233, name: "David White's SitePro" },
  { id: 158, name: "Deep Relief CBD" },
  { id: 144, name: "Dolce and Gabbana" },
  { id: 229, name: "Drink Pres" },
  { id: 218, name: "Drink Proxies" },
  { id: 170, name: "Elie Saab" },
  { id: 111, name: "Florence By Mills" },
  { id: 147, name: "Forte Brands" },
  { id: 237, name: "Gift Tree" },
  { id: 44,  name: "Global Appetite" },
  { id: 131, name: "Growl Products INC." },
  { id: 234, name: "Hate From Venice" },
  { id: 228, name: "Havn Life" },
  { id: 213, name: "Helvina" },
  { id: 188, name: "Hempz" },
  { id: 235, name: "Humble Snacks" },
  { id: 224, name: "IBG Group" },
  { id: 173, name: "Joyburst" },
  { id: 81,  name: "JUUL  - Juul Labs - RETB" },
  { id: 86,  name: "JUUL - Juul Labs - HOLDS" },
  { id: 3,   name: "JUUL – Juul Labs - B2B" },
  { id: 33,  name: "JUUL – Juul Labs - D2C" },
  { id: 34,  name: "JUUL – Juul Labs - D2R" },
  { id: 79,  name: "JUUL INTL" },
  { id: 83,  name: "JUUL USA  - D2C" },
  { id: 85,  name: "JUUL USA  - HOLDS" },
  { id: 82,  name: "JUUL USA - B2B" },
  { id: 116, name: "JUUL USA - BULK" },
  { id: 93,  name: "JUUL USA - RETB" },
  { id: 129, name: "K18 Inc - B2B" },
  { id: 217, name: "K18 Inc. - BST" },
  { id: 130, name: "K18 Inc. - D2C" },
  { id: 185, name: "Kabrita" },
  { id: 192, name: "KGP" },
  { id: 197, name: "Kindling" },
  { id: 209, name: "LDK Health & Wellness" },
  { id: 151, name: "Left Coast Naturals" },
  { id: 216, name: "Lil Bucks" },
  { id: 222, name: "Magic Scoop" },
  { id: 166, name: "Magnolia Bakery" },
  { id: 214, name: "Main St. Group - Projects" },
  { id: 24,  name: "Nestle - Medical - NBPM" },
  { id: 11,  name: "Nestle - NOPT" },
  { id: 10,  name: "Nestle Baby Back Pack - NEBP" },
  { id: 26,  name: "Nestle Health Science - Non-Boost" },
  { id: 6,   name: "Nestle Health Science Boost/Non-Boost -NHS" },
  { id: 55,  name: "Nestle Health Science Peptamen" },
  { id: 56,  name: "Nestle Natural Health Products" },
  { id: 12,  name: "Nestle Optifast - Complete" },
  { id: 13,  name: "Nestle Optifast - Peptamen" },
  { id: 171, name: "No Sugar Company" },
  { id: 190, name: "ONCO" },
  { id: 156, name: "Organika - Amazon" },
  { id: 143, name: "Organika - B2B" },
  { id: 142, name: "Organika - SD" },
  { id: 223, name: "Origin Malt" },
  { id: 183, name: "Protein2o" },
  { id: 165, name: "Quantum" },
  { id: 196, name: "Raw C" },
  { id: 161, name: "Santo Amaro" },
  { id: 201, name: "Saya Skincare" },
  { id: 236, name: "Schaaf Tools" },
  { id: 71,  name: "Scotts" },
  { id: 141, name: "Serenity Kids" },
  { id: 14,  name: "Shaper Tools" },
  { id: 215, name: "Simoniz" },
  { id: 140, name: "SmartSweets" },
  { id: 193, name: "Summit Refrigerants" },
  { id: 227, name: "Ted Baker" },
  { id: 174, name: "Terra Kai" },
  { id: 176, name: "Threshold" },
  { id: 221, name: "Undercover Snacks" },
  { id: 225, name: "Vintage Home" },
  { id: 157, name: "Well Played Toys" },
  { id: 172, name: "Wellnx" },
  { id: 232, name: "Wet Hydration" },
];

const CONFIG_ID = 3;

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  console.log(`Seeding ${customers.length} customers into client_visibility (configId=${CONFIG_ID})…`);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const c of customers) {
    // Check if row already exists
    const [rows] = await conn.execute(
      "SELECT id, clientName FROM client_visibility WHERE configId = ? AND clientId = ?",
      [CONFIG_ID, c.id]
    );

    if (rows.length === 0) {
      // Insert new row — visible by default
      await conn.execute(
        "INSERT INTO client_visibility (configId, clientId, clientName, isVisible) VALUES (?, ?, ?, 1)",
        [CONFIG_ID, c.id, c.name]
      );
      inserted++;
      console.log(`  + Inserted: ${c.name} (${c.id})`);
    } else {
      const existing = rows[0];
      // Update name if it changed (preserve isVisible)
      if (existing.clientName !== c.name) {
        await conn.execute(
          "UPDATE client_visibility SET clientName = ? WHERE configId = ? AND clientId = ?",
          [c.name, CONFIG_ID, c.id]
        );
        updated++;
        console.log(`  ~ Updated name: ${existing.clientName} → ${c.name}`);
      } else {
        skipped++;
      }
    }
  }

  await conn.end();
  console.log(`\nDone. Inserted: ${inserted}, Updated: ${updated}, Skipped (already correct): ${skipped}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
