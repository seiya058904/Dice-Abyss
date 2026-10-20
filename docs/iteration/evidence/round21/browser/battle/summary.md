# Round21 native battle-window browser QA

Release **5.21.0**. Final combined coverage passed **34 distinct cases  / 1,882 checks**, using **13 gameplay cases from attempt 2** and **21 cells from the corrected layout-only run**. Earlier complete 34-case batches retain their original FAIL verdicts.

## Evidence accounting

| Attempt | Original verdict | Cases | Pass | Fail | Checks | Exact manual transitions | Browser errors |
|---|---|---:|---:|---:|---:|---:|---:|
| 1 | FAIL | 34 | 5 | 29 | 695 | 26 | 0 |
| 2 | FAIL | 34 | 21 | 13 | 1577 | 46 | 0 |
| 3 | PASS | 21 | 21 | 0 | 1053 | 0 | 0 |

Attempt 1: all 29 failures came from the new driver looking for the next-roll sentence in `.enemy-mechanic`; the product renders it in the sibling `.combat-rules > summary`. Original reports, screenshots, driver and reviewed triage remain preserved. The one-line selector correction changed no game source.

Attempt 2: all 13 gameplay cases passed (829 checks, 46 exact transitions). Eight layouts passed and 13 stopped at a new overbroad font assertion. Current and baseline intentionally use an 11px tactic-row floor; inherited boon QA requires 12px for boon/preview text and excludes tactics. All 21 had already passed overflow, font loading and readout truth, but 13 had not reached clip/focus/action checks. Therefore all 21 layouts were rerun.

Attempt 3 ran only those 21 layouts and passed 1,053 checks, including the formerly unreached native clip/focus/action checks. Combined nonduplicated evidence is 829 + 1,053 =1,882 checks. No game failure or browser page error was observed.

## Gameplay findings

- Both bandits were manually rolled through turns 0→4. Variant 0 keeps the first-two-roll +25% damage and first-three-roll ×2 gold; variant 1 keeps first-two-roll +15% damage and ×3 gold. Actual boundary kills generate the exact pending chest and claimed reward without extra RNG consumption.
- The exact historical variant 1 note stays saved verbatim while its narrow display correction says two rolls, including after native refresh. Custom imported notes remain literal and escaped. Each bandit ends in the same complete state as the actual baseline browser after four manual rolls.
- A real crit on roll 2 without the effect leaves availability missing and unused. Buying the talent through its actual UI makes the first eligible crit on roll 9 grant 5 raw luck and consume the opportunity. The next roll consumes earned luck. Another talent rank does not rearm the current fight.
- Real animation observations cover pre-roll, committed impact and settled readouts. Eligible lethal crit, refresh, retry reset, critical kill, exact chest reward, next enemy and carried-luck use match unchanged engine transitions.
- The 46 verified transitions comprise 35 rolls (8 baseline, 27 current), 7 opens, 2 talent purchases, 1 retry and 1 next-wave action. Native navigation, settings, load/Continue, refresh and disclosures are checked separately without inflating this action count.

## Actual minimum fonts in all 21 cells

Computed CSS pixels are identical before and after disclosure toggles in every cell. The corrected requirement is boon/banner text≥12px and inherited tactics≥11px. Baseline/current `src/deep.css` is byte-identical. This corrects the new test scope; it is no product font change or readability improvement claim.

| Viewport | UI scale | Minimum boon/banner | Minimum tactic row | Checks |
|---|---:|---:|---:|---:|
| 1366×768 | 0.9 | 12 | 11 | 50 |
| 1366×768 | 1 | 12 | 11 | 51 |
| 1366×768 | 1.1 | 12 | 11 | 50 |
| 1920×1080 | 0.9 | 12 | 11 | 50 |
| 1920×1080 | 1 | 12.8947 | 12.0115 | 50 |
| 1920×1080 | 1.1 | 13.5605 | 12.6317 | 50 |
| 2560×1440 | 0.9 | 15.4737 | 14.4138 | 50 |
| 2560×1440 | 1 | 17.193 | 16.0154 | 50 |
| 2560×1440 | 1.1 | 18.0806 | 16.8422 | 50 |
| 3840×2160 | 0.9 | 23.2105 | 21.6207 | 50 |
| 3840×2160 | 1 | 25.7894 | 24.023 | 50 |
| 3840×2160 | 1.1 | 26.28 | 24.48 | 50 |
| 1099×900 | 0.9 | 12 | 11 | 50 |
| 1099×900 | 1 | 12 | 11 | 50 |
| 1099×900 | 1.1 | 12 | 11 | 50 |
| 390×844 | 0.9 | 12 | 11 | 50 |
| 390×844 | 1 | 12 | 11 | 51 |
| 390×844 | 1.1 | 12 | 11 | 50 |
| 320×740 | 0.9 | 12 | 11 | 50 |
| 320×740 | 1 | 12 | 11 | 50 |
| 320×740 | 1.1 | 12 | 11 | 51 |

All 21 cells load both bundled fonts, avoid document/internal horizontal overflow, preserve the complete save, allow native scrolling to the entire opportunity row, retain disclosure keyboard focus and leave the enabled manual control reachable. Three capture cells add one clipping check while lifetime rules are natively open.

## Personally inspected final screenshots

Final captures use shipped CSS and actual viewport sizes. Narrow combat and opportunity are separate document sections, shown after normal scrolling; no frame implies simultaneous visibility of both.

- `/workspace/scratch/85c02edcd5e2/qa/browser-battle-round21/2026-10-19T13-11-14-267Z-127836/dense-1366-scale-1-opportunity-viewport.png` — Bandit countdown, earned gold luck and muted unused opportunity are simultaneously visible within their clips. Manual roll is unobstructed. Lifetime disclosure is natively open with its focus outline visible.
- `/workspace/scratch/85c02edcd5e2/qa/browser-battle-round21/2026-10-19T13-11-14-267Z-127836/dense-390-scale-1-combat-viewport.png` — Complete bandit countdown, damage warning, earned-luck and echo banners, six dice and manual action are visible. Opportunity is in a later document section.
- `/workspace/scratch/85c02edcd5e2/qa/browser-battle-round21/2026-10-19T13-11-14-267Z-127836/dense-390-scale-1-opportunity-viewport.png` — Native scroll shows earned luck, complete unused opportunity and expanded lifetime explanation. Fixed manual control remains visible; combat guide is outside this viewport.
- `/workspace/scratch/85c02edcd5e2/qa/browser-battle-round21/2026-10-19T13-11-14-267Z-127836/dense-320-scale-1.1-combat-viewport.png` — Countdown and manual action remain visible. Inherited narrative and rule-summary text wrap cleanly. Dice fall below this short viewport. No horizontal clipping is visible.
- `/workspace/scratch/85c02edcd5e2/qa/browser-battle-round21/2026-10-19T13-11-14-267Z-127836/dense-320-scale-1.1-opportunity-viewport.png` — Native scroll shows the complete availability row and expanded lifetime explanation with manual control visible. Earned luck is above this viewport, so this frame makes no simultaneous-visibility claim.

The parent independently inspected `/workspace/scratch/85c02edcd5e2/qa/browser-battle-round21/2026-10-19T13-00-12-442Z-125244/critical-used-and-earned-luck.png`. Initial color-study frames with a target below the sidebar scroll fold are preserved as a harness-framing failure and excluded from final evidence.

## Versions and preserved evidence

Final driver SHA-256: `8f1f8e2397856546ed2f1c31b041b9e974ad74058d81e96ce8e4db44c3d92526`.

All runtime files remain unchanged within every attempt; attempt 2 and final layout sources are identical and still match current files. Full hashes, preserved driver snapshots, exact layout diff, reports, stdout availability and triage are listed in `summary.json`.

- `src/views.js`: `75c2b6b0c36ee6d34a8066fc4867c6f223dd630633687a347b703afee674c263`
- `src/boon-readout.js`: `ea732d4fe897633b67e5349ad57c1bd52dd1506bc84f8db3748eb6aea36f0bfc`
- `src/storage.js`: `daa6eeffc7a38692213228d748c7819739392a5eeaedc91ec62350c53319591c`

Final driver: `/workspace/scratch/85c02edcd5e2/work/Dice-Abyss/scripts/qa-battle-windows-round21.mjs`. Exact selector-fixed-to-final diff: `/workspace/scratch/85c02edcd5e2/qa/browser-battle-round21/2026-10-19T13-00-12-442Z-125244/driver-layout-correction.patch`.

Chrome is closed. These harness corrections changed no runtime files. Fixtures are constructed and validator-approved; reduced-motion, low-effects, headless software rendering supports correctness checks rather than performance, natural progression or physical 4K claims.
