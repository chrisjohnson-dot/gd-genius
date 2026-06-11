# GD Genius — Sentinel Test Framework

Sentinel is GD Genius's custom testing system. It tests every layer of the system against the live database — business logic, data integrity, security, performance, and real-world workflows.

## How It Works

Unlike the 10-1-Go framework (which is adversarial/edge-case focused), Sentinel is **feature-complete** — it tests every function a feature is supposed to perform, then flags anything that fails as either a warning, failure, or blocker.

### Result Levels

| Level | Meaning |
|---|---|
| ✅ **PASS** | Function works correctly |
| ⚠️ **WARN** | Works but has a concern worth reviewing |
| ❌ **FAIL** | Function is broken — fix before deploying |
| 🚨 **BLOCKER** | Critical failure — deployment must be stopped |

### Test Categories

| Code | Category | What it tests |
|---|---|---|
| `DB` | DB Integrity | Data stored correctly, relationships valid |
| `BL` | Business Logic | Core rules and calculations |
| `SEC` | Security | Access control, data isolation |
| `EDGE` | Edge Cases | Boundary conditions, unusual inputs |
| `WF` | Workflow | End-to-end user journeys |
| `PERF` | Performance | Response times, data volume |
| `REG` | Regression | Previously fixed bugs stay fixed |
| `INT` | Integration | Extensiv API and external services |

## Running Tests

```bash
# Run a specific suite
node tests/sentinel/sentinel.mjs tests/sentinel/suites/qc-scanner.mjs

# Run a suite by feature name
node tests/sentinel/sentinel.mjs --feature qc-scanner

# Run all suites
node tests/sentinel/sentinel.mjs --all
```

## Adding a New Suite

When you implement a new feature, create a suite file in `tests/sentinel/suites/`:

```js
// tests/sentinel/suites/my-feature.mjs
import { getDb, PASS, FAIL, WARN, BLOCKER, CATEGORIES } from '../sentinel.mjs';

export default {
  name: "My Feature",
  description: "What this feature does",
  tests: [
    {
      id: 1,
      name: "Core function works correctly",
      category: CATEGORIES.BUSINESS_LOGIC.id,
      async run() {
        const db = await getDb();
        try {
          // Test your feature
          const result = true; // your assertion
          return {
            result: result ? PASS : FAIL,
            detail: "What happened",
            fix: "How to fix it if it fails",
          };
        } finally {
          await db.end();
        }
      }
    },
  ],
};
```

## Existing Suites

| Suite | Tests | What it covers |
|---|---|---|
| `qc-scanner` | 15 | Session lifecycle, scanning modes, pallets, weight, completion |
| `carrier-pickup` | 5 | Session lifecycle, photo capture, batch mode, isolation |

## Reports

Test reports are saved to `sentinel-reports/` as JSON files with full details of every test result, timing, and fix suggestions.
