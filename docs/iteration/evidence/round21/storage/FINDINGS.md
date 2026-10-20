# Round21 storage and render audit handoff

## Implemented and frozen

`src/storage.js` reuses one inventory ID Set only inside validation of a freshly decoded V5 JSON graph. The exported validator, encoding path and legacy migration validation keep their original reads and Set builds. Full expected-state JSON comparison remains exact, including unknown metadata; serialization stays at four calls for an ordinary save. The app Web Locks, migration archives, mirror warnings, save transaction and rollback code were untouched.

Ordinary save profiling shows four inventory Set constructions reduced to three; current-schema decoding reduces two to one. Direct public validation and encoding stay at two. This is an exact reduction in duplicated work. Native browser timing belongs to the parent and is needed for user-facing speed claims.

Storage SHA-256: `daa6eeffc7a38692213228d748c7819739392a5eeaedc91ec62350c53319591c`.

`gameView` now calculates the stats already needed by its footer once per call, shares them with the equipment rail and one benefit model, and passes that model to the route and combat panels. Talent and fusion workbench modes do not derive an unused benefit model. All values are local to the synchronous render. Standalone functions keep their default calculations; no cache or retained snapshot was introduced.

Views SHA-256: `75c2b6b0c36ee6d34a8066fc4867c6f223dd630633687a347b703afee674c263`.

Boon readout SHA-256: `ea732d4fe897633b67e5349ad57c1bd52dd1506bc84f8db3748eb6aea36f0bfc`.

## Correctness evidence

- Eight focused storage regressions pass. Against baseline, six pass and only the two intended operation-count assertions fail; those failures do not identify baseline product bugs.
- Seventy-five exact transaction comparisons cover successful normalized saves, unknown fields, imports, conflict rejection, migration, immutable originals, mirror recovery/warnings, synthetic read/write failures, complete storage events and persisted bytes, and caller immutability.
- Sixty-eight public validation/encoding cases match baseline outcomes and values, including twenty property-visitation cases and custom map iterables, map result Proxies and array species. Three adversarial full expected-state comparisons still reject with zero writes.
- Five focused local-render regressions pass. The pre-reuse/final differential matches 130 states/UI cases and 780 complete game/subview HTML outputs, plus default/supplied benefit models. Frozen data, animation impact/rolling states, all authored room types, inventory/talents/codex, same-object equipment/talent/spent-trigger changes, and next combat/RNG are covered.

Evidence: `storage-final-cpu-and-initial-view.json`, `public-api-final-differential.json`, and `view-reuse-final-cpu-and-html.json`. The runnable final audit scripts and focused tests are already in the project, rather than copied here.

## CPU measurements and limits

Fixed storage sampling used 24 alternating baseline/current pairs after four warmup pairs per cell. Ten-thousand-item save medians were 53.718 → 52.661 ms for early equipment and 58.056 → 57.061 ms for late equipment. Tails were mixed: early-equipment maxima were 71.133 → 84.425 ms; late-equipment maxima were 115.242 → 61.472 ms. The complete raw samples remain in the report.

The near-limit, 32-item metadata cells show disproportionately large Node timing differences. Eliminating one tiny Set cannot credibly explain those gaps. They are retained observations and must not be attributed to the optimization.

The initial newly added combat readout increased pure HTML generation at the late-equipment 10,000-item edge by a paired median 1.753 ms. That prompted the local render reuse above. A subsequent fixed three-way run used all six baseline/pre-reuse/final permutations four times, following one warmup cycle:

| Pure HTML generation cell | Baseline median | Pre-reuse median | Final median | Paired final minus pre-reuse median |
| --- | ---: | ---: | ---: | ---: |
| 32 items, early starter equipment | 1.431 ms | 2.207 ms | 2.118 ms | −0.086 ms |
| 10,000 items, late starter equipment | 4.739 ms | 7.099 ms | 5.080 ms | −1.801 ms |

The final large-inventory paired median remains 0.244 ms above baseline in that run; do not claim complete elimination or native speed. Pre-reuse/final modules underwent the diverse differential first while baseline did not, so their JIT histories differ. All measurements are Node components, exclude DOM/layout/paint/native input/GPU, and have uncontrolled outside shared-host load despite coordinated agent CPU windows. Parent native-browser evidence decides final framing.

## Rolled-back candidates and harness errors

The direct-payload shortcut is **ROLLED_BACK: safety-contract risk in an unshipped candidate**. Unknown `JSON.rawJSON('1.0')`, `JSON.rawJSON('9007199254740993')`, and numeric-key Proxy ordering provide concrete cases where raw-payload equality accepts writes rejected by the original decoded-current/expected comparison. This is not a baseline product bug. Its patch, prior test/benchmark text, rejection receipt and exact counterexamples are retained.

The guarded public-object Set reuse is **ROLLED_BACK: safety-contract risk in an unshipped candidate**. Added result-array length/index reads can observe custom map/species proxies differently; the guarded candidate accepts a pending-auction reward collision that baseline rejects. The final decoder-only candidate preserves the original public result and visitation. Its patch, counterexamples and all exploratory/formal measurements are retained.

The first direct-payload timing attempt missed the exact Unicode padded-envelope fixture size by one byte because checksum hex width can vary. Its failed output and harness correction are retained. A later view audit mistakenly expected four unique HTML strings from four steps that intentionally restore the original equipment/talent in the last step; the correct expectation is three unique strings and last equal first. That failed precheck retained 128 matching cases/768 matching HTML comparisons before the fixture assertion. Neither harness error was a product defect.

## Compact package contents

This directory includes only reports, protocols, receipts, source diffs and rejected audit/test text. It excludes assets, cloned project/source trees and symlinks. `storage-baseline-to-final.patch` identifies the exact shipped storage change; the two rejected patches reconstruct their candidate source from the hashed baseline. `view-pre-reuse-to-final.patch` reconstructs the prior view source by reverse-applying it to a separate final copy. Full exact source originals remain in the parent scratch audit area if needed.

The JSON reports retain original local roots and original script/source hashes as execution provenance. `public-api-final-differential.json` used SHA-256 of JSON-stringified text for its source/script hash fields; the frozen source hashes above and the timing reports use raw UTF-8 file bytes. The manifest lists raw-byte SHA-256 for every packaged evidence file.
