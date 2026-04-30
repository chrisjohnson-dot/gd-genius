/**
 * One-shot script: clears the mu_on_file sync_state rows (forcing a full backfill)
 * then calls syncMuOnFileNow() and prints the result.
 *
 * Usage: node scripts/run-mu-backfill.mjs
 */
import { createRequire } from "module";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

// Use tsx to run TypeScript directly
import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

console.log("[MU Backfill] Starting full backfill via tsx...");

try {
  execSync(
    `npx tsx --tsconfig tsconfig.json -e "
import { getDb } from './server/db.js';
import { sql } from 'drizzle-orm';
import { syncMuOnFileNow } from './server/scheduler/muOnFileSync.js';

async function main() {
  console.log('[MU Backfill] Resetting sync_state for mu_on_file...');
  const db = await getDb();
  await db.execute(sql\\\`DELETE FROM sync_state WHERE sync_type = 'mu_on_file'\\\`);
  console.log('[MU Backfill] sync_state cleared. Starting full backfill...');
  const result = await syncMuOnFileNow();
  console.log('[MU Backfill] Result:', JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
}
main().catch(e => { console.error('[MU Backfill] Fatal error:', e); process.exit(1); });
"`,
    { cwd: root, stdio: "inherit", env: { ...process.env } }
  );
} catch (e) {
  console.error("[MU Backfill] Script failed:", e.message);
  process.exit(1);
}
