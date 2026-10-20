#!/usr/bin/env python3
"""Reconstruct the exact input runtime in a new directory for Round24 A/B.

No third-party dependencies. This restores runtime bytes, not old test/docs history.
python3 scripts/restore-runtime-baseline-round24.py --output /tmp/dice-input-runtime
"""
from pathlib import Path, PurePosixPath
import argparse, json, gzip, hashlib

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
source = root/'docs/iteration/evidence/round24/baseline/runtime'
manifest = json.loads((source/'manifest.json').read_text())
output = Path(args.output).absolute()
assert not output.exists() and not output.is_symlink(), 'Output must be a new directory'
assert root != output.resolve() and root not in output.resolve().parents, 'Keep A/B output outside the project'
originals = {row['path']:row for row in manifest['originalChangedFiles']}
payloads = []
for row in manifest['inputRuntimeManifest']:
    rel = PurePosixPath(row['path'])
    assert not rel.is_absolute() and all(part not in ('..','.','') for part in rel.parts)
    data = gzip.decompress((source/originals[row['path']]['gzipPath']).read_bytes()) if row['path'] in originals else (root/rel).read_bytes()
    assert len(data) == row['bytes'] and hashlib.sha256(data).hexdigest() == row['sha256'], 'Input identity mismatch: '+str(rel)
    payloads.append((rel,data))
output.mkdir(parents=True,exist_ok=False)
for rel,data in payloads:
    target=output/rel;target.parent.mkdir(parents=True,exist_ok=True)
    with target.open('xb') as handle:handle.write(data)
print(json.dumps({'status':'RESTORED_AND_HASH_VERIFIED','inputVersion':'5.23.0','files':len(payloads),'output':str(output),'scope':'Exact runtime only; not old tests or documentation'},ensure_ascii=False))
