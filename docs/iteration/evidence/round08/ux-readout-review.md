# Round 08 UX acceptance and independent copy review

## Result

The frozen 5.8.0 runtime passed the complete native readout suite: **6 groups / 678 checks**. A further **1 group / 35 checks** exercises actual overflowing rule text with the native wheel (13 repeated environment checks plus 22 case checks). The portable focus script passed the original **8 groups / 42 checks** again. All three final reports have zero page/console errors and matching source hashes before and after. Browser-served runtime hashes match the chosen source directory.

All browsers owned by this audit were closed before the parent started its isolated performance window. These are functional/layout checks, not timings, FPS measurements, hardware accessibility tests, or OS suspension tests.

## What changed in this agent's scope

- `src/action-focus.js` remembers an initiating primary-button focus across one presentation generation. It restores only a matching run and generation to an enabled visible primary, and discards the request for dialogs, run replacement, or an intentional move to another control. Focus restoration uses `preventScroll`.
- `src/app.js` connects that policy to natural completion and presentation settlement, captures both ordinary and event dice presentations, and cancels on dialogs/run replacement/storage replacement.
- The native readout acceptance exposed a second concrete keyboard defect: Space on the newly added native rule `summary` was intercepted by the global combat shortcut. The final two-line app change adds `summary` to the interactive-target exclusion and updates the comment.
- The nine focus policy unit tests are unchanged after their earlier 9/9 pass. No existing test was rewritten. Combat views, tactics, rules, engine settlement, and styles were implemented by the gameplay agent and reviewed read-only here.

The main focus baseline used a validated synthetic one-hit enemy: the initial primary received Enter, the chest appeared with focus on BODY, and a second Enter left revision at 3. The final native chain continues Enter through roll → chest → open → loot → next, and Space through fate → route → enter. It also preserves intentional settings focus, an open dialog, skip settlement, injected hidden-document settlement, and a rejected primary save. A BODY-origin combat Space retains its previous shortcut scope.

## Independent condition and wording review

I compared the visible current-roll terms with `combatModifiers`, `deepEnemyAttack`, `postRetaliation`, `encounterReward`, and `resolveRoll`. The browser script uses independently written expected terms instead of importing `encounterTactics` to manufacture expectations.

| Mechanic | Verified current condition and consequence |
| --- | --- |
| parity | Odd/even refers to upcoming `turns + 1`; a strict majority is `floor(dice / 2) + 1`. An even split earns no bonus. The next parity remains visible while collapsed. |
| sequence | Three distinct faces grant +40% damage. Fewer distinct faces rebuild 3% enemy maximum-HP ward only after a surviving counter; the enemy shield cap still applies. |
| laststand | The first two rolls show −25% counter strength; roll 3 shows +12%; later growth reaches +60%. The exposed next-roll percentage follows the same boundary. |
| undertow | A sum of at least 24 grants +25% damage and prevents that heal. Otherwise, a surviving counter can restore 2% enemy maximum HP, capped at its maximum. Three dice correctly cannot reach 24. |
| hush | A pair or higher reduces the counter by 20%; entirely distinct faces add 50% shield piercing. One die cannot make a pair. |
| hourward | Odd upcoming rolls reduce the counter by 20%; even ones grant +35% damage. The next effect stays visible. |
| onslaught | The current wave is explicit. Waves 2 and 3 show 20% and 40% above first-wave base counter strength. Three equal dice reduce the current counter by 25%; loot remains per wave. |
| bounty | The three-roll window includes the imminent roll. With two rolls already used, the displayed third roll is the last triple-gold opportunity. After that, +20% opening damage and triple gold both end; the epic floor remains. |
| abyssking | A six in pre-roll stage 1 grants +35%; three equal dice in stage 2 grant +60%. Crossing half HP during this roll does not retroactively switch the weakness. |
| archiveguard | Four distinct faces grant +50% damage and 8% player maximum-HP ward; otherwise the counter increases 15%. Three dice are correctly marked unable to meet four distinct faces. |
| boss_prism | Three distinct faces grant +40%; otherwise counter strength rises 15%. |
| boss_eclipse | On odd rolls, a six prevents the extra counter; without a six, counter strength rises 25%. On even rolls, three equal faces grant +50%. |
| boss_witness | The first roll grants +50% damage. Later rolls need three high (5/6) faces to reduce the counter by 25%; two dice cannot satisfy that later condition. |
| boss_thread | A pair grants 45% added piercing and prevents reweaving. All-distinct faces can rebuild 2% enemy maximum-HP ward after a surviving counter, capped. |
| boss_origin | Sum ≥24 grants +40%; sum ≤14 raises counter strength 25%; 15–23 has neither extra effect. |
| boss_infinite | Pre-roll stage 1 needs four distinct faces for +40%; stage 2 needs three equal faces for +60%. Impossible low-dice cases and the pre-roll phase note are preserved. |

These phrases describe encounter modifiers; the adjacent retaliation warning remains the actual possible player-HP damage range after the current build and defense rules. No probabilities are fabricated, and reading or expanding the guide changes no save byte or RNG state.

Native evidence covers 16 base fixtures and 28 explicit roll/count/stage/wave boundaries. They are declared synthetic contexts built from real authored encounter generation and accepted by the actual validator/codec; they are not natural player journeys.

## Native layout and controls

Parity and the longest displayed boss text (`boss_witness`, 127 characters; `boss_infinite`, 126) were examined at 1366×768, 1920×1080, 2560×1440 and 3840×2160. Closed and open rules do not overlap the guide/counter, dice, settlement or primary action. All 16 base encounters also have closed/open geometry checks at 1366×768. Actual captured screenshots were visually inspected at 1366 and 3840 as well as the natural history result.

Character count is not scroll height: `boss_witness` fits at 1366. The additional `boss_infinite` case has a 93px rule body in a 74px viewport and therefore exercises actual forward/reverse native wheel events, retained summary focus, and Enter-to-close after scrolling. Its geometry remains valid before, during and after the scroll.

Native Enter, Tab, Shift+Tab and Space on the rule summary preserve every storage byte. The 390×844 test records the existing 900px whole-page minimum and horizontal overflow; it is not advertised as mobile usability.

## Import and history truth

The native file chooser sends checksum-valid malformed envelopes with `talents=[]`, `true`, and `1`. All three display the existing incompatibility notice before any import confirmation, including transient dialog-title observation. Every localStorage key and raw string remains exact; absent archive keys remain absent. The valid sparse object `{}` reaches confirmation without an early write, imports, buys one `power` rank with one real UI allocation, and survives refresh with exact primary/mirror/state equality.

The history test replays the existing seed 7919 / 65 public actions. It arrives at floor 3, room index 1, with dice `[5,6,4,5]`, main 764, follow 267 and total 1031. It then actually buys one `crush` and one `pursuit` rank in the UI. The previous roll and RNG remain unchanged; badges stay `暴击 ×1.8` and `连锁追击 +35%`, including after refresh. Removing the two optional fields creates the declared legacy-field fixture; it displays only the trigger names and writes no invented factors. Replaying this path is a recheck of the original natural sample, not an extra independent journey.

## Honest attempt accounting and minimal package evidence

`attempt-summary.json` records every attempt with the report hash, script/runtime hashes, failure classification, case status, and meaningful native observations. All original raw reports and PNGs remain outside the source tree.

- Attempt 01 stopped at the server's intentional package metadata allowlist; no keys were tested.
- Attempts 02–03 used an invalid archive sentinel in the harness. The existing archive safeguard correctly blocked committing; this was corrected in scaffolding.
- Attempt 04 is the real summary-Space defect: revision 1→2, one roll committed, and the intentionally underpowered synthetic player died. It is not a natural-play death statistic.
- Attempt 05 verifies the minimal guard fix.
- Attempt 06 passed the other five groups but selected hidden narrow-layout talent navigation in the history harness.
- Attempt 07 successfully bought both ranks, then used an ambiguous return-action selector. Both selector mistakes were corrected without editing the runtime.
- Attempt 08 is the full 6-group pass; attempt 09 is the additional real-scroll pass. The portable focus script independently re-runs the original eight groups.

The four concise JSON deliverables are `readout-browser.json`, `readout-scroll-browser.json`, `action-focus-browser.json`, and `attempt-summary.json`. The last embeds the original primary-focus baseline result. Do not ship duplicate FAIL screenshots. The scripts can regenerate all synthetic fixtures and the natural endpoint from the shipped 65-action fixture.

## Portable commands

Both scripts accept `--source`, `--url`, and `--output`, reject output inside the project, require a fresh report destination, and allow only the requested loopback origin. External test dependencies are supplied through `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH`. There are no scratch/runtime-provider/browser-binary paths in either script.

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright CHROMIUM_PATH=/absolute/path/to/chromium node /absolute/path/to/Dice-Abyss/scripts/qa-combat-readout-browser.mjs --source /absolute/path/to/Dice-Abyss --url http://127.0.0.1:4289/ --output /absolute/path/to/new-readout-output
PLAYWRIGHT_MODULE=/absolute/path/to/playwright CHROMIUM_PATH=/absolute/path/to/chromium node /absolute/path/to/Dice-Abyss/scripts/qa-action-focus-browser.mjs --source /absolute/path/to/Dice-Abyss --url http://127.0.0.1:4289/ --output /absolute/path/to/new-focus-output
```

The readout script also accepts `--cases` for a comma-separated selection. Its final default includes the extra actual-scroll group; the retained evidence intentionally reports the observed six-group run and separate scroll run rather than inventing a new aggregate run.

App source was frozen at **2026-10-18 06:50:00.700 UTC**. Portable focus script was frozen at **06:54:03.423 UTC**; readout script, including the extra actual-scroll case, at **06:58:43.681 UTC**. Exact hashes are in `attempt-summary.json`.

The previously confirmed capped-gold wording candidate and tiny Node-only inventory sort gain remain deferred in `../AUDIT.md`. No transaction UI or sort optimization was added in this round.
