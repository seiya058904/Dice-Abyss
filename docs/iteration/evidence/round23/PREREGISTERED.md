# Round23 performance measurement plan

Created before formal timed samples. Input: v5.22.0 round22; candidate v5.23.0 round23.

## Candidate scope

1. Per-inventory-render batch comparison with private synchronous baseline stats/expectation.
2. Fixed compact number formatter reused across deep-value readouts.
3. One final resting-quality dice draw instead of same-frame motion draw immediately cleared by rest draw.
4. Candidate: invariant face-value lookup moved from fragment to vertex shader, retained only after pixels/lifecycle and timing review.

## Formal user-visible measurements

- Inventory opening/filter/paging: scripts/qa-inventory-latency-round23.mjs. Seed27017;10000 original complete items;both stores real native;1920x1080,DPR1,low effects,reduced motion. 12 pairs per action plus1 warmup per variant; AB/BA alternate;fresh contexts;trusted capture click→2nd rAF;whole inventory DOM and saved bytes exact;do not delete tails. First open from game screen is included. No mutation timings pooled with view timings.
- Native lock commit: existing scripts/qa-storage-latency.mjs with --balanced-order. Same10000-item fixture,12 pairs plus warmup; trusted click→native finalwrite and→2rAF,each native setItem preserved; exact transition and mirrors required. Save implementation itself is unchanged.
- Main frame matrix: unchanged scripts/qa-performance-round12.mjs --mode frames --repeats3. Sizes1920x1080,3840x2160;boss burst and eternal chest;full/low;3 balanced pairs per cell;4200ms minimum windows with all raw intervals/max/long tasks. Additional fourteen windows cover rarities0–6 full effects at1920. Callback intervals on software SwiftShader do not certify physical GPU FPS or4K60.
- Isolated dice shader/landing probe: script from rendering task; explicit before/after source identities,real GL submission counts,pixel comparison for six faces,motion/rest geometry and context lifecycle. Instrumented draws are diagnostic work counts,not end-to-end FPS.

## Selection and execution rules

- No task-owned CPU suites/simulations or second browser performance process during formal windows.
- Keep declared warmups and all positive/negative samples. Failed driver/setup is retained and corrected transparently in a fresh attempt; no selectively replacing a slow sample.
- Baseline standalone 4K eternal trace is intrusive attribution,not formal data. Do not pool its timings with ordinary frame samples.
- Freeze runtime sources for each complete experiment;hash before/after and HTTPserved identity. Document any candidate rollback,rerun only affected gates against final runtime.
- Full tests,1000+50 short simulations,unchanged bounded4x400 policy,core browser,inventory navigation,lifecycle,multisize views and final archive gate protect compatibility. Synthetic scenes and naturally reached journeys have separate labels.
