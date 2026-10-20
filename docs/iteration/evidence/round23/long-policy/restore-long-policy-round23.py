#!/usr/bin/env python3
"""Restore all mapped original policy outputs into an external empty directory."""
import argparse
import gzip
import hashlib
import io
import json
import lzma
import os
from pathlib import Path, PurePosixPath
import re


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def no_symlinks(path):
    path = Path(os.path.abspath(path))
    for entry in [path, *path.parents]:
        require(not entry.is_symlink(), 'Symbolic links are not accepted: ' + str(entry))
    return path


def checked_relative(name):
    require(isinstance(name, str) and '\\' not in name and '\x00' not in name, 'Invalid mapped path')
    path = PurePosixPath(name)
    require(not path.is_absolute() and len(path.parts) == 2 and path.parts[0] in ['baseline', 'current'],
            'Mapped paths must stay under baseline/ or current/')
    require(all(part not in ['', '.', '..'] for part in name.split('/')), 'Unsafe mapped path')
    return Path(*path.parts)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    choice = parser.add_mutually_exclusive_group(required=True)
    choice.add_argument('--output', type=Path)
    choice.add_argument('--verify-only', action='store_true')
    args = parser.parse_args()
    archive = Path(__file__).resolve().parent
    manifest_path = no_symlinks(archive / 'archive-map.json')
    require(manifest_path.is_file() and manifest_path.stat().st_size < 1_000_000, 'Invalid mapping size')
    manifest_raw = manifest_path.read_bytes()
    manifest = json.loads(manifest_raw)
    require(manifest['schema'] == 'dice-abyss-round23-long-policy-archive-v1', 'Unknown mapping schema')
    entries = manifest['entries']
    require(len(entries) == 40, 'Expected all 40 original files')
    output = None
    if args.output is not None:
        output = no_symlinks(args.output)
        protected = [archive]
        protected += [p for p in archive.parents if (p / 'src/storage.js').is_file() and (p / 'package.json').is_file()]
        require(not any(output == p or p in output.parents for p in protected),
                'Restoration must be outside the project and evidence archive')
        require(not output.exists() or (output.is_dir() and not any(output.iterdir())),
                'Output must be absent or an empty directory; overwriting is forbidden')
    originals, seen, payload_total, archive_total = [], set(), 0, 0
    for entry in entries:
        name = checked_relative(entry['original'])
        stored = no_symlinks(archive / checked_relative(entry['archived']))
        require(name not in seen, 'Duplicate original path')
        seen.add(name)
        original_size, stored_size = entry['originalBytes'], entry['archivedBytes']
        require(type(original_size) is int and 0 <= original_size <= 50_000_000, 'Invalid original size')
        require(type(stored_size) is int and 0 <= stored_size <= 50_000_000, 'Invalid archive size')
        payload_total += original_size
        require(payload_total <= 100_000_000, 'Total original size exceeds the fixed bound')
        require(stored.is_file() and stored.stat().st_size == stored_size, 'Archived file size mismatch')
        raw = stored.read_bytes()
        for field in ['originalSha256', 'archivedSha256']:
            require(re.fullmatch('[0-9a-f]{64}', entry[field]) is not None, 'Invalid SHA-256')
        require(sha(raw) == entry['archivedSha256'], 'Archived SHA-256 mismatch: ' + str(stored))
        if entry['encoding'] == 'gzip':
            with gzip.GzipFile(fileobj=io.BytesIO(raw), mode='rb') as compressed:
                original = compressed.read(original_size + 1)
        elif entry['encoding'] == 'xz':
            with lzma.LZMAFile(io.BytesIO(raw), mode='rb', format=lzma.FORMAT_XZ) as compressed:
                original = compressed.read(original_size + 1)
        else:
            require(entry['encoding'] == 'identity', 'Unknown archive encoding')
            original = raw
        require(len(original) == original_size and sha(original) == entry['originalSha256'],
                'Restored bytes/SHA-256 mismatch: ' + str(name))
        archive_total += len(raw)
        originals.append((name, original, entry['originalSha256']))
    require(payload_total == manifest['totals']['originalBytes'], 'Mapping original total mismatch')
    require(archive_total == manifest['totals']['archivedPayloadBytes'], 'Mapping archive total mismatch')
    # Verify every compressed and decompressed byte before making any output directory.
    if output is not None:
        no_symlinks(output)
        require(not output.exists() or not any(output.iterdir()), 'Output became non-empty')
        output.mkdir(parents=True, exist_ok=True)
        for name, original, expected in originals:
            target = no_symlinks(output / name)
            target.parent.mkdir(parents=True, exist_ok=True)
            no_symlinks(target)
            with target.open('xb') as file:
                file.write(original)
            require(sha(target.read_bytes()) == expected, 'Post-write verification failed')
    print(json.dumps({'status': 'PASS', 'mode': 'verify-only' if output is None else 'restore',
                      'originalFiles': len(originals), 'originalBytes': payload_total,
                      'archivedPayloadBytes': archive_total, 'mappingSha256': sha(manifest_raw),
                      'output': None if output is None else str(output)}))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError, EOFError, json.JSONDecodeError, lzma.LZMAError) as error:
        raise SystemExit('Refused: ' + str(error))
