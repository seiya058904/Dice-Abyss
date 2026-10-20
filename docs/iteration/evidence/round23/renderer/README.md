# Round23 renderer diagnostics — failed gates retained

`attempt01` is the recorded launch failure: the ESM driver was given Playwright's CommonJS entry and the named `chromium` import was unavailable. It never launched a browser. The next attempt used the existing `index.mjs`; the original placeholder and failure record remain.

`attempt02` tried moving invariant face-value lookup from fragment to vertex shader. `attempt03` tried restoring the integer face value. Both candidates were withdrawn. `final-attempt04` ran after `src/dice-renderer.js` was restored byte for byte to the uploaded input. All three raw reports remain unchanged, compressed as gzip. The three patches and `FINAL_DIAGNOSTIC.md` describe what was tried, retained and withdrawn.

The final strict zero-difference RGBA gate is **FAILED**: 7/12 fixed scenes are exact, five differ by one channel level at some pixels, and both terminal scenes differ. The baseline's own automatic native context restoration differs at four pixels and stops the driver before current restoration or `sourcesAfter`. Functional restoration is tested separately under `../browser/`; that passing result does not replace this failed gate. The unchanged renderer and exactly repeated attempt03/04 buffer hashes prevent attributing this failure to the withdrawn shader.

## Complete raw buffers

`raw-buffer-manifest.json` maps all **92 original RGBA gzip references** from attempts02/03/04 to **28 unique, complete RGBA byte streams** in `rgba/*.rgba.xz`. They occupy **2,137,108 bytes**. Python's standard-library `lzma.decompress` restores each exact byte stream; verify both the compressed SHA and `decodedSha256` in the manifest. This is lossless content deduplication and compression, with no crop, masking, alpha removal, channel tolerance or discarded negative sample. Original gzip-container hashes are preserved as provenance; the canonical xz container has a different hash. Dimensions and original filename references remain in each original report.

The root independently decompressed all 28 xz objects and verified their complete decoded SHA/length. Full-size duplicate PNG screenshots were excluded from the delivery budget. Every raw pixel needed to reproduce them is retained. Existing scratch-relative screenshot names inside the unchanged diagnostic are historical execution paths, not missing runtime dependencies.

## What the positive result proves

Two component fixtures drive production `mountEffects`/`animateDice` and real WebGL calls using explicitly synthetic rAF timestamps. At both 100 and 160 CSS-pixel dice widths, six-dice terminal submissions change **12 → 6 `drawElements`**. The final rest buffer, 1,800,000-pixel budget, DOM pose and completion/cancellation contract remain covered. Width/height assignments remain **2 → 2**, not fewer.

This is a work-count result. It neither measures real-game FPS nor closes the negative frame-tail results in `../performance/`. No independent shader-latency experiment was completed or claimed.
