# Round25 · Independent bounded native pixel follow-up

## Verdict

The original strict native A/B result remains **17/18 PASS, one strict failure**. In three root-authorized repeat groups, **all nine comparisons reproduced exactly the same two-byte/two-pixel failure**. The eighteen newly captured complete RGBA buffers equal the original corresponding capture-slot buffer byte for byte, regardless of source version. This isolates an association with the first/second browser context or capture slot, not a source-version requirement. It does not identify the browser's raster cause and does not make the strict gate pass.

The particle candidate may remain on its controlled submitted-work evidence. It cannot be advertised as fully native pixel-equivalent or as a proven FPS improvement. Root owns the final retention and frame-performance decision. No runtime change was made during this investigation.

## Exact bounded protocol

Existing script: `scripts/qa-effects-pixels-round14.mjs`, SHA256 `debfe798f18163f179800e271730765f478ad666d0f83c7d495dad02efb88600`.

All groups used `--names=loot-7 --sizes=3840x2160 --repeats=3`, real Canvas2D readback at supplied elapsed 300 ms, Chromium 155.0.8059.84, Linux headless shell, SwiftShader launch configuration, DPR 1. The requested native Playwright script was explicitly authorized by root; no extra Browser session, pixel normalization, flag experiment or tolerance change was used. This is a complete-DOM diagnostic with app startup isolated and controlled visual timestamps, not natural gameplay latency or physical 4K certification.

| Group | Source roots / URLs | Strict outcome | Original difference reproduced |
| --- | --- | --- | --- |
| Baseline / baseline | immutable input twice; 4188 / 4188 | 0/3 PASS | 3/3 |
| Current / current | working source twice; 4189 / 4189 | 0/3 PASS | 3/3 |
| Baseline / current | input / working; 4188 / 4189 | 0/3 PASS | 3/3 |

All three reports have `sourceStable=true`, zero console/page errors and exact served-source verification. Same-version pairs also have identical complete HTML. The inputs in each group share exact geometry, elapsed sample and lifecycle records; the only failing readback quantities are the same RGBA hash, alpha sum and nontransparent count. Native command recording was not added: the separate 66-case command/state audit supplies submitted-program evidence.

Output reports and all RGBA buffers remain under:

- `qa-round25/effect-pixels/effects-pixels-round14.json` — original 18 pairs, retained unmodified.
- `qa-round25/pixel-repeat-baseline/effects-pixels-round14.json`.
- `qa-round25/pixel-repeat-current/effects-pixels-round14.json`.
- `qa-round25/pixel-repeat-paired/effects-pixels-round14.json`.

`agent-notes/pixel-repeat-round25.json` contains report hashes, source identities, all differences and the explicit decompressed-buffer comparisons. No additional native cases were started.

## Capture-slot identities

Each of the first-slot captures has SHA256 `85afc6326ec0dc488a2f2cded4b986f6ab4ec54e61ae60080096bc4bf9768179`. Each second-slot capture has SHA256 `1e2bde876c4b3465d72fe43c5cf89415a0edbed13b33320fb8383480a678dbb8`.

The first slot has 119,479 nontransparent pixels and alpha sum 4,363,832; the second has 119,478 and 4,363,831. Every buffer is 756×712×4 = 2,153,088 bytes. These are stable per slot across all requested repeats, not merely intermittent random noise.

| Canvas pixel | First slot RGBA | Second slot RGBA | Changed channel |
| --- | --- | --- | --- |
| (473, 701) | [85, 170, 170, 3] | [85, 85, 170, 3] | green |
| (473, 702) | [0, 0, 0, 1] | [0, 0, 0, 0] | alpha |

## Static layer clue, not a raster root cause

Using the recorded Canvas rectangle and dimensions, these pixel centers map to screenshot CSS x≈2113.217, y≈1615.547 / 1617.748. Inspection of the saved scene and the raw alpha neighborhood places them at the lower end of a narrow vertical edge beside the loot card. Columns 473–477 form a continuing vertical strip through rows 675–699, taper at 700–702, and are empty at 703–704. This matches the right-card `rewardRims` cached material's lower endpoint more closely than the rising particles around the chest.

In effects.js, rewardRims are created from the real `.loot-reveal .item-card` rectangle and drawn by `drawReward` before `drawParticles`. The setter candidate does not change their construction. A per-material native readback was not performed, so this remains a source/geometry clue rather than proof of which raster stage differs. The supplied three-group scope is complete; no layer-removal or reordered-context test was added.

The WHATWG HTML standard, actually opened on 2026-10-20, specifies premultiplied alpha for Canvas2D output and explains loss of precision when converting representations: https://html.spec.whatwg.org/multipage/canvas.html#premultiplied-alpha-and-the-2d-rendering-context . At alpha 3, green 170 versus 85 is mathematically compatible with premultiplied component 2 versus 1 (170×3/255=2; 85×3/255=1). That explains how a low-alpha channel can display a large unpremultiplied delta; it is not an excuse to ignore 85, alter pixels, or declare the implementation cause solved. This Canvas2D failure must not be relabeled as a proven historical WebGL DITHER issue.
