"""Inspect existing strict RGBA evidence without changing its pass threshold.

python scripts/diagnose-rgba.py --report /external/surface-regression-round26.json
  --output /external/new-pixel-diagnosis.json
Coordinates use WebGL's bottom-left origin. Every changed pixel is retained.
This is offline evidence analysis, not a new browser execution.
"""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--report", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
source = args.report.read_bytes()
report = json.loads(gzip.decompress(source) if args.report.suffix == ".gz" else source)
result = {
    "kind": "OFFLINE_EXISTING_RGBA_ANALYSIS_NOT_BROWSER_RETEST",
    "reportSha256": hashlib.sha256(source).hexdigest(),
    "browser": report.get("browser"),
    "coordinateOrigin": "bottom-left",
    "threshold": 0,
    "pairs": [],
}
for pair in report["pairs"]:
    if "exactRGBA" not in pair:
        continue
    captures = [
        next(c for c in report["cases"]
             if c["name"] == pair["name"] and c["variant"] == variant)
        ["result"]["pixelCapture"]
        for variant in ("baseline", "current")
    ]
    buffers = []
    for capture in captures:
        raw = gzip.decompress((args.report.parent / capture["rgbaFile"]).read_bytes())
        assert hashlib.sha256(raw).hexdigest() == capture["rgbaSha256"]
        assert len(raw) == capture["width"] * capture["height"] * 4
        buffers.append(raw)
    assert captures[0]["width"] == captures[1]["width"]
    assert captures[0]["height"] == captures[1]["height"]
    width = captures[0]["width"]
    changes = []
    for offset in range(0, len(buffers[0]), 4):
        before, after = [list(raw[offset:offset + 4]) for raw in buffers]
        if before != after:
            changes.append({
                "x": offset // 4 % width, "y": offset // 4 // width,
                "before": before, "after": after,
                "delta": [b - a for a, b in zip(before, after)],
            })
    assert len(changes) == pair["exactRGBA"]["changedPixels"]
    result["pairs"].append({
        "name": pair["name"], "strictStatus": "FAIL" if changes else "PASS",
        "width": width, "height": captures[0]["height"],
        "changedPixels": len(changes),
        "maxChannelDelta": max((abs(d) for c in changes for d in c["delta"]), default=0),
        "transparentBoth": sum(c["before"][3] == c["after"][3] == 0 for c in changes),
        "alphaChanged": sum(c["delta"][3] != 0 for c in changes),
        "bounds": ([min(c["x"] for c in changes), min(c["y"] for c in changes),
                    max(c["x"] for c in changes), max(c["y"] for c in changes)]
                   if changes else None),
        "changes": changes,
    })
with args.output.open("x", encoding="utf-8") as output:
    json.dump(result, output, indent=2)
print(json.dumps([{k: v for k, v in p.items() if k != "changes"} for p in result["pairs"]]))
