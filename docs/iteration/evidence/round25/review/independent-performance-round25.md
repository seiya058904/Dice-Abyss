# Round25 · Independent final performance review

Date: 2026-10-20. This step read retained JSON and performed arithmetic only. No browser, benchmark, new test matrix, source hash recomputation, runtime edit, or visual/evidence-object write was performed. The final docs are owned by this reviewer: PERFORMANCE.md, ART.md and RESEARCH.md.

## Scope and derivation

- Full-release frames: qa-round25/frames-final/performance-round.json; 48 main windows plus 14 separate coverage, MEASURED, sourceStable true, zero errors. Derived data: agent-notes/performance-final-derived.json.
- Native inventory: qa-round25/inventory-latency/report.json and inventory-latency-final/report.json; each has 72 formal actions plus six declared warmups, 12 pairs/action. Kept independent, with every negative row and wider CDP counter. Derived data: agent-notes/inventory-final-derived.json.
- One bounded particle ablation: qa-round25/particle-ablation/performance-round.json and particle-ablation-plan.json; 24 main plus 14 coverage, MEASURED, zero errors, stable sources. Both arms use current runtime; only the control effects.js is the exact uploaded input. Derived data: agent-notes/particle-ablation-derived.json.

Directions compare exact recorded floating values. Tables show rounded values, without adding any tolerance. Cell p95 is median of three run p95; worst max is the maximum raw interval across those runs. Paired differences remain distinct from differences of marginal medians. P50/p99 and all intervals remain addressable in the original frames.runs / coverage.runs JSON. No main/coverage/diagnostic/initial/final batches were pooled.

## Main findings that must remain visible

The complete release matrix has five of eight median-run p95 cells slower and three of eight worst maxima worse. Across 24 pairs: p95 9 faster / 14 slower / 1 equal; max 18 faster / 6 slower; first-frame delay 11 faster / 13 slower. 1080p Boss full has 3/3 slower p95 (20.5→24.2, 18.2→19.1, 18.7→19.8 ms).

Main raw intervals: 4,971→5,448; over50 48→33; over100 32→25. Windows with intervals above 1 second: 4→0. LongTask count decreases 10→8 but overlap increases 2,362→2,774 ms and longest task 677→786 ms. The long 4K eternal baseline gaps are retained and have no overlapping LongTask; this is not a proved GPU/browser cause. Better 4K eternal tails cannot be attributed to the particle candidate, especially since low bypasses its drawing branch.

Final inventory page p50 43.9→43.6 ms, p95 49.5→47.1, max59.2→51.4, 7/12 faster. Final filter p95 66.8→76.7 and max82.5→95.7 are negative; open is 6 faster/6 slower with a +452.2 ms worst pair. Initial page p95 51.7→53.5, max55.7→66.0 and LongTask1→2 remain negative. Initial open p50 worsens; initial filter p95 worsens. Full four-metric CDP tables in both batches retain layout/recalc/task tail regressions instead of selecting only improved ScriptDuration.

The inventory sibling independently confirms retention can be supported only as measured selector-work elimination with guarded state/array/runId/criteria lifetime, not stable native latency improvement. The complete render can still do counts, HTML, comparisons and DOM work. A new same-object mutation path would need invalidation. One major Layout per observed action does not prove duplicate thrashing. The current selector lies outside the center wrapper, so center spans are not comparable total CPU observations.

## Independent particle retention recommendation

Recommend retaining the narrow redundant setter cleanup with OPEN_RISK, not certifying a native performance gain or non-inferiority. This is not an inference that fewer setters must be faster.

The isolated full Boss p95 differences are −1.1, −0.3, +0.6 ms; eternal full −1.5, +1.9, −0.1 ms. Each scene has two faster and one slower pair; the original 3/3 Boss regression did not recur. Both full cells nevertheless have worse median-run p95 (22.0→22.6, +2.73%; 19.5→20.4, +4.62%). This is material contrary evidence and remains open. Full pooled directions 4/6 faster are only a descriptive diagnostic, not a statistical proof; full mean paired delta approximately −0.083 ms resembles low approximately −0.067 ms and is too small to establish causal speed benefit.

Low pairs also have four faster/two slower, with one worse worst max (662.8→782.0); they are contemporaneous controls for interpretation, not automatically labeled noise. Pair directions cannot erase marginal medians, and the later batch cannot replace the complete release matrix.

The code adds a reset-per-call palette marker and skips only consecutive equal fill/stroke/line-width assignments; the first effective particle and every palette change restore complete original state. Ordered primitive state/command audits pass 66 cases with 46,032 fewer assignments; the strict Canvas failure also reproduces identically in input/input and current/current capture slots. These bound the observed functional risk. Combined with no stable attributable slowdown in the isolated pairing, the evidence is insufficient to require rollback now; it is also insufficient to advertise improved native frame times. A reproducible future isolated native regression should reopen this low-scope cleanup first. Stop additional testing after the declared bounded batch.

## Pixel and context limits

Original Canvas strict A/B stays 17/18, with the two-byte/two-pixel 4K loot-7 failure. All nine same-target repetition pairs remain STRICT_DIFFERENCE. Repeat data are slot-stable and source-independent, not converted to PASS or claimed distribution equivalent. No tolerance, mask, channel, shader or DITHER changes. RGBA uses the authoritative manifest and lossless gzip/xz objects; this reviewer did not write those objects.

Strengthened native context report is baseline/current each three cycles and 31 checks, 62 PASS, actual alpha-positive readback and sampled GL error zero. Four ReadPixels stall warnings remain; functional instrumentation is absent from frame and inventory timing. A first nontransparent draw does not certify the complete dice frame or strict RGBA restoration. Original weaker probe/report and exact driver gzip remain.

## Documentation status

PERFORMANCE now includes the complete eight-cell main table, all cell run-p50/run-p99 medians and raw locations, paired directions, long tasks, seven separate rarity coverage rows, both full inventory datasets and every CDP metric column, work counts, strict pixel failures and all three repetition groups, isolated ablation table and explicit retention risk. ART and RESEARCH have no remaining PENDING_ROOT_SUMMARY marker, report no newly generated/adopted bitmap, and cite actual primary research with adoption/rejection boundaries. Historical input documents remain in their exact gzip archives.
