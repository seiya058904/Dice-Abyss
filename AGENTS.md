# Dice Abyss — Project Guide

## Runtime & Storage
- Zero-dependency native ESM browser RPG (Node 20+ local, CI Node 22; no build/install step; do not add frameworks or deps without authorization).
- `npm start` serves `http://127.0.0.1:4188/`; `node scripts/launch.mjs --check` checks startup/release identity headless. Different `PORT` or Pages URL has isolated browser storage — never assume shared progress.

## Gameplay & Save Invariants
- Preserve manual rolls, 6-room routes, 5 equipment slots, 8 rarities, single gold balance, and defeat retention unless design change is requested.
- **Version separation**: product release identity (`package.json`, `src/release.js`, `dice-abyss-release` meta) is separate from save schema `VERSION` (`5` in `src/engine.js`) — never bump `VERSION` just for a product release.
- Preserve `dice-abyss:save:v1`, `dice-abyss:mirror:v1`, legacy keys, extra fields, and immutable pre-migration originals; never silently trim or reset a save.
- Revalidate complete expected snapshot & authoritative IDs/quotes before committing (Web Locks cross-tab; note browsers without Web Locks lack atomic cross-tab CAS). Commit primary save before reporting success; failed mirror keeps durable primary with warning (never claim rolled back).
- Keep equipment level, XP, and enhancement distinct; rendering/previews never consume RNG or alter history; inventory selection reuse never escapes current state/page into transactions; animations only reveal already-saved results and release resources on skip/hidden/resize/context-loss.

## Verification & Evidence Boundaries
- Gates: `npm run check && npm test && npm run simulate -- 1000`. Particle-program regression requires exact SHA-256-verified command/primitive equality — never update hashes blindly or add tolerance.
- Browser QA uses externally installed Playwright/Chromium via `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH` (never add as deps) with an external `--output` dir: `scripts/qa-core-browser.mjs` and `scripts/qa-decision-gains.mjs --url=<isolated-origin> --output=<external-dir>` (both native and Web-Locks-absent modes). Use fresh contexts and synthetic saves only — never touch a user's real browser profile/save.
- Separate unit/HTTP, browser, human playtest, and physical-GPU 4K/60 FPS evidence. Preserve tracked historical `.log` evidence bytes; never claim old `docs/iteration/STATE.json` PASS records as new runs. Any active instruction to withhold a push stays binding until lifted.
