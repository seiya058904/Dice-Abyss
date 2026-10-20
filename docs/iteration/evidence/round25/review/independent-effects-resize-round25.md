# Round25 independent renderer and resize review

## Scope

Read-only review of the immutable input effects implementation, current effects diff, the new particle audit/test/reference fixture, the existing recording harness, current resize lifecycle implementation and new resize browser script. Read actual baseline/current resize reports; no browser or heavy computation was run during root performance windows. Runtime was not edited.

## Runtime particle change: no blocking finding

The only effects diff is a function-local `particleKey` initialized on every `drawParticles` invocation. All particle keys are generated from the fixed color palette (follow -> blue, die classification -> fire/blue/red/white, reward -> one of eight rarity keys). Thus each equal key implies equal `ink`/`stroke`, and lineWidth is always0.7. First active particle always has a string key distinct from undefined and submits all three styles. Skipped delayed/dead/zero-alpha particles perform no style mutation. Between active particles, drawImage does not alter Canvas state; the square path has a balanced save/translate/rotate/strokeRect/restore, and neither drawing branch changes styles. Calls are synchronous and particle order/positions/RNG/alpha/path programs are unchanged. The key is reset between frames, so ring, bolt, motif or shard styles from preceding frame/draw stages cannot poison the cache.

This supports exact effective drawing behavior for the actual change. No shader, mesh, backing-buffer sizing, duration, rarity, save or RNG change is present in this diff. Browser timing still determines whether fewer setter submissions improve latency; it must not be sold as a general FPS guarantee.

## Particle evidence audit

The new reference identifies the real input ZIP hash `90784df189c75d0513b6192f2a6ada4c6f1fb199a52d96143112f5a415efd611` and effects hash `88cc6f5b068931b438ffcdcedaae942831917123b21e6dec60bb4b2015cb702b`. Its64 rows are16 existing scenarios ×4 viewports (390/1366/1920/3840), with first-party baseline receipts and baseline paint-write counts. The live A/B driver additionally checks two cancellation boundaries. New tests cover four viewport groups and two negative-oracle cases. Existing tests and the old harness were not weakened.

`removeRedundantPaintWrites` only removes fillStyle/strokeStyle/lineWidth writes already equal in tracked state; remaining full command programs include every draw, alpha change, path, transform and other recorded write. A second primitive-state oracle preserves color, width, alpha and compositing state per primitive. Save/restore tests include a required style reassignment after restoring previous state; mutation tests show alpha/color/width/order changes are detected. Current implementation does not batch or reorder transparent particles.

### Concrete limitations to state accurately

1. **Scope: recorded Canvas, not native pixels.** The existing harness stubs GPU dice and uses ten supplied elapsed samples. It does not establish physical GPU FPS, exact native RGBA, continuous-time coverage or arbitrary backend state. Root must keep the old strict-RGBA uncertainty separate.
2. **Oracle underflow edge.** `removeRedundantPaintWrites` treats restore on an empty stack as an empty style map, whereas Canvas restore underflow is a no-op; its primitive oracle already keeps current state in this case. This is conservative (retains extra style assignments) for the current test data, not a discovered false pass: production `drawParticles` uses balanced pairs. If the helper is marketed as a general Canvas-normalization oracle, change the underflow branch to preserve current state or explicitly limit it to balanced recordings. No release blocker for this precise diff.
3. **Canvas reset modeling.** The old harness records backing sizes separately but does not emulate a real context reset on changing canvas width/height. Current style dedupe is local to each drawParticles call and no canvas reset occurs inside that function, so the actual proof remains applicable. Do not generalize the receipt as proof for future cross-frame state caches or resize optimizations.

## Resize fix and actual evidence

The new listener uses the existing settlement path only while UI is busy and no commit is in flight. `settlePresentation` increments generation, stops active presentation through render, clears visual-only state, displays the already committed game state and invokes existing focus restoration. Existing asynchronous action branches compare their generation before resuming. No storage write is added by resize.

Actual script reports inspected:

- `qa-round25/resize-baseline/report.json`:34 checks; five presentation scenes plus idle inventory complete. Boss impact, chest charge and eternal reveal each retain old mounted canvas with logical width929.109/964.641 but resized owner width660.438/686.313. All five active scenes remain busy. The overall result is `BASELINE_RESIZE_DEFECT_REPRODUCED`, with per-row geometryMismatch true in those three scenes; they are not represented as corrected baseline cases.
- `qa-round25/resize-current/report.json`:43 checks; all six cases PASS. All five active scenes have busy=false, input enabled, old canvas disconnected/cancelled and visible phase equal to the expected full engine result. OldCanvas lifecycle is explicitly cancelled. Repeated resize leaves both persisted records unchanged. Idle inventory retains the same DOM node.

The oracle derives the complete expected action through the real engine, validates it, requires both persisted saves to decode to that exact state before resize, and compares full raw saved bytes after resize and after the delayed continuation window. Synthetic high-tier/floor140 fixture grants are stated. This is valid evidence for committed-action settlement and stale FX geometry, with no claim of naturally reaching floor140.

### Specific QA claim boundaries / possible improvement

1. `row.after` asserts enabled primary control and correct phase, but does not record `document.activeElement`; therefore report input release, not newly proven keyboard-focus restoration. The existing focus path is reused, but this script alone does not certify it.
2. Filesystem sourceBefore hashes cover five named files but are not HTTP response-byte identity. The script assumes its --url server serves --source. Root's separate exact HTTP checks and known bound servers can supply that chain; absent that chain, the driver should hash served app/effects/views bytes before claiming a specific source version was tested.
3. `waitForTimeout(2400)` is a continuation observation window rather than proof of all arbitrary pending timers. The following primary-enabled wait and phase check cover completion. Keep that bounded wording; it is not physical resize timing/performance certification.
4. Most scenario exceptions become row FAIL and overall FAIL while retaining executed rows. Browser launch/fixture/setup errors occur before the main try/finally and rely on outer command stdout/stderr, rather than a completed report. Both actual inspected runs successfully reached their final report; root should retain command failures if setup ever fails.

None of the above requires widening this round's runtime scope. The inspected failures and mixed outcomes are not hidden or reassigned.

## Packaging mutation receipt

Executed root-approved image-only plan after verifying all100 targets against both current work bytes and immutable baseline SHA. Exactly100 original paths are now absent; no extra original file is missing. Removed8,646,283 expanded bytes /8,230,482 original ZIP compressed payload bytes (final ZIP delta remains to be measured). All44 retained representatives are byte-identical. Input tests/fonts/raw-RGBA byte protection also passed.

Changed by this agent:

- New `docs/iteration/evidence/round25/package/omitted-historical-screenshots.json` with complete100-row ledger, input ZIP identity, SHA checks, exact removed bytes and final-size caveat.
- Updated `output/playwright/README.md` to document one retained historically compressed README-linked image and link the omission ledger.
- Removed exactly100 image paths listed in that ledger; no runtime/tests/scripts were edited.

Verification receipt: `qa-round25/baseline/compaction-applied-verification.json`. Root owns final manifest regeneration and final entity byte/CRC/new-extraction checks.

## Final freeze follow-up, 2026-10-20

The previously noted empty-stack restore normalization edge was corrected in audit-particle-style-round25.mjs: it updates tracked paint state only when pop() returns a saved state. The existing new negative-oracle case now checks repeated empty restore, duplicate red assignment removal and retained red primitive state. All six particle test cases passed in final current 902-case native execution. This closes limitation item 2 as an implementation issue; native-pixel and context-reset scope limits remain.

The resize reports described above are the earlier inspected snapshots. Root subsequently identified the lost live-region result during early settlement and the app added shared one-shot result announcements. The final frozen app SHA is 7c463a2d27ba8a03ebdcef166c3f5988e85febc14173b006b8e84ce893faa7ad. All 13 new real-app/harness announcement cases passed, including early resize across seven action scenes, no duplicate outcome, event Skip, mirror warning precedence, same-run storage replacement cancellation, recovery cancellation and failed primary write. These tests use substituted DOM/FX and do not certify a physical screen reader. Root's final native browser reports supersede the early report snapshots for final source-version claims.

Full current regression completed with 98 modules / 902 cases, no failure/cancelled/skipped/todo, all original 95 module bytes preserved. Raw evidence in qa-round25/current. No runtime was modified by this independent reviewer.
