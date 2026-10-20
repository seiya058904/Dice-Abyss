# Dice Abyss — Project Guide

Applies to this repository. Follow the user's current instructions and applicable parent instructions as well.

## Project and entry points

- Desktop-first, single-player browser RPG built with native JavaScript modules, HTML and CSS. Node.js 20+ runs the development tools; GitHub Actions currently uses Node 22.
- There are no npm runtime dependencies, package-install step or application build step. Do not introduce a framework or update dependencies without explicit authorization.
- Start with `npm start`, then open `http://127.0.0.1:4188/`. On Windows, `启动游戏.cmd` calls `scripts/launch.mjs`; `node scripts/launch.mjs --check` checks startup and release identity without opening a browser.
- `PORT` selects a different loopback port. A different port or the published Pages URL has different browser storage; never assume progress moves between them.
- See README for the current release, dated acceptance, public URL and known limitations.

## Code ownership

| Area | Files |
| --- | --- |
| State transitions, combat, RNG and progression | `src/engine.js` |
| Content, rarities and encounter rules | `src/content.js`, `src/deep-content.js`, `src/deep-rules.js`, `src/encounters.js`, `src/rarity.js`, `src/route-weights.js` |
| Equipment, forging and authoritative fusion quotes | `src/equipment.js`, `src/equipment-content.js` |
| Save validation, migration, capacity and durable writes | `src/storage.js` |
| Interaction orchestration and screen templates | `src/app.js`, `src/views.js` |
| Fusion selection and presentation | `src/fusion-controller.js`, `src/fusion-workbench.js`, `src/fusion-view.js`, `src/fusion-dom.js` |
| Inventory selection and DOM reuse | `src/inventory-query.js`, `src/inventory-page.js`, `src/inventory-render.js`, `src/inventory-dom.js` |
| Dice, effects and presentation lifecycle | `src/dice-renderer.js`, `src/dice-motion.js`, `src/effects.js`, `src/visual-timeline.js` |
| Serving and deployment | `scripts/serve.mjs`, `scripts/launch.mjs`, `.github/workflows/pages.yml` |

For structural investigation, use the installed `codebase-memory` skill when available and verify coverage for relied-on paths. Read the actual source for stale or incomplete coverage, or if the graph service is unavailable. Historical reports and graph results do not replace current source evidence.

## Gameplay and save invariants

- Preserve manual rolls, six-room routes, five equipment slots, eight rarity tiers and the single gold balance unless the user explicitly requests a design change. Defeat retains equipment, gold, talents and completed rooms.
- Product release identity is shared by `package.json`, `src/release.js` and the `dice-abyss-release` HTML meta tag. The save schema is separate: `VERSION` in `engine.js` is currently 5. Do not bump it merely to change the product release.
- Keep the existing `dice-abyss:save:v1`, `dice-abyss:mirror:v1` and legacy archive keys compatible. Preserve supported extra fields and immutable pre-migration originals; never silently trim a save or replace it with a fresh run.
- Transactions must recheck the complete expected snapshot and authoritative IDs/quotes. The app serializes cooperating tabs with Web Locks. Snapshot checks alone are not an atomic cross-tab lock on browsers without that API.
- Write the primary save before presenting a committed result. A failed primary write must leave the action unapplied; a failed mirror write must keep the durable primary result and show a warning. Do not report an already-committed action as rolled back.
- Keep equipment level, level XP and enhancement distinct. Equipped items, current loot and protected materials must retain their existing consumption and confirmation rules.
- Rendering and previews must not consume game RNG or alter saved history. Optional historical fields must remain optional in the UI; missing fusion consumption history must not block resuming a readable save.
- Inventory selection reuse belongs to consecutive pages of the exact current state and criteria. It must not escape into transactions or survive changed saves, runs or filters. Fusion commits must independently revalidate the selected items and costs.
- Animation only reveals an already-saved result. Skip, hidden-page, resize, deadline and context-loss paths must release owned resources and leave the committed result usable without awarding it again.
- Show actual credit where recorded. Label nominal rewards and cap truncation honestly; do not infer a historical receipt from the current balance.

## Verification

For substantive code changes, run the applicable checks and the repository gates:

```text
npm run check
npm test
npm run simulate -- 1000
```

- Reproduce stateful failures, add meaningful regression protection and inspect the final diff. Preserve unrelated work; stage explicit paths.
- Check CI's Node version when investigating differences from the local runtime. Particle-program regression uses the bundled SHA-256-verified original in the same runtime, with exact command and primitive-state equality. Keep the original source/reference evidence; do not fix a failure by updating hashes blindly or adding tolerance.
- For visible changes, exercise the affected UI and reload/continue path in a real browser. Prefer the current repository QA drivers, including `scripts/qa-core-browser.mjs`; inspect older drivers before assuming they match the current UI.
- Browser QA uses an externally installed Playwright/Chromium via `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH`. Do not add them as game dependencies. Pass an external `--output` directory.
- Use fresh browser contexts and synthetic saves on an isolated test origin. Never clear, import into or overwrite a user's normal browser profile or private save as a test setup step.
- Separate unit/HTTP checks, native browser interactions, human playtesting and performance evidence. Software rendering or a simulated 4K viewport does not prove physical-GPU 4K/60 FPS, pixel identity or long-term balance.

## GitHub and documentation

- Push, merge, publish, deploy and remote configuration changes require explicit user authorization. An earlier instruction to withhold a push remains binding until the user changes it.
- The Pages workflow verifies pull requests and pushes to `main`; only a `main` push assembles and deploys `index.html`, `favicon.svg` and `src/`. README, tests, tools and this guide are not shipped in the site artifact.
- After an authorized release, verify local/remote commit equality, a clean worktree and successful Actions/Pages results for the intended commit. Then inspect the real public page, release metadata, relevant served file hashes and browser interactions. A successful push or artifact upload alone is insufficient.
- Update README with verified release behavior, evidence scope and remaining limits. Keep this guide aligned with the actual architecture and commands.
- `docs/iteration/STATE.json`, `FILE_MANIFEST.json`, reports and archived logs describe their original cloud handoffs. Local fixes are recorded by Git; regenerate manifests when producing a new archive. Do not present old PASS records as new executions.
- Some historical evidence logs are deliberately tracked despite the general `*.log` ignore rule, and some retain original whitespace. Preserve their bytes; keep new generated QA output outside the repository instead of rewriting or deleting historical evidence for cosmetic cleanup.
