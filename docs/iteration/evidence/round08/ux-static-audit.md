# Round 08 UI audit candidates

Scope: immutable `baseline/Dice-Abyss`, version 5.7.0 / round 07. Read STATE, HISTORY, NEXT_ROUND, LATEST_REPORT, PAGE_REVIEW, runtime views/controllers/styles, event settlement, and existing native scripts. No project mutations, browser launch, or remote operation. Impeccable context engine was unavailable; inspected existing implementation and committed screenshots metadata directly. No new design-world decision.

## Main interaction candidate: keep keyboard play continuous after presentation

**Status: static causal trace; native reproduction requested from root. Do not count as a proven browser defect yet.**

- `src/app.js:188–275` commits then renders animated actions with `ui.busy=true`.
- `src/views.js:314–317` replaces `#primary-action` with a disabled button while busy.
- `src/fusion-dom.js:83–96` restores an old focused control only if the replacement is enabled.
- Intermediate render therefore loses the original primary control focus. Later renders recapture `BODY`, so the last enabled primary control has no retained origin to restore.
- Global Space only triggers a combat roll (`src/app.js:436–441`), so BODY Space cannot open the resulting chest or enter the route after an animated fate roll.

Native reproduction: focus `#primary-action` in fate or combat, activate with Space, wait for completion, inspect activeElement; check fate→route and kill→chest→open transitions. Existing core scripts click primary controls and test inventory lock; they do not establish this keyboard chain.

Minimum implementation if confirmed: retain the original initiating focused control across an animation generation, restore to an appropriate enabled action on natural completion / skip / hidden deadline, and discard the request after a run switch or meaningful user focus movement. Open dialog and intentional navigation focus take priority. Check normal, skip, low/reduced effects, failed-save, background, and settings-during-animation paths without changing settlement or RNG. Do not simply focus the primary button after every render.

## P2 confirmed: theoretical coin reward can overstate the real transaction

**Status: reproduced in Node with validator-accepted synthetic states and real transitions.**

`static-audit.mjs` recreates the fixtures from the shipped event fixture builder. `static-audit.json` retains raw metrics. Six scenarios passed save validation and exact encode/decode after the action; original state stayed byte-identical.

| Case | UI/confirmation reward | Actual gold | Other effect |
| --- | --- | --- | --- |
| Floor 140 gold room, at cap | +958 | 0 | Proceeds to next room; new log still says received 958 |
| Same, 10 below cap | +958 | 10 | New log still says received 958 |
| Same, ample room | +958 | 958 | Correct |
| Floor 140 exchange, at cap | 835 gold +540 XP | 0 | Registered item i4 permanently consumed |
| Same, 10 below cap | 835 gold +540 XP | 10 | i4 permanently consumed |
| Same, ample room | 835 gold +540 XP | 835 | Correct |

Root cause: `gainGold` (`src/engine.js:125–128`) clamps to GOLD_CAP, while `views.js` gold view and `encounters.js:215` return theoretical amounts. Gold-room transaction log (`engine.js:380–382`) also repeats the theoretical amount. The generic cap log occurs only after the action, so a player cannot review the forfeited reward before permanently spending the exchange item. Existing salvage preview already distinguishes `gold`, `overflow`, and `rawGold`.

Minimum implementation: add a small read-only credit preview shared with dynamic reward wording (credited / overflow / before-after balance), show the real coin amount and any forfeiture in pending gold/exchange decisions and confirmation, preserve actual cap/asset/RNG rules and resolved historical text. If changing newly appended log text, declare it as intentional presentation metadata rather than claiming complete serialized equality for those capped branches. Expand to chest/fate only with explicit scope; those have the same theoretical/credited distinction but were not reproduced in this audit.

## Performance finding: sorting is measurable, but too small for main gain

No runtime change recommended as a lead feature. A 10,000-item synthetic fixture with all qualities yielded identical item-ID order for power, rarity, and level sort. Paired Node microbenchmark used three warmups and 24 measured pairs with alternating order:

| Sort | Existing itemValue calls | Decorated calls | Existing median | Decorated median |
| --- | ---: | ---: | ---: | ---: |
| Power | 178,948 | 10,000 | 3.280 ms | 1.813 ms |
| Rarity | 119,802 | 10,000 | 2.955 ms | 1.707 ms |
| Level | 137,286 | 10,000 | 3.436 ms | 1.968 ms |

This excludes render, DOM, layout, save, and browser input-to-paint. Approximately 1.3–1.5 ms saved in this fixture does not justify claiming that the large-inventory UI is now responsive. The previously measured synchronous save and DOM tails remain the consequential open risks.

## Known limitations retained, not counted as newly found bugs

- Whole page minimum width 900px and hidden small-window note were already documented in Round07. Talent and fusion narrow surfaces do not establish whole-game mobile usability.
- Inventory lock/unlock already preserved scroll/focus; this audit does not resurrect the withdrawn static misdiagnosis.
- Same-effect deep enemy pairs remain a design opportunity, not automatically a defect.
- No new CSS, palette, labels, mechanics, product version, or tests were changed.

Await root's native interaction result and implementation assignment.
