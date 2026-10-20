# Round26 performance protocol

Declared before the final timing runs. This round compares the supplied v5.25.0
with v5.26.0 in the same isolated execution environment. The source changes are
inventory sort key reuse and conservative dice bounds reuse. Rendering quality,
shaders, assets, rules, storage and RNG are unchanged.

## Serial timing schedule

Timing begins only after the full regression and simulation processes finish.
No other test, simulation or browser benchmark runs alongside it. Each browser
driver uses one live context at a time and alternates the variant order. Slow
samples, failures and incomplete effects remain in the results.

1. `audit-inventory-sort-round26.mjs --measure`: 18 predeclared cells, 12 pairs,
   10 selections per sample, 5 warmups per cell. Three sorts on 3/8/100/1000/10000
   items, plus the unique-primary controls. CPU selector timing only; preserve
   complete order, original object references, HTML and save bytes.
2. `audit-dice-bounds-round26.mjs --timing-pairs=12`: 144 trajectories and
   22,320 supplied frames per sample, one warmup per version, 12 alternating
   pairs. CPU bounds function only. Count trig/corner work in a separate pass;
   the timing pass has no counters or browser readback.
3. Original `qa-inventory-latency-round24.mjs`: 12 alternating pairs, 1920x1080,
   DPR 1, low effects and reduced motion. Open, weapon filter and next page are
   always measured in that order. Native trusted click to second RAF; retain
   every sample, long task, full DOM oracle, source identity and primary/mirror
   byte comparison. Reclaim markup must also be equal in this round: the old
   driver's historical exclusion does not authorize a new difference.
4. Original `qa-performance-round24.mjs --mode=frames --repeats=3`: 1920x1080
   and 3840x2160, boss burst and eternal chest, full/low effects, three paired
   repetitions per cell: 48 main windows. Fourteen separate rarity 0–6 windows
   verify effect coverage. Preserve raw intervals, long tasks, p50/p95/p99/max,
   all effect-presence failures and exact committed state checks.

## Interpretation

Work counts, CPU function duration, native click latency and browser frame
intervals are distinct results. No percentage from one is substituted for
another. Browser quantiles and bounds use the inherited floor-rank definition;
the inventory CPU script uses nearest rank and explicitly reports it. With 12
CPU samples, its p95/p99 are the maximum. The two definitions are not pooled.

The software ANGLE/SwiftShader backend and simulated viewports do not certify
the user's Windows PC, physical GPU or physical 4K 60 FPS. Functional browser
tests and synchronous pixel/context readback are not timing samples.

If a declared run fails, retain that run. Fix a demonstrated harness or product
defect, or perform a separately labelled bounded diagnostic; do not append
faster samples to erase the failure or silently change the chosen workload.
