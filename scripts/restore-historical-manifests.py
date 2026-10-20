"""Restore the 16 losslessly archived manifests into an external empty directory.

Usage: python scripts/restore-historical-manifests.py --output /tmp/dice-manifests
The original project and historical reports are never overwritten.
"""
from pathlib import Path, PurePosixPath
import argparse
import gzip
import hashlib
import json


def require(condition, message):
    if not condition:
        raise SystemExit(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def relative_path(value):
    require(isinstance(value, str) and '\\' not in value, 'Invalid mapped path')
    path = PurePosixPath(value)
    require(not path.is_absolute() and '..' not in path.parts and
            value == path.as_posix(), 'Mapped path must be a canonical relative path')
    require(path.parent.as_posix() == 'docs/iteration/archives',
            'Only historical manifest paths may be restored')
    return Path(*path.parts)


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--project', type=Path, default=Path(__file__).resolve().parents[1])
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
project, output = args.project.resolve(), args.output.resolve()
require(output != project and project not in output.parents,
        'Use an empty output directory outside the project')
require(not output.exists() or (output.is_dir() and not any(output.iterdir())),
        'The output directory must be empty; existing files are never overwritten')
mapping_path = project / 'docs/iteration/evidence/round22/package/historical-manifests.json'
mapping = json.loads(mapping_path.read_text(encoding='utf-8'))
require(mapping['format'] == 'dice-abyss-historical-manifests-gzip-v1',
        'Unsupported historical manifest mapping')
require(len(mapping['files']) == 16, 'Expected the 16 mapped historical manifests')

prepared, seen = [], set()
for row in mapping['files']:
    original = relative_path(row['originalPath'])
    packed_path = relative_path(row['gzipPath'])
    require(original.as_posix() not in seen, 'Duplicate restoration path')
    require(original.name.startswith('round') and original.name.endswith('-manifest.json') and
            packed_path.as_posix() == original.as_posix() + '.gz',
            'Unexpected historical manifest filename')
    seen.add(original.as_posix())
    packed = (project / packed_path).read_bytes()
    require(len(packed) == row['gzipBytes'] and sha(packed) == row['gzipSha256'],
            f'Compressed bytes or SHA-256 differ: {packed_path}')
    raw = gzip.decompress(packed)
    require(len(raw) == row['originalBytes'] and sha(raw) == row['originalSha256'],
            f'Restored bytes or SHA-256 differ: {original}')
    prepared.append((original, raw))

# Validate every compressed input before creating any restored output.
output.mkdir(parents=True, exist_ok=True)
for relative, raw in prepared:
    target = output / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open('xb') as stream:
        stream.write(raw)
    require(target.read_bytes() == raw, f'Restored file readback differs: {relative}')
print(json.dumps({'restoredFiles': len(prepared),
                  'restoredBytes': sum(len(raw) for _, raw in prepared),
                  'allOriginalHashesVerified': True, 'output': str(output)}, indent=2))
