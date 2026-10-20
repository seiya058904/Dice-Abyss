#!/usr/bin/env python3
"""Reconstruct the exact v5.24.0 input runtime, README and launchers for Round25 A/B.

Uses only this package: seven gzip input originals and 69 unchanged current files.
Does not restore historical tests/docs or copy current-only runtime additions.
Verifies every input byte before writing to a new directory outside the project.
No third-party dependencies, network access, subprocesses or game execution.

python3 scripts/restore-runtime-baseline-round25.py --verify-only
python3 scripts/restore-runtime-baseline-round25.py --output /tmp/dice-input-round25
"""
import argparse
import gzip
import hashlib
import io
import json
import re
import stat
import sys
from pathlib import Path, PurePosixPath


ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = PurePosixPath('docs/iteration/evidence/round25/baseline/runtime')
MANIFEST_SHA256 = 'cd429edaddb6a8665d76454b9da53fe41664d0a43c7b1e7302e8e57780bcfb30'
INPUT_ZIP_SHA256 = '90784df189c75d0513b6192f2a6ada4c6f1fb199a52d96143112f5a415efd611'
ENTRY_FILES = {'README.md', 'index.html', 'favicon.svg', 'package.json',
               'scripts/launch.mjs', 'scripts/serve.mjs', '启动游戏.cmd'}
ARCHIVED_FILES = {'README.md', 'index.html', 'package.json', 'src/app.js',
                  'src/effects.js', 'src/release.js', 'src/views.js'}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def safe_relative(value):
    require(isinstance(value, str) and value, 'Path must be a nonempty string')
    require(not any(c in value for c in ('\\', ':', '\x00')), 'Unsafe path: ' + value)
    require(all(part not in ('', '.', '..') for part in value.split('/')),
            'Unsafe path: ' + value)
    rel = PurePosixPath(value)
    require(not rel.is_absolute(), 'Absolute input path is forbidden')
    return rel


def read_regular(rel, maximum_bytes):
    """Bound reads and reject symlinks in all package-relative path components."""
    target = ROOT
    for part in rel.parts:
        target = target / part
        require(not target.is_symlink(), 'Symlink source is forbidden: ' + str(rel))
    require(stat.S_ISREG(target.stat().st_mode), 'Not a regular file: ' + str(rel))
    require(target.stat().st_size <= maximum_bytes, 'Oversized file: ' + str(rel))
    with target.open('rb') as handle:
        data = handle.read(maximum_bytes + 1)
    require(len(data) <= maximum_bytes, 'Oversized file: ' + str(rel))
    return data


def identity(data, size, digest, label):
    require(type(size) is int and 0 <= size <= 10_000_000, 'Invalid byte count: ' + label)
    require(isinstance(digest, str) and re.fullmatch('[0-9a-f]{64}', digest),
            'Invalid SHA-256: ' + label)
    require(len(data) == size and hashlib.sha256(data).hexdigest() == digest,
            'Input identity mismatch: ' + label)


def load_payloads():
    raw_manifest = read_regular(ARCHIVE / 'manifest.json', 200_000)
    require(hashlib.sha256(raw_manifest).hexdigest() == MANIFEST_SHA256,
            'Bundled input manifest identity mismatch')
    manifest = json.loads(raw_manifest)
    require(manifest['schema'] == 1 and manifest['inputVersion'] == '5.24.0'
            and manifest['inputZipSha256'] == INPUT_ZIP_SHA256,
            'Unexpected input manifest version')
    rows = manifest['inputRuntimeManifest']
    require(len(rows) == manifest['runtimeFileCount'] == 76, 'Expected 76 input files')
    originals = {row['path']: row for row in manifest['originalChangedFiles']}
    require(len(manifest['originalChangedFiles']) == len(originals) == 7
            and set(originals) == ARCHIVED_FILES, 'Unexpected archived input file set')
    seen = set()
    payloads = []
    for row in rows:
        rel = safe_relative(row['path'])
        require(row['path'] in ENTRY_FILES or rel.parts[0] == 'src',
                'File outside input runtime scope: ' + row['path'])
        require(row['path'] != 'src/inventory-page.js', 'Current-only file in input manifest')
        require(row['path'].casefold() not in seen, 'Duplicate input path: ' + row['path'])
        seen.add(row['path'].casefold())
        size = row['bytes']
        require(type(size) is int and 0 <= size <= 10_000_000, 'Invalid input byte count')
        if row['path'] in originals:
            original = originals[row['path']]
            require(row['source'] == 'archived-input' and original['bytes'] == size
                    and original['sha256'] == row['sha256'], 'Archive/input row mismatch')
            require(original['gzipPath'] == 'original/' + row['path'] + '.gz',
                    'Unexpected gzip source path')
            packed_size = original['gzipBytes']
            require(type(packed_size) is int and 0 < packed_size <= 1_000_000,
                    'Invalid gzip byte count')
            packed = read_regular(ARCHIVE / safe_relative(original['gzipPath']), packed_size)
            identity(packed, packed_size, original['gzipSha256'], original['gzipPath'])
            with gzip.GzipFile(fileobj=io.BytesIO(packed), mode='rb') as handle:
                data = handle.read(size + 1)
        else:
            require(row['source'] == 'unchanged-current', 'Unexpected input source')
            data = read_regular(rel, size)
        identity(data, size, row['sha256'], row['path'])
        payloads.append((rel, data))
    require(sum(len(data) for _, data in payloads) == manifest['runtimeBytes'] == 9_733_584,
            'Expected 9,733,584 input runtime bytes')
    require(ENTRY_FILES.issubset({str(rel) for rel, _ in payloads}),
            'Missing input README or launcher')
    return manifest, payloads


def new_output(value):
    output = Path(value).expanduser().absolute()
    require('..' not in output.parts, 'Use an output path without ..')
    require(not output.exists() and not output.is_symlink(), 'Output must be a new directory')
    require(output != ROOT and ROOT not in output.parents, 'Keep output outside the project')
    for parent in output.parents:
        require(not parent.is_symlink(), 'Symlink output parent is forbidden: ' + str(parent))
        require(not parent.exists() or parent.is_dir(), 'Output parent is not a directory')
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--output', metavar='NEW_DIRECTORY', help='Restore to a new directory outside this project')
    mode.add_argument('--verify-only', action='store_true', help='Verify all required inputs without creating files')
    args = parser.parse_args()
    try:
        output = new_output(args.output) if args.output else None
        manifest, payloads = load_payloads()
        if output is not None:
            output.mkdir(parents=True, exist_ok=False)
            for rel, data in payloads:
                target = output / rel
                target.parent.mkdir(parents=True, exist_ok=True)
                with target.open('xb') as handle:
                    handle.write(data)
        print(json.dumps({
            'status': 'RESTORED_AND_HASH_VERIFIED' if output is not None else 'INPUTS_HASH_VERIFIED',
            'inputVersion': manifest['inputVersion'], 'inputZipSha256': INPUT_ZIP_SHA256,
            'manifestSha256': MANIFEST_SHA256, 'files': len(payloads),
            'bytes': sum(len(data) for _, data in payloads),
            'archivedInputFiles': 7, 'unchangedCurrentFiles': 69,
            'excludedCurrentOnlyFiles': ['src/inventory-page.js'],
            'output': str(output) if output is not None else None,
            'scope': manifest['scope']
        }, ensure_ascii=False))
        return 0
    except (OSError, ValueError, KeyError, TypeError, EOFError) as exc:
        print(json.dumps({'status': 'FAILED', 'error': str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
