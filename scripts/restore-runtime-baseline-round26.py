#!/usr/bin/env python3
"""Restore one exact historical input runtime using this complete package only.

The round is the iteration which received the input: --round=24 restores
v5.23.0, --round=25 restores v5.24.0, and the default --round=26 restores
v5.25.0. Old tests and documentation are not reconstructed. Every selected
input byte is checked before a new output directory is created.

python3 scripts/restore-runtime-baseline-round26.py --verify-only
python3 scripts/restore-runtime-baseline-round26.py --round=25 --verify-only
python3 scripts/restore-runtime-baseline-round26.py --output /tmp/dice-input-26

No external packages, network, subprocesses, or game execution are used.
"""
import argparse
import gzip
import hashlib
import io
import json
import re
import stat
import sys
import zlib
from pathlib import Path, PurePosixPath


ROOT = Path(__file__).resolve().parents[1]
ENTRY_FILES = {'README.md', 'index.html', 'favicon.svg', 'package.json',
               'scripts/launch.mjs', 'scripts/serve.mjs', '启动游戏.cmd'}
MAX_FILE_BYTES = 10_000_000
MAX_RUNTIME_BYTES = 20_000_000
PINS = {
    24: {
        'version': '5.23.0', 'files': 75, 'bytes': 9_713_580,
        'zip': 'fab99f295a0c2318472e4b0dd0b6a9fed61ec9cb225640bdee090e6b5a807163',
        'manifest': '6d8aa799ad4cfe534479f472c048a5e4ae3388bb8fc1c701aaf3e1f9ef8f06c5',
    },
    25: {
        'version': '5.24.0', 'files': 76, 'bytes': 9_733_584,
        'zip': '90784df189c75d0513b6192f2a6ada4c6f1fb199a52d96143112f5a415efd611',
        'manifest': 'cd429edaddb6a8665d76454b9da53fe41664d0a43c7b1e7302e8e57780bcfb30',
    },
    26: {
        'version': '5.25.0', 'files': 77, 'bytes': 9_736_977,
        'zip': 'e584e4d0ae24b5db78a3d83912a58185c69caea9da805efe73cdac4a5b27b698',
        # Canonical path/bytes/SHA rows calculated from the isolated uploaded
        # input, independently of which files this iteration later changes.
        'rows': '4a2d1cf325327512939872835024aeef06662a698f2e534b18b0c658ff28107e',
    },
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def safe_relative(value):
    require(isinstance(value, str) and value, 'Path must be a nonempty string')
    require(not any(ord(c) < 32 or c in '\\:<>"|?*' for c in value),
            'Unsafe path: ' + value)
    require(all(part not in ('', '.', '..') and part.rstrip(' .') == part
                for part in value.split('/')), 'Noncanonical path: ' + value)
    rel = PurePosixPath(value)
    require(not rel.is_absolute(), 'Absolute source path is forbidden')
    return rel


def read_regular(base, rel, maximum_bytes):
    target = base
    for part in rel.parts:
        target = target / part
        require(not target.is_symlink(), 'Symlink source is forbidden: ' + str(rel))
    require(stat.S_ISREG(target.stat().st_mode), 'Not a regular file: ' + str(rel))
    require(target.stat().st_size <= maximum_bytes, 'Oversized file: ' + str(rel))
    with target.open('rb') as handle:
        data = handle.read(maximum_bytes + 1)
    require(len(data) <= maximum_bytes, 'Oversized file: ' + str(rel))
    return data


def valid_identity(row, label):
    require(type(row['bytes']) is int and 0 <= row['bytes'] <= MAX_FILE_BYTES,
            'Invalid byte count: ' + label)
    require(isinstance(row['sha256'], str)
            and re.fullmatch('[0-9a-f]{64}', row['sha256']), 'Invalid SHA-256: ' + label)


def matches(data, row):
    return len(data) == row['bytes'] and sha(data) == row['sha256']


def load_manifest(round_number):
    archive = PurePosixPath(f'docs/iteration/evidence/round{round_number}/baseline/runtime')
    raw = read_regular(ROOT, archive / 'manifest.json', 200_000)
    pin = PINS[round_number]
    if 'manifest' in pin:
        require(sha(raw) == pin['manifest'], 'Historical manifest identity mismatch')
    manifest = json.loads(raw)
    require(manifest['inputZipSha256'] == pin['zip'], 'Unexpected input ZIP identity')
    if round_number >= 25:
        require(manifest['schema'] == 1 and manifest['inputVersion'] == pin['version']
                and manifest['iterationRound'] == round_number,
                'Unexpected manifest schema, round or version')
    rows = manifest['inputRuntimeManifest']
    require(isinstance(rows, list) and len(rows) == pin['files'],
            'Unexpected input runtime file count')
    canonical, seen, paths = [], set(), set()
    for row in rows:
        rel = safe_relative(row['path'])
        require(row['path'] in ENTRY_FILES or rel.parts[0] == 'src',
                'File outside runtime scope: ' + row['path'])
        require(row['path'].casefold() not in seen, 'Duplicate input path: ' + row['path'])
        seen.add(row['path'].casefold())
        paths.add(row['path'])
        valid_identity(row, row['path'])
        canonical.append({key: row[key] for key in ('path', 'bytes', 'sha256')})
    for name in paths:
        require(not any(str(parent).casefold() in seen
                        for parent in PurePosixPath(name).parents if str(parent) != '.'),
                'File/directory prefix conflict: ' + name)
    require(sum(row['bytes'] for row in rows) == pin['bytes'] <= MAX_RUNTIME_BYTES,
            'Unexpected input runtime byte count')
    required_entries = ENTRY_FILES - ({'README.md'} if round_number == 24 else set())
    require(required_entries.issubset(paths), 'Missing runtime entry or launcher')
    if 'rows' in pin:
        canonical.sort(key=lambda row: row['path'])
        encoded = json.dumps(canonical, ensure_ascii=False, sort_keys=True,
                             separators=(',', ':')).encode('utf-8')
        require(sha(encoded) == pin['rows'], 'Uploaded input runtime identity mismatch')
    if round_number >= 25:
        require(manifest['runtimeFileCount'] == pin['files']
                and manifest['runtimeBytes'] == pin['bytes'], 'Manifest totals mismatch')
    originals = {}
    by_path = {row['path']: row for row in rows}
    for original in manifest['originalChangedFiles']:
        name = original['path']
        require(name in by_path and name not in originals, 'Unexpected archived input path')
        valid_identity(original, name)
        row = by_path[name]
        require(original['bytes'] == row['bytes'] and original['sha256'] == row['sha256'],
                'Archive/input identity mismatch: ' + name)
        packed_rel = safe_relative(original['gzipPath'])
        expected = (('original/' if round_number >= 25 else '') + name + '.gz')
        require(str(packed_rel) == expected, 'Unexpected gzip source path: ' + name)
        if round_number >= 25:
            require(type(original['gzipBytes']) is int
                    and 0 < original['gzipBytes'] <= MAX_FILE_BYTES,
                    'Invalid gzip byte count')
            require(re.fullmatch('[0-9a-f]{64}', original['gzipSha256']),
                    'Invalid gzip SHA-256')
        originals[name] = original
    if round_number >= 25:
        for row in rows:
            expected = 'archived-input' if row['path'] in originals else 'unchanged-current'
            require(row['source'] == expected, 'Unexpected runtime source: ' + row['path'])
    return {'round': round_number, 'archive': archive, 'rawSha256': sha(raw),
            'manifest': manifest, 'rows': rows, 'originals': originals}


def archived_payload(bundle, original):
    packed = read_regular(ROOT, bundle['archive'] / safe_relative(original['gzipPath']),
                          MAX_FILE_BYTES)
    if bundle['round'] >= 25:
        require(len(packed) == original['gzipBytes']
                and sha(packed) == original['gzipSha256'], 'Archived gzip identity mismatch')
    with gzip.GzipFile(fileobj=io.BytesIO(packed), mode='rb') as handle:
        data = handle.read(original['bytes'] + 1)
    require(matches(data, original), 'Decoded input identity mismatch: ' + original['path'])
    return data


def load_payloads(round_number):
    selected = load_manifest(round_number)
    supplement = selected if round_number == 26 else load_manifest(26)
    counts = {'archived-input': 0, 'unchanged-current': 0, 'round26-original': 0}
    payloads, fallback_paths = [], []
    for row in selected['rows']:
        name, rel = row['path'], safe_relative(row['path'])
        if name in selected['originals']:
            data = archived_payload(selected, selected['originals'][name])
            source = 'archived-input'
        else:
            try:
                data = read_regular(ROOT, rel, MAX_FILE_BYTES)
            except FileNotFoundError:
                data = b''
            source = 'unchanged-current'
            if not matches(data, row):
                original = supplement['originals'].get(name)
                require(original is not None and original['bytes'] == row['bytes']
                        and original['sha256'] == row['sha256'],
                        'No exact historical source for: ' + name)
                data = archived_payload(supplement, original)
                source = 'round26-original'
                fallback_paths.append(name)
        require(matches(data, row), 'Input identity mismatch: ' + name)
        counts[source] += 1
        payloads.append((rel, data))
    return selected, payloads, counts, fallback_paths


def new_output(value):
    output = Path(value).expanduser().absolute()
    require('..' not in output.parts, 'Use an output path without ..')
    require(not output.exists() and not output.is_symlink(), 'Output must be a new directory')
    require(output != ROOT and ROOT not in output.parents, 'Keep output outside the project')
    for parent in output.parents:
        require(not parent.is_symlink(), 'Symlink output parent is forbidden')
        require(not parent.exists() or parent.is_dir(), 'Output parent is not a directory')
    return output


def write_payloads(output, payloads):
    output.mkdir(parents=True, exist_ok=False)
    for rel, data in payloads:
        target = output / rel
        require(not output.is_symlink(), 'Output directory changed')
        for parent in (target, *target.parents):
            if parent == output:
                break
            require(not parent.is_symlink(), 'Symlink in output path')
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open('xb') as handle:
            handle.write(data)
    for rel, data in payloads:
        require(read_regular(output, rel, len(data)) == data,
                'Written output identity mismatch: ' + str(rel))


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--round', type=int, choices=sorted(PINS), default=26,
                        help='Iteration receiving the input (default: 26, input v5.25.0)')
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--output', metavar='NEW_DIRECTORY')
    mode.add_argument('--verify-only', action='store_true')
    args = parser.parse_args()
    try:
        output = new_output(args.output) if args.output else None
        bundle, payloads, counts, fallback_paths = load_payloads(args.round)
        if output is not None:
            write_payloads(output, payloads)
        print(json.dumps({
            'status': 'RESTORED_AND_HASH_VERIFIED' if output is not None else 'INPUTS_HASH_VERIFIED',
            'iterationRound': args.round, 'inputVersion': PINS[args.round]['version'],
            'inputZipSha256': PINS[args.round]['zip'], 'manifestSha256': bundle['rawSha256'],
            'files': len(payloads), 'bytes': sum(len(data) for _, data in payloads),
            'resolvedSources': counts, 'round26FallbackPaths': fallback_paths,
            'output': str(output) if output is not None else None,
            'scope': 'Exact selected input runtime only; no historical tests or documentation.',
        }, ensure_ascii=False))
        return 0
    except (OSError, ValueError, KeyError, TypeError, EOFError, zlib.error) as exc:
        print(json.dumps({'status': 'FAILED', 'error': str(exc)}, ensure_ascii=False),
              file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
