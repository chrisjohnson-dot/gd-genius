/**
 * 10-1-Go Test Framework
 * ─────────────────────────────────────────────────────────────────────────────
 * 10 adversarial tests. 1 goal: ship with confidence.
 *
 * Usage:
 *   node tests/ten-one-go/runner.mjs <test-file>
 *   node tests/ten-one-go/runner.mjs tests/ten-one-go/features/batch-carrier-pickup.mjs
 *
 * Each test file exports a default object: { feature, goal, tests[] }
 * Each test: { id, name, category, run() → { pass, detail, warning? } }
 */

import { createConnection } from 'mysql2/promise';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── DB connection factory ─────────────────────────────────────────────────────
export async function getDb() {
  return createConnection(
    'mysql://4NCq8mAsshAuKGA.2865343ca485:9X0dm2uiL1goZL2EASv7@gateway04.us-east-1.prod.aws.tidbcloud.com:4000/K5ogkLhSXtccCnqH4Vm3fs?ssl={"rejectUnauthorized":true}'
  );
}

// ── The 10 test categories (always in this order) ────────────────────────────
export const CATEGORIES = [
  { id: 1, name: "Happy Path",         emoji: "✅", desc: "Core workflow works as designed" },
  { id: 2, name: "Empty / Zero Input", emoji: "🕳️",  desc: "Handles missing or empty data gracefully" },
  { id: 3, name: "Boundary Values",    emoji: "📏", desc: "Edge cases at min/max limits" },
  { id: 4, name: "Duplicate / Replay", emoji: "🔁", desc: "Same action twice doesn't corrupt state" },
  { id: 5, name: "Bad Input",          emoji: "💣", desc: "Invalid or malformed data is rejected" },
  { id: 6, name: "Permission / Auth",  emoji: "🔒", desc: "Unauthorized access is blocked" },
  { id: 7, name: "Concurrency / Race", emoji: "⚡", desc: "Simultaneous actions don't corrupt data" },
  { id: 8, name: "Data Integrity",     emoji: "🗄️",  desc: "DB state is consistent after operations" },
  { id: 9, name: "Cascade / Cleanup",  emoji: "🧹", desc: "Side effects and cleanup work correctly" },
  { id: 10, name: "Recovery / Reopen", emoji: "🔄", desc: "System recovers from interrupted or partial operations" },
];

// ── Result colours ────────────────────────────────────────────────────────────
const PASS  = "PASS";
const FAIL  = "FAIL";
const WARN  = "WARN";
const SKIP  = "SKIP";

// ── Runner ────────────────────────────────────────────────────────────────────
export async function runSuite(suiteFile) {
  const suite = (await import(suiteFile)).default;
  const { feature, goal, tests } = suite;

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  10-1-Go: ${feature}`);
  console.log(`  Goal:    ${goal}`);
  console.log(`${"═".repeat(60)}\n`);

  const results = [];
  const startTime = Date.now();

  for (const test of tests) {
    const cat = CATEGORIES.find(c => c.id === test.category) ?? { name: "Unknown", emoji: "?" };
    process.stdout.write(`  [${String(test.id).padStart(2, "0")}] ${cat.emoji} ${test.name.padEnd(42)} `);

    let result;
    try {
      result = await test.run();
    } catch (err) {
      result = { pass: false, detail: `Threw exception: ${err.message}` };
    }

    const status = result.skip ? SKIP : result.pass ? (result.warning ? WARN : PASS) : FAIL;
    const statusLabel = status === PASS ? "\x1b[32mPASS\x1b[0m" :
                        status === WARN ? "\x1b[33mWARN\x1b[0m" :
                        status === SKIP ? "\x1b[36mSKIP\x1b[0m" :
                                          "\x1b[31mFAIL\x1b[0m";
    console.log(statusLabel);
    if (result.detail) console.log(`       → ${result.detail}`);
    if (result.warning) console.log(`       ⚠ ${result.warning}`);

    results.push({
      id: test.id,
      name: test.name,
      category: cat.name,
      categoryId: test.category,
      status,
      detail: result.detail ?? null,
      warning: result.warning ?? null,
    });
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const passed  = results.filter(r => r.status === PASS || r.status === WARN).length;
  const failed  = results.filter(r => r.status === FAIL).length;
  const skipped = results.filter(r => r.status === SKIP).length;
  const total   = results.length;

  console.log(`\n${"─".repeat(60)}`);
  console.log(`  Results: ${passed}/${total} passed  |  ${failed} failed  |  ${skipped} skipped  |  ${elapsed}s`);
  const allGood = failed === 0;
  console.log(`  Verdict: ${allGood ? "\x1b[32m✅ 10-1-GO — CLEARED FOR LAUNCH\x1b[0m" : "\x1b[31m❌ NOT CLEARED — Fix failures before shipping\x1b[0m"}`);
  console.log(`${"─".repeat(60)}\n`);

  // Write JSON report
  const report = {
    feature,
    goal,
    runAt: new Date().toISOString(),
    elapsed: `${elapsed}s`,
    summary: { total, passed, failed, skipped, cleared: allGood },
    results,
  };

  const reportPath = join(__dirname, `../../test-reports/ten-one-go-${feature.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}.json`);
  try {
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`  Report saved: ${reportPath}\n`);
  } catch { /* non-fatal */ }

  return report;
}

// ── CLI entry point ───────────────────────────────────────────────────────────
const [,, suiteArg] = process.argv;
if (suiteArg) {
  const abs = suiteArg.startsWith("/") ? suiteArg : join(process.cwd(), suiteArg);
  runSuite(abs).then(r => process.exit(r.summary.cleared ? 0 : 1));
}
