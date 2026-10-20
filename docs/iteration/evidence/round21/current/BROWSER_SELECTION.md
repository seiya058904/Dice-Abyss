# Round21 inherited browser coverage selection

Prepared by source inspection only. These commands have not been executed by this agent in Round21. Run from the current project root, using the parent-selected current/baseline loopback URLs and installed Playwright/Chromium. Every output directory must be new. `PLAYWRIGHT_MODULE` is a require-compatible package directory for most suites; the lifecycle suite instead requires its actual ESM file path.

## Primary set

| Script / selection | Distinct coverage | Important limit |
| --- | --- | --- |
| `qa-core-browser.mjs` — all 6 cases | New game, manual fate/roll, pending chest, equip/reload, inventory scroll/lock, settings, primary save failure, mirror warning, stale cross-tab confirmation | Mostly reduced-motion / low-effects functional checks; no FPS claim |
| `qa-interactions.mjs` — selected 6 cases below | Busy rapid click/Space handling, forge enhancement vs level/XP, talent spending, settings persistence, protected three-target relic fusion cancel/commit/reload, merchant buy/heal, paid prayer/gamble, next-combat luck, native V4 import/export/archive | Explicit synthetic fixtures plus native input; no human deep play claim |
| `qa-pages.mjs` — two selected cases | All eight pending rarities are actually opened at legal gate floors, exact issued item and RNG, correct rarity UI, reload does not grant twice; codex gate/source probabilities | Uses low-effects. Full effects need the scheduled renderer/performance run |
| `qa-iteration.mjs` — WebGL case only | Three `WEBGL_lose_context` cycles, CSS fallback, restoration on same single canvas, unchanged save, one exact post-recovery roll | Use a label other than `baseline`; that legacy label asserts intentionally old broken behavior |
| `qa-environment.mjs` — all 3 cases | Back/continue, OS reduced-motion emulation with full in-game effects, offline operation after resources load, online local reload | Does not claim an offline HTTP cold reload or physical OS suspension |

Use each already-passed case once on the final relevant source. Do not repeat full suites because they share familiar names. Current-specific new transaction/panel checks remain the parent-owned focused suite.

```bash
node scripts/qa-core-browser.mjs --url="$DA21_CURRENT_URL" --output="$DA21_QA_ROOT/core"

node scripts/qa-interactions.mjs --source=. --url="$DA21_CURRENT_URL" --output="$DA21_QA_ROOT/interactions" --label=round21 --cases=rapid-click-space-refresh,forge-talents-inventory-settings,fusion-protected-three-relics,merchant-and-paid-events,next-luck-cross-room,v4-import-export-archive

node scripts/qa-pages.mjs --source=. --url="$DA21_CURRENT_URL" --output="$DA21_QA_ROOT/rarities-codex" --label=round21 --cases=eight-rarity-chest-reward,codex-gates-30-50-80-140

node scripts/qa-iteration.mjs --source=. --url="$DA21_CURRENT_URL" --output="$DA21_QA_ROOT/webgl-context" --label=round21 --cases=static-webgl-loss-and-restoration

node scripts/qa-environment.mjs --source=. --url="$DA21_CURRENT_URL" --output="$DA21_QA_ROOT/environment" --label=round21
```

The scripts above support `--key=value`. Some older scripts only parse that form, so do not replace all flags with whitespace-separated arguments mechanically.

## Conditional supplements

- If the new storage guard touches paid-action confirmation, `qa-event-risk-round20.mjs --case=quota-failure-and-cross-tab-review` exercises the paid risk confirmation specifically. `--case=all-outcomes-confirm-refresh-open-once` adds exhaustive existing gambler/wish outcomes and exactly-once pending rewards. The whole four-case suite is useful only if risk-table/quote DOM or responsive CSS changed.
- If app transaction timing or renderer lifecycle changed, `qa-renderer-lifecycle.mjs` is the focused timing-fault suite: 8 current cases plus 3 matching baseline cases. It verifies held/late/missing RAF, actual positive-alpha submissions, commit-before-presentation, one main+mirror write, deadline cancellation, skip, simulated hidden state, low effects and reduced motion. Its claims are lifecycle correctness, not FPS. Invoke the current-tree script so direct E/S imports use current rules; provide both actual URLs and an ESM Playwright entry.
- `qa-talents-browser.mjs` adds quantity/max allocation, unlock/cap/dead boundaries, scroll/keyboard retention and save/cross-tab failures. The selected interactions set only samples one-point allocation. Add this suite if talent controls changed or if no existing native/core tests cover the specific change.
- `qa-event-equipment-round18.mjs` is valuable for material selection, protected inputs, cancellation/commit/reload and failed/stale import readers if those paths changed. It is unnecessary duplication for a presentation-only encounter panel change.

## Rendering backend and eight-tier effects

The already-planned `qa-performance-round12.mjs` obtains `WEBGL_debug_renderer_info` and records actual unmasked vendor/renderer, browser version, DPR, fonts and Web Locks. Its full `frames` / `all` protocol covers boss burst, eternal reward and the other seven rarity openings in full/low modes, with declared viewport matrices and exact persisted results. Reuse those backend records; launch flags alone do not prove the actual renderer.

`qa-browser.mjs` is a broad older performance/visual sweep of normal roll, boss burst/finish, legendary and eternal at several viewports. Running it again after the formal inherited protocol would repeat much of the same work and still would not replace the eight-rarity functional assertions above.

## Output interpretation

Core/risk/talent suites report numeric checks. Interactions/pages/iteration report their own recorded checkpoints. Those are different counting units and should stay separate in the final report. Assert that requested case lists were nonempty and that the resulting report contains exactly the selected names; several older selector helpers do not reject unknown names automatically.
