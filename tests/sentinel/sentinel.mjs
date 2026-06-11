/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                    GD GENIUS — SENTINEL TEST FRAMEWORK                  ║
 * ║                                                                          ║
 * ║  A custom testing system built specifically for GD Genius.              ║
 * ║  Sentinel tests every layer of the system: database integrity,          ║
 * ║  business logic, security, performance, and real-world workflows.       ║
 * ║                                                                          ║
 * ║  Usage:                                                                  ║
 * ║    node tests/sentinel/sentinel.mjs [suite]                             ║
 * ║    node tests/sentinel/sentinel.mjs --all                               ║
 * ║    node tests/sentinel/sentinel.mjs --feature qc-scanner                ║
 * ║                                                                          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

import { createConnection } from 'mysql2/promise';
import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── DB Connection ─────────────────────────────────────────────────────────────
const DB_URL = 'mysql://4NCq8mAsshAuKGA.2865343ca485:9X0dm2uiL1goZL2EASv7@gateway04.us-east-1.prod.aws.tidbcloud.com:4000/K5ogkLhSXtccCnqH4Vm3fs?ssl={"rejectUnauthorized":true}';

export async function getDb() {
  return createConnection(DB_URL);
}

// ── Test Result Types ─────────────────────────────────────────────────────────
export const PASS    = 'PASS';
export const FAIL    = 'FAIL';
export const WARN    = 'WARN';
export const SKIP    = 'SKIP';
export const BLOCKER = 'BLOCKER'; // Critical failure that blocks deployment

// ── Test Categories ───────────────────────────────────────────────────────────
export const CATEGORIES = {
  DB_INTEGRITY:    { id: 'DB',   label: '🗄️  DB Integrity',    desc: 'Data is stored correctly and relationships are valid' },
  BUSINESS_LOGIC:  { id: 'BL',   label: '⚙️  Business Logic',  desc: 'Core rules and calculations work correctly' },
  SECURITY:        { id: 'SEC',  label: '🔒 Security',         desc: 'Access control and data protection' },
  EDGE_CASES:      { id: 'EDGE', label: '⚡ Edge Cases',       desc: 'Boundary conditions and unusual inputs' },
  WORKFLOW:        { id: 'WF',   label: '🔄 Workflow',         desc: 'End-to-end user journeys' },
  PERFORMANCE:     { id: 'PERF', label: '🚀 Performance',      desc: 'Response times and data volume handling' },
  REGRESSION:      { id: 'REG',  label: '🔁 Regression',       desc: 'Previously fixed bugs stay fixed' },
  INTEGRATION:     { id: 'INT',  label: '🔗 Integration',      desc: 'Extensiv API and external service calls' },
};

// ── ANSI Colors ───────────────────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  blue:   '\x1b[34m',
  cyan:   '\x1b[36m',
  white:  '\x1b[37m',
  bgRed:  '\x1b[41m',
  bgGreen:'\x1b[42m',
};

function colorResult(result) {
  switch (result) {
    case PASS:    return `${C.green}${C.bold}PASS${C.reset}`;
    case FAIL:    return `${C.red}${C.bold}FAIL${C.reset}`;
    case BLOCKER: return `${C.bgRed}${C.bold} BLOCKER ${C.reset}`;
    case WARN:    return `${C.yellow}${C.bold}WARN${C.reset}`;
    case SKIP:    return `${C.dim}SKIP${C.reset}`;
    default:      return result;
  }
}

// ── Suite Runner ──────────────────────────────────────────────────────────────
export async function runSuite(suite) {
  const results = [];
  const start = Date.now();

  console.log(`\n${C.bold}${C.cyan}╔${'═'.repeat(62)}╗${C.reset}`);
  console.log(`${C.bold}${C.cyan}║  SENTINEL: ${suite.name.padEnd(50)}║${C.reset}`);
  console.log(`${C.bold}${C.cyan}╚${'═'.repeat(62)}╝${C.reset}`);
  if (suite.description) {
    console.log(`${C.dim}  ${suite.description}${C.reset}`);
  }
  console.log();

  for (const test of suite.tests) {
    const testStart = Date.now();
    let result = FAIL;
    let detail = '';
    let warning = '';
    let fix = '';

    try {
      const outcome = await test.run();
      result = outcome.result ?? (outcome.pass ? PASS : FAIL);
      detail = outcome.detail ?? '';
      warning = outcome.warning ?? '';
      fix = outcome.fix ?? '';
    } catch (err) {
      result = FAIL;
      detail = `Exception: ${err.message}`;
      fix = 'Check the test implementation and DB connection';
    }

    const elapsed = Date.now() - testStart;
    const cat = Object.values(CATEGORIES).find(c => c.id === test.category) ?? { label: test.category };

    results.push({ id: test.id, name: test.name, category: test.category, result, detail, warning, fix, elapsed });

    const icon = result === PASS ? '✅' : result === WARN ? '⚠️ ' : result === SKIP ? '⏭️ ' : result === BLOCKER ? '🚨' : '❌';
    console.log(`  ${icon} ${C.bold}[${String(test.id).padStart(2, '0')}]${C.reset} ${test.name}`);
    console.log(`      ${C.dim}${cat.label}${C.reset}  ${colorResult(result)}  ${C.dim}${elapsed}ms${C.reset}`);
    if (detail) console.log(`      ${C.dim}→ ${detail}${C.reset}`);
    if (warning) console.log(`      ${C.yellow}⚠ ${warning}${C.reset}`);
    if (fix && (result === FAIL || result === BLOCKER)) console.log(`      ${C.red}🔧 Fix: ${fix}${C.reset}`);
  }

  const elapsed = Date.now() - start;
  const passed   = results.filter(r => r.result === PASS).length;
  const failed   = results.filter(r => r.result === FAIL).length;
  const blockers = results.filter(r => r.result === BLOCKER).length;
  const warned   = results.filter(r => r.result === WARN).length;
  const skipped  = results.filter(r => r.result === SKIP).length;
  const total    = results.length;

  console.log(`\n  ${C.dim}${'─'.repeat(62)}${C.reset}`);
  console.log(`  ${C.bold}Results:${C.reset} ${C.green}${passed} passed${C.reset}  |  ${C.red}${failed} failed${C.reset}  |  ${blockers > 0 ? `${C.bgRed}${C.bold} ${blockers} BLOCKERS ${C.reset}  |  ` : ''}${C.yellow}${warned} warnings${C.reset}  |  ${C.dim}${skipped} skipped${C.reset}  |  ${C.dim}${elapsed}ms${C.reset}`);

  let verdict, verdictColor;
  if (blockers > 0) {
    verdict = '🚨 BLOCKED — Critical failures must be fixed before deployment';
    verdictColor = C.bgRed + C.bold;
  } else if (failed > 0) {
    verdict = '❌ NOT CLEARED — Fix failures before deploying';
    verdictColor = C.red + C.bold;
  } else if (warned > 0) {
    verdict = '⚠️  CLEARED WITH WARNINGS — Review warnings before deploying';
    verdictColor = C.yellow + C.bold;
  } else {
    verdict = '✅ SENTINEL CLEARED — Safe to deploy';
    verdictColor = C.green + C.bold;
  }
  console.log(`  ${verdictColor}${verdict}${C.reset}\n`);

  // Save report
  const reportDir = path.join(__dirname, '../../sentinel-reports');
  if (!existsSync(reportDir)) await mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `sentinel-${suite.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.json`);
  await writeFile(reportPath, JSON.stringify({
    suite: suite.name,
    description: suite.description,
    timestamp: new Date().toISOString(),
    elapsed,
    summary: { total, passed, failed, blockers, warned, skipped },
    verdict,
    results,
  }, null, 2));
  console.log(`  ${C.dim}Report: ${reportPath}${C.reset}\n`);

  return { passed, failed, blockers, warned, skipped, total, verdict };
}

// ── Multi-Suite Runner ────────────────────────────────────────────────────────
export async function runAll(suiteFiles) {
  const allResults = [];
  for (const file of suiteFiles) {
    const mod = await import(file);
    const suite = mod.default;
    const result = await runSuite(suite);
    allResults.push({ suite: suite.name, ...result });
  }

  console.log(`\n${C.bold}${C.cyan}╔${'═'.repeat(62)}╗${C.reset}`);
  console.log(`${C.bold}${C.cyan}║  SENTINEL SUMMARY${''.padEnd(44)}║${C.reset}`);
  console.log(`${C.bold}${C.cyan}╚${'═'.repeat(62)}╝${C.reset}`);
  for (const r of allResults) {
    const icon = r.blockers > 0 ? '🚨' : r.failed > 0 ? '❌' : r.warned > 0 ? '⚠️ ' : '✅';
    console.log(`  ${icon} ${r.suite.padEnd(40)} ${C.green}${r.passed}✓${C.reset} ${C.red}${r.failed}✗${C.reset} ${r.blockers > 0 ? `${C.bgRed}${r.blockers}!${C.reset}` : ''}`);
  }
  const totalBlockers = allResults.reduce((s, r) => s + r.blockers, 0);
  const totalFailed = allResults.reduce((s, r) => s + r.failed, 0);
  console.log(`\n  ${totalBlockers > 0 ? `${C.bgRed}${C.bold} DEPLOYMENT BLOCKED — ${totalBlockers} critical failure(s) ${C.reset}` : totalFailed > 0 ? `${C.red}${C.bold}NOT CLEARED — ${totalFailed} failure(s) across suites${C.reset}` : `${C.green}${C.bold}ALL SUITES CLEARED ✅${C.reset}`}\n`);
}

// ── CLI Entry Point ───────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Usage: node sentinel.mjs <suite-file>  OR  --all  OR  --feature <name>');
    process.exit(0);
  }
  const suitesDir = path.join(__dirname, 'suites');
  if (args[0] === '--all') {
    const files = (await readdir(suitesDir)).filter(f => f.endsWith('.mjs')).map(f => path.join(suitesDir, f));
    await runAll(files);
  } else if (args[0] === '--feature' && args[1]) {
    const file = path.join(suitesDir, `${args[1]}.mjs`);
    if (!existsSync(file)) { console.error(`Suite not found: ${file}`); process.exit(1); }
    const mod = await import(file);
    const result = await runSuite(mod.default);
    process.exit(result.failed + result.blockers > 0 ? 1 : 0);
  } else {
    const file = path.resolve(args[0]);
    if (!existsSync(file)) { console.error(`Suite not found: ${file}`); process.exit(1); }
    const mod = await import(file);
    const result = await runSuite(mod.default);
    process.exit(result.failed + result.blockers > 0 ? 1 : 0);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
