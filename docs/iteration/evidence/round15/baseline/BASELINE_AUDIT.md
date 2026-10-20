# Round 15 input audit

## Identity and execution safety

The authoritative input is `Dice-Abyss-v5.14.0-cloud-round-14(1).zip`, 23,854,506 bytes, SHA-256 `42cc563080951446f6f5ed122e7acea253411a20269db26ec3c9486c8572ec04` (ZIP container safety and CRC were checked by the integrator before this independent audit).

The read-only extraction has 1,449 files and 56,019,321 bytes. Every one of the 1,448 entries in `docs/iteration/FILE_MANIFEST.json` matches its actual bytes and SHA-256. The manifest correctly excludes itself; there are no missing files, additional files, duplicate manifest entries or writable files. Version 5.14.0 agrees with the relay record for round 14. See `manifest-check.json`.

Before execution, the reviewer inspected `package.json`, `scripts/check.mjs`, `scripts/simulate.mjs`, the launcher imported by release tests, and side-effect-bearing imports of the test graph. The package has no dependencies or install lifecycle scripts. Syntax checking only runs Node's parser; simulation is an offline in-memory engine policy. The imported command-line audits guard their executable entry points. No process launched by this audit sends external requests, changes baseline files or removes files. Tests and simulations run directly from the read-only baseline, with output files outside it.

## Evidence growth and bounded packaging recommendations

The input contains 41,656,051 expanded bytes under `docs/` across 1,194 files. JSON accounts for 29,292,571 bytes in 825 files, and 93 WebP images account for 6,600,614 bytes. Latest round-14 evidence uses 5,726,051 bytes; round 13 uses 5,653,778 and round 12 uses 4,485,241. Details are in `docs-footprint-audit.json`.

Exact duplicate payloads account for 883,277 expanded bytes but only 72,870 compressed payload bytes in the uploaded ZIP. The largest repeated content is the old performance inventory-card HTML (five identical files), game-view HTML (three identical files), and the same 9,409-byte standard simulation output stored twenty times. These are evidence records, not a meaningful runtime-size opportunity. Historical performance reports and scripts still refer to exact filenames; deleting an identical record without a locator or verified restoration mechanism would harm replayability.

Recommended scope for round 15:

1. Keep all runtime code, the 67 original test modules and two fixtures, the 98 original scripts, and all eight font/license/notice files. The font payload is 8,680,958 bytes and is already almost incompressible; it is not a cleanup candidate.
2. Retain archived state, reports and manifests. They document chain identity and previous known limitations. A historical manifest is a historical snapshot, not the current package index.
3. Avoid copying complete earlier evidence collections into a new round directory. Record new baseline hashes and point to the retained original evidence when it is not freshly executed.
4. For new bulky comparable JSON/HTML evidence, use a single content-addressed compressed object plus the original filename/byte/hash manifest only if it is warranted by size. Verify exact reconstruction before removing generated duplicate copies. Retain negative and failed observations as well as successful ones.
5. Preserve known natural seed 23757 and round-14 performance negative observations. They remain useful regression and hypothesis evidence. A new round must not claim their failures were corrected without new results.
6. Do not broaden this iteration into a historical evidence migration merely to save approximately 0.073 MB of compressed duplicate data. The uploaded complete ZIP is 23.855 MB and already has ample headroom below the 50 MB ceiling. Budget new selected screenshots and essential evidence; reassess only if the proposed additions create a concrete size risk.

No input evidence has been removed or rewritten. ZIP compressed-category accounting is in `input-budget.json`; execution receipts and actual test/simulation outcomes are separate JSON and stdout files in this directory.

## Fresh execution results

Environment: Node v24.19.0, npm 11.9.0. All execution was offline from the read-only baseline.

| Gate | Actual result | Execution wall time |
| --- | --- | ---: |
| `npm run check` | Passed all source/script syntax checks | 3.381 s |
| `npm test` | 67/67 module wrappers, no fail/skip/cancel | 71.812 s |
| Per-module native TAP | 67/67 unchanged modules, **588/588 actual cases**, no fail/skip/cancel/todo | 77.568 s at 4 concurrent module processes, plus 0.422 s targeted evidence repair |
| `npm run simulate -- 1000` | 1,000/1,000 standard journeys and 50/50 existing no-shopping journeys, zero deaths | 195.504 s |
| Post-execution integrity | All 1,448 baseline entries unchanged and all files still read-only; all 67 retained TAP hashes match | Passed |

The simulation's 9,409-byte JSON (without the npm command banner) is SHA-256 `266fa5b56516410712395796f197a2e33ad1b1e16ede45de14b872f208007d77`, byte-identical to the earlier deterministic standard summary. It does not replace the separate 200/400-floor natural-policy investigation.

The previous all-files flat `node --test --test-isolation=none --test-reporter=tap` recipe exited 0 after 118.063 seconds but yielded empty stdout/stderr in this environment. It was not used to assert a case count. Each unchanged test file was therefore executed directly with `node --test-reporter=tap tests/<file>.test.mjs`; native TAP totals were parsed and retained. Two retained TAP files initially differed from the hashes observed at subprocess completion; only those two modules were rerun with in-memory output capture and complete-after-exit file writes. Both passed (11 and 12 cases), and every final TAP hash was reverified. The original and repaired execution receipts remain available. Test/simulation durations can overlap CPU workloads and are not product performance comparisons.

HTTP, browser interaction, fonts, natural-policy progression, visual and performance gates are owned by the other integration tasks; this baseline audit makes no claims about those gates. No CPU-intensive work from this audit remained active after 2026-10-19 00:57:43 UTC.
