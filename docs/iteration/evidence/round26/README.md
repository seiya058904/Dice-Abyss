# Round26 evidence index

These are actual measurements from the supplied v5.25.0 and current v5.26.0. Formal performance sampling ran serially after full regression/simulation. See the predeclared PERFORMANCE_PROTOCOL.md and top-level PERFORMANCE / VERIFY for precise denominators, quantiles, slow values and environment limits.

## Contents

- `baseline/runtime/manifest.json` and `original/*.gz`: exact uploaded runtime reconstruction inputs. Use `scripts/restore-runtime-baseline-round26.py`, default round26; `--round=24/25` restore older pinned inputs. Old helpers remain historical and fail against changed current dependencies as recorded.
- `regression/baseline/` and `regression/current/`: complete command outputs, native TAP plus summaries, full simulation stdout, HTTP and current font audits. Gzip decoding preserves every source byte.
- `performance/`: all 18-cell inventory CPU and 144-trajectory bounds work/timing data; native inventory 72 measured +6 warmup actions; native frames 48 main +14 coverage windows with every interval; independent recomputation and actual command receipts.
- `browser/`: core, inventory navigation, resize, visible context restore, all surface regression records and the fixed 8-pair same-version diagnostic. Functional PASS does not erase strict RGBA failures. Source guards, warnings and all unsuccessful pixel runs remain recorded.
- `reconstruction/`: six actual verify/restore successes, independent source review and original legacy helper failure receipts.
- `audit/`: exact runtime change list, old-file invariants, targeted work/output-guard results and initial test failure evidence.
- `visual/rgba-storage-map.json`: all30 logical native captures resolve to8 exact byte-identical gzip objects. Every strict failing buffer is complete, including transparent RGB and alpha. No lossy image substitutes for these captures.
- `screenshots/`: one selected actual browser screenshot at original dimensions, lossless WebP; decoded RGBA equality verified. The screenshot manifest retains the source PNG hash and explicitly identifies omitted redundant positive acquisitions. Raw acquisition reports may name those original PNGs; they are optional visual captures, not missing runtime dependencies.
- `STORAGE_MANIFEST.json`: logical acquisition paths to packaged paths, bytes and SHA-256. Its original source paths describe this round's scratch acquisition environment, not required local paths for the next executor.
- `package/`: added after the source-identical candidate's real fresh extraction gate. The final archive's own identity and exact-final-entity gate remain outside the ZIP to avoid self-reference.

## Resolve a raw RGBA reference

Look up the report-relative path (for example `browser/surface-regression/current-motion-160.rgba.gz`) in `visual/rgba-storage-map.json`. Read `storedObject` under this evidence directory. Its gzip bytes equal the original acquisition file; standard gzip decompression yields the complete `rgbaBytes`, checked by `rgbaSha256`. Dimensions and capture metadata stay in the original report. Duplicate references only share identical bytes; mismatching captures are never merged.

All old historical evidence and tests remain in the complete project. Original source documents modified this round are archived as exact gzip bytes, with original-size/SHA receipts in `baseline/`. No previous ZIP, external image download, private save, temporary capture directory or prior conversation is needed to run the game or reconstruct the declared baselines.

## Actual fresh-extraction gate

`package/source-fresh-gate/` contains the actual source-identical candidate archive receipt, full 100-module/923-case native TAP and summary, syntax/HTTP command logs, all 66 HTTP resource checks, and the frozen 358-file execution identity. The candidate was tested before this evidence was embedded. Every file and the candidate archive remained unchanged during its gate. The final shipping archive requires a separate exact-entity extraction and the same checks after sealing; its SHA256 and final gate receipt remain external.
