# Round25 final source preservation snapshot

**PASS**, independently measured at **2026-10-20 05:51:06–05:51:08 UTC**. This audit read every member of the sole uploaded ZIP to EOF (CRC plus SHA-256), hashed every baseline/current file, checked all 3,720 nonself input manifest rows, and matched the complete deletion set against the screenshot ledger. No runtime, test or project script was changed. No browser, test suite, simulation, extraction or ZIP compression ran in this audit.

Input ZIP: `Dice-Abyss-v5.24.0-cloud-round-24(1).zip`, 42,305,823 B, SHA-256 `90784df189c75d0513b6192f2a6ada4c6f1fb199a52d96143112f5a415efd611`.

- Baseline: **3,721 files / 99,941,262 B**, all ZIP/member/manifest sizes and SHA values match. Zero missing, extra or modified files; zero extra directories. No cache/compiled/nested-archive/nonregular files. Both source snapshots stayed stable during the read.
- Work: **3,655 files / 91,761,610 B** at this snapshot: 3,609 input files unchanged, 34 added, 12 modified, 100 deleted. Net expanded change **−8,179,652 B**. No forbidden dependency/cache/compiled/nested-archive files or symlinks.
- All **100 deletions** are historical screenshots whose paths, original sizes and SHA values exactly match `omitted-historical-screenshots.json`; **8,646,283 B** removed. No unlisted deletion, runtime image downgrade or old structured-evidence change was found.

## Protected input byte counts

| Protected set | Files | Original bytes | Identical |
| --- | ---: | ---: | ---: |
| All old tests and fixtures | 97 | 2,187,750 | 97 |
| Old native test modules (subset above) | 95 | 763,702 | 95 |
| All old scripts | 147 | 2,089,085 | 147 |
| Rule/storage/content/RNG modules | 11 | 177,145 | 11 |
| All CSS | 22 | 319,299 | 22 |
| Runtime assets, fonts and licenses | 11 | 8,853,679 | 11 |
| Other old source JS, excluding four reviewed presentation/release modifications | 33 | 346,428 | 33 |

The two game RNG implementations are inside byte-identical `src/engine.js` and `src/equipment.js`. The JSON lists every path in the explicit rule and asset protection sets.

## Complete delta boundary

Modified original paths: `README.md`, `docs/iteration/ART.md`, `docs/iteration/DEEP_DECISIONS.md`, `docs/iteration/GAMEPLAY_REVIEW.md`, `docs/iteration/RESEARCH.md`, `index.html`, `output/playwright/README.md`, `package.json`, `src/app.js`, `src/effects.js`, `src/release.js`, `src/views.js`.

Runtime scope (all src plus HTML/package/favicon and launchers, excluding README and audit scripts): **75 → 76 files**, **9,715,802 → 9,718,825 B**, net **+3,023 B**. Six original runtime files change; `src/inventory-page.js` is the sole new runtime file; none is deleted. App SHA remains `7c463a2d27ba8a03ebdcef166c3f5988e85febc14173b006b8e84ce893faa7ad`.

New tests: `inventory-page-selection` **7**, `particle-style-round25` **6**, `presentation-announcement-round25` **13** = **3 modules / 26 cases**, plus one fixture. Counts come from the actual final native report (98 modules / 902 cases, zero fail/cancel/skip/todo), whose per-module source hashes all match this working tree. They were not inferred from test declarations or rerun here.

New project scripts (**6**): `audit-inventory-page-round25.mjs`, `audit-particle-style-round25.mjs`, `qa-context-restore-round25.mjs`, `qa-inventory-phases-round25.mjs`, `qa-resize-settlement-round25.mjs`, `restore-runtime-baseline-round25.py`. Every prior script remains byte-identical.

Disjoint byte deltas: runtime **+3,023 B**; tests/fixture **+31,507 B**; new audit/development scripts **+55,489 B**; documentation/evidence **+376,612 B**; historical screenshot omission **−8,646,283 B**; other project metadata **0 B**. The JSON contains all 34 added, 12 modified and 100 deleted path records, with sizes and hashes.

Evidence: `qa-round25/source-preservation-final.json` (39,534 B). Reproducer: `python qa-round25/audit-source-preservation-final.py` from the workspace root; it only rewrites that external report. This is the final runtime snapshot before formal timing, not a final ZIP-size/re-extraction gate. Root will still finalize documentation, copied evidence, the output manifest and the deliverable archive; those later documentation/package additions do not retroactively belong to this measured snapshot.
