# Round23 independent review and reproducible calculations

Start with `INDEPENDENT.md`. This directory contains the independent scripts and their original JSON receipts. The scripts inspect existing records; they do not launch a browser or rerun a performance window. `run_capture.py` is the original command recorder used for the two explicitly executed functional long-policy runs. The original report remains byte-for-byte unchanged; its archive-format/size statements were later amended by `../long-policy/FINAL-XZ-CONVERGENCE.md`. Performance/trajectory conclusions and the failed/open gates are unchanged.

## Evidence and conclusions

| Script | Original receipt | Input, relative to the Round23 evidence directory |
| --- | --- | --- |
| `recalculate-inventory-cpu-round23.py` | `inventory-cpu-recalculation.json` | `performance/inventory-cpu/report.json.gz` |
| `recalculate-inventory-native-round23.py` | `inventory-native-recalculation.json` | `performance/inventory-native/report.json.gz` |
| `recalculate-native-save-round23.py` | `native-save-recalculation.json` | `performance/native-save/report.json.gz` |
| `recalculate-frame-windows-round23.py` | `frame-windows-recalculation.json` | `performance/frames/performance-round.json.gz` |
| `analyze-frame-tail-attribution-round23.py` | `frame-tail-attribution.json` | The same complete frame report |
| `compare-long-policy-round23.mjs` | `long-policy-comparison.json` | Both directories under `long-policy/`, plus the original and current source trees |

The Python calculations expect the original uncompressed JSON. Restore each input gzip to a new external directory and use `--report PATH --output NEW_PATH`; output files use exclusive creation. Their input SHA is preserved in each receipt, so decompression can be checked against the original measurements. Do not edit the original raw data, the quantile definitions or the fixed sample set.

For example, from the project root, this snippet restores the four performance report inputs to a new directory without overwriting any file:

```python
from pathlib import Path
import gzip
evidence = Path('docs/iteration/evidence/round23')
destination = Path('/tmp/dice-abyss-round23-review-inputs')
destination.mkdir()  # Fails if this directory already exists.
for name in ['inventory-cpu', 'inventory-native', 'native-save', 'frames']:
    original = 'performance-round.json' if name == 'frames' else 'report.json'
    data = gzip.decompress((evidence / 'performance' / name / (original + '.gz')).read_bytes())
    with (destination / (name + '.json')).open('xb') as output:
        output.write(data)
```

Then, for example:

```sh
python docs/iteration/evidence/round23/independent/recalculate-frame-windows-round23.py --report /tmp/dice-abyss-round23-review-inputs/frames.json --output /tmp/dice-abyss-round23-frame-recalculation-new.json
```

The unchanged Node policy comparator accepts original plain JSON or `.gz` files. The four large policy reports now use XZ, so first restore all 40 originals with the bounded standard-library helper, then point the comparator at the restored directories. Supply a separate extraction of the original 5.22.0 source as `--baseline-source`; supply this unchanged 5.23.0 source as `--current-source`. It verifies all 13 originally tracked source hashes, the original strategy script and the predeclared plan. It writes only the explicit new output path outside the sources and evidence input directories.

```sh
python docs/iteration/evidence/round23/long-policy/restore-long-policy-round23.py --output /tmp/dice-abyss-round23-original-policy
node docs/iteration/evidence/round23/independent/compare-long-policy-round23.mjs --baseline /tmp/dice-abyss-round23-original-policy/baseline --current /tmp/dice-abyss-round23-original-policy/current --baseline-source /path/to/original-5.22.0/Dice-Abyss --current-source . --output /tmp/dice-abyss-round23-policy-comparison-new.json
```

The original captures' absolute workspace paths and times remain in the receipts as provenance, not as dependencies on those old paths. `long-policy-archive-verification.json` records the original gzip-stage 40-file restoration and guard checks; `long-policy-xz-archive-verification.json` records the repeated final mixed XZ/gzip restoration and the same refusals. `evidence-bytes.json` inventories the final two directories; its preceding version and both preceding READMEs are preserved under `../package/pre-xz/`. None of these records claims a final ZIP size or a completed release gate.

## Results which must remain visible

CPU full-center improvements are confined to the declared synchronous HTML calculation. Native inventory/save outcomes are mixed. All 8 main frame cells have a larger current worst interval; all 24 pair directions are retained, 14 worse and 10 better. Six of those 8 cells do not execute the changed terminal-draw callback. The cause is unresolved, and the review retains `OPEN_RISK` without a general FPS or no-regression claim. The strict final RGBA gate remains `FAILED`; later functional passes do not replace it. Both original long-policy commands retain exit 2 and the same 2 incomplete seeds. Full exported journeys are compared exactly, but absent full attempts arrays and absent successful final-state payloads are not invented or claimed as independently read.
