# 10-1-Go Test Framework

**10 adversarial tests. 1 goal. Go with confidence.**

Every new feature in GD Genius must pass 10-1-Go before it ships. The framework probes 10 categories of failure that real warehouse software encounters — not just "does it work", but "what happens when it doesn't."

---

## The 10 Categories

| # | Category | Emoji | What It Tests |
|---|---|---|---|
| 1 | Happy Path | ✅ | Core workflow works as designed |
| 2 | Empty / Zero Input | 🕳️ | Handles missing or empty data gracefully |
| 3 | Boundary Values | 📏 | Edge cases at min/max limits |
| 4 | Duplicate / Replay | 🔁 | Same action twice doesn't corrupt state |
| 5 | Bad Input | 💣 | Invalid or malformed data is rejected cleanly |
| 6 | Permission / Auth | 🔒 | Unauthorized access is blocked |
| 7 | Concurrency / Race | ⚡ | Simultaneous actions don't corrupt data |
| 8 | Data Integrity | 🗄️ | DB state is consistent after operations |
| 9 | Cascade / Cleanup | 🧹 | Side effects and cleanup work correctly |
| 10 | Recovery / Reopen | 🔄 | System recovers from interrupted operations |

---

## Running Tests

```bash
# Run a specific feature test
node tests/ten-one-go/runner.mjs tests/ten-one-go/features/batch-carrier-pickup.mjs

# Exit code 0 = cleared, 1 = failures found
```

## Verdicts

- **✅ 10-1-GO — CLEARED FOR LAUNCH** — All 10 tests passed (warnings are acceptable)
- **❌ NOT CLEARED** — One or more tests failed; fix before shipping

## Writing a New Test Suite

Create a file in `tests/ten-one-go/features/your-feature.mjs`:

```js
import { getDb } from '../runner.mjs';

export default {
  feature: "Your Feature Name",
  goal: "One sentence describing what must be true",
  tests: [
    {
      id: 1, name: "Happy path description", category: 1,
      async run() {
        // ... test logic ...
        return { pass: true, detail: "What happened" };
      }
    },
    // ... 9 more tests, one per category ...
  ],
};
```

Each `run()` returns:
- `{ pass: true, detail: "..." }` — test passed
- `{ pass: false, detail: "..." }` — test failed
- `{ pass: true, warning: "...", detail: "..." }` — passed with a caution (shows as WARN)
- `{ skip: true, detail: "..." }` — test skipped (not applicable)

## Test Reports

JSON reports are saved to `test-reports/` after each run. File name format:
`ten-one-go-{feature-name}-{timestamp}.json`

---

## Feature Coverage

| Feature | Status | Last Run |
|---|---|---|
| Batch Carrier Pickup | ✅ 10/10 CLEARED | 2026-06-09 |
