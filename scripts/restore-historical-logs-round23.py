#!/usr/bin/env python3
"""Restore the 19 losslessly archived Round23 historical logs.

Use Python's standard library and an empty directory outside the project:
  python scripts/restore-historical-logs-round23.py --output /tmp/dice-old-logs

The archive mapping retains each original path, byte count and SHA-256. All
compressed and original bytes are verified before any output is created. This
optional audit utility is not needed to run the game or its existing tests.
"""
from pathlib import Path, PurePosixPath
import argparse
import gzip
import hashlib
import io
import json


MAPPING = 'docs/iteration/evidence/round23/package/historical-log-archive.json'
LOG_PREFIX = ('docs', 'iteration', 'evidence')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def relative_log(value):
    require(isinstance(value, str) and value, 'Missing archive path')
    path = PurePosixPath(value)
    require(not path.is_absolute() and str(path) == value, 'Noncanonical archive path: ' + value)
    require(path.parts[:3] == LOG_PREFIX and len(path.parts) > 3,
            'Only historical evidence logs may be restored: ' + value)
    require(all(part not in ('.', '..') and not any(char in part for char in '\\:\0')
                for part in path.parts), 'Unsafe archive path: ' + value)
    return path


def checked_path(root, relative):
    target = root.joinpath(*relative.parts)
    require(target.resolve().is_relative_to(root), 'Path escapes the selected directory')
    require(not root.is_symlink() and root.resolve() == root, 'Selected directory changed')
    for component in (target, *target.parents):
        if component == root:
            break
        require(not component.is_symlink(), 'Symlink in archive or output path')
    return target


def restore(project, destination):
    project = project.resolve()
    require(project.is_dir(), 'Project directory does not exist')
    require(not destination.is_symlink(), 'Output directory must not be a symlink')
    output = destination.resolve()
    require(not output.is_relative_to(project), 'Output must be outside the project')
    require(not destination.exists() or (destination.is_dir() and not any(destination.iterdir())),
            'Output directory must not exist or must be empty; nothing will be overwritten')

    mapping = json.loads(checked_path(project, relative_log(MAPPING)).read_text(encoding='utf-8'))
    require(mapping.get('format') == 'dice-abyss-historical-log-archive' and mapping.get('version') == 1,
            'Unknown historical archive mapping')
    rows = mapping.get('files')
    require(isinstance(rows, list) and len(rows) == 19, 'Expected the declared 19 historical logs')
    names = [row['path'] for row in rows]
    require(names == sorted(names) and len(set(name.casefold() for name in names)) == len(names),
            'Archive paths must be unique and sorted')
    prepared = []
    for row in rows:
        relative = relative_log(row['path'])
        require(row['path'].endswith('.json'), 'Only the declared JSON logs may be restored')
        require(row['compressedPath'] == row['path'] + '.gz', 'Unexpected compressed archive path')
        compressed_relative = relative_log(row['compressedPath'])
        require(isinstance(row['bytes'], int) and 0 < row['bytes'] <= 2_000_000,
                'Unexpected original log size')
        compressed = checked_path(project, compressed_relative).read_bytes()
        require(len(compressed) == row['compressedBytes'] and sha(compressed) == row['compressedSha256'],
                'Compressed archive checksum mismatch: ' + row['compressedPath'])
        # Bound decompression to the declared original size plus one byte.
        with gzip.GzipFile(fileobj=io.BytesIO(compressed), mode='rb') as handle:
            original = handle.read(row['bytes'] + 1)
        require(len(original) == row['bytes'] and sha(original) == row['sha256'],
                'Original log checksum mismatch: ' + row['path'])
        prepared.append((relative, original))
    require(sum(len(data) for _, data in prepared) == mapping['totals']['originalBytes'],
            'Original byte total differs from the mapping')

    # Validate every source first, then use exclusive writes and recheck output
    # containment before creating parents or opening a file.
    output.mkdir(parents=True, exist_ok=True)
    require(not destination.is_symlink() and destination.resolve() == output and not any(output.iterdir()),
            'Output directory changed or is no longer empty')
    for relative, data in prepared:
        target = checked_path(output, relative)
        target.parent.mkdir(parents=True, exist_ok=True)
        target = checked_path(output, relative)
        with target.open('xb') as handle:
            handle.write(data)
    for relative, data in prepared:
        require(checked_path(output, relative).read_bytes() == data,
                'Restored file differs: ' + str(relative))
    return {'status': 'PASS', 'files': len(prepared),
            'restoredBytes': sum(len(data) for _, data in prepared),
            'originalSha256Verified': True, 'compressedSha256Verified': True,
            'restoredBytesVerified': True, 'output': str(output)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    try:
        result = restore(args.project, args.output)
    except (ValueError, OSError, KeyError, TypeError, EOFError, json.JSONDecodeError) as error:
        parser.exit(1, 'Restore refused: ' + str(error) + '\n')
    print(json.dumps(result, ensure_ascii=False, indent=2))
