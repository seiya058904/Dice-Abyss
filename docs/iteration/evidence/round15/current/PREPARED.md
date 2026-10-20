# Round 15 final QA preparation

Status: **PREPARED, NOT EXECUTED**. The integrator has reserved the CPU for browser performance. Do not start final CPU validation until an explicit GO arrives.

## Final validation runner

`run_final_validation.py` has passed Python AST parsing only. After GO:

```bash
python qa-r15/current/run_final_validation.py --go
```

Defaults: source `work/Dice-Abyss`, untouched baseline `baseline/Dice-Abyss`, output `qa-r15/current`, expected 70 test modules and 608 actual detailed cases, four independent module workers. The current file list has all 67 original modules and three additions: healing-settlement-record, inventory-search and salvage-batch. Planning counts are checked against native TAP output and never substituted for it.

The runner performs preservation verification, syntax checking, default npm tests, direct per-file native TAP, the existing 1,000 standard + 50 no-shopping simulation, complete source identity before/after, and every retained subprocess output's byte/hash verification. Every command has an exact exit code and separate stdout/stderr/receipt. Outputs are captured in memory and atomically written only after their subprocess exits. A pre-existing `validation-start.json` blocks accidental overwrite; a rerun must use a new `--out` directory.

Original preservation covers all 67 input test modules, both original fixtures, every font/license/notice file, and other runtime image/audio/font assets. Historical evidence images are outside this runtime-asset gate. `FINAL_VALIDATION.json` is the final result; `OUTPUT_MANIFEST.json` excludes itself. HTTP, browser interaction, natural-policy journeys and product performance are separate gates.

## Defeat / preparation / search browser script

New product QA script: `work/Dice-Abyss/scripts/qa-defeat-preparation-round15.mjs`. It is derived from the retained, unchanged round14 script and has passed `node --check` only. The root agent will run it after performance work:

```bash
node scripts/qa-defeat-preparation-round15.mjs \
  --source /absolute/current/Dice-Abyss \
  --baseline /absolute/baseline/Dice-Abyss \
  --url http://127.0.0.1:CURRENT_PORT/ \
  --baseline-url http://127.0.0.1:BASELINE_PORT/ \
  --output /absolute/fresh-defeat-preparation-evidence
```

Use the integrator's existing `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH`; no dependencies are installed. Current routing is recorded accurately: Browser connection approval session UNAVAILABLE, CUA localhost rejected, independent Playwright explicitly authorized. The script does not retry those blocked paths.

Baseline assertions now recognize that V5.14.0 already contains the complete defeat review. Each current navigation pass sets a conflicting committed query and independent draft through real input/Enter controls, checks ordinary navigation preserves them, and checks both dedicated defeat entries clear names/drafts/rarity. It preserves the original 29-manual-roll rescue and complete-state helpers byte-for-byte, six viewports, both scale-1.1 viewports, and both synthetic boundary groups. Source identity adds inventory-query.js, inventory-search.css and deep-rules.js. Details: `defeat-script-preparation.json`.

## Documentation update observations

- Package, HTML release, release.js and README already identify 5.15.0. README correctly explains submit-once search, clear-name versus clear-all, full-backpack recycling, truthful healing records and retained schema5.
- STATE, LATEST_REPORT, VERIFY and NEXT_ROUND still describe round14 at this preparation checkpoint. Keep their existing contents under `archives/round14-*` before replacing the current authority pages. This is pending integration work, not a newly observed runtime defect.
- Round15 baseline receipts must use the freshly verified 67 modules / 588 actual cases / 1,000+50 results. Current results remain planned until this runner completes. Preserve the flat-run empty-output limitation and per-file native TAP accounting where it helps the next agent reproduce counts.
- Describe the healing change as correction of newly committed combat records after death. Numeric healing and recovery timing remain unchanged; the change does not establish a new revival ability or repair a natural-policy defeat.
- Refresh the 224-case healing differential against the final engine, or retain its explicit earlier-source identity boundary. Final engine identity differed from the earlier differential when independently reviewed.
- Use the root's actual matched performance results and retain previous unattributed adverse observations. A faster batch lookup is not proof of higher FPS or resolution of synchronous full-save / physical-GPU limitations.
- Record final ZIP size, hash and clean-extraction receipts from the actual artifact. Keep the file manifest non-self-referential and preserve the complete next-round source, tests, runtime assets and replay scripts.
