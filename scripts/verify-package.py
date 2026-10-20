#!/usr/bin/env python3
"""Verify a complete release ZIP and optionally extract it to an empty directory.

Uses Python's standard library only; it is an optional release check, not a game
runtime dependency. The manifest excludes itself to avoid self-reference.
"""
from pathlib import Path, PurePosixPath
import argparse
import hashlib
import json
import stat
import struct
import zipfile


MAX_ZIP_BYTES = 50_000_000
MAX_FILE_BYTES = 50_000_000
MAX_EXPANDED_BYTES = 100_000_000
MAX_ENTRIES = 10_000
MAX_COMPRESSION_RATIO = 1_000
PROJECT_ROOT = 'Dice-Abyss'
WINDOWS_DEVICES = {'con', 'prn', 'aux', 'nul', 'conin$', 'conout$'} | {
    prefix + digit for prefix in ('com', 'lpt') for digit in '123456789¹²³'
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def preflight_archive(archive, size):
    """Bound central-directory parsing before ZipFile allocates entry objects.

    Release files use ordinary single-volume ZIP. Under these size/count limits
    ZIP64 end records are unnecessary; local ZIP64 size fields remain supported.
    The streamed count also catches a false count in the end record.
    """
    with archive.open('rb') as handle:
        tail_start = max(0, size - 65_557)
        handle.seek(tail_start)
        tail = handle.read()
        offset = tail.rfind(b'PK\x05\x06')
        require(offset >= 0 and offset + 22 <= len(tail), 'Missing ZIP end record')
        _, disk, central_disk, disk_count, count, central_size, central_offset, comment_size = struct.unpack_from('<4s4H2IH', tail, offset)
        require(offset + 22 + comment_size == len(tail), 'Invalid ZIP end record or trailing data')
        require(disk == central_disk == 0 and disk_count == count, 'Only single-volume ZIP is supported')
        require(0 < count <= MAX_ENTRIES, 'ZIP is empty or has too many entries')
        require(central_size != 0xffffffff and central_offset != 0xffffffff, 'ZIP64 end records are not supported')
        central_end = tail_start + offset
        central_start = central_end - central_size
        require(0 <= central_offset <= central_start < central_end, 'Invalid ZIP central directory bounds')
        handle.seek(central_start)
        actual_count = 0
        while handle.tell() < central_end:
            require(central_end - handle.tell() >= 46, 'Truncated ZIP central directory')
            header = handle.read(46)
            require(header[:4] == b'PK\x01\x02', 'Invalid ZIP central directory entry')
            name_size, extra_size, note_size = struct.unpack_from('<HHH', header, 28)
            record_end = handle.tell() + name_size + extra_size + note_size
            require(record_end <= central_end, 'ZIP central directory entry exceeds its boundary')
            actual_count += 1
            require(actual_count <= MAX_ENTRIES, 'Too many ZIP entries')
            handle.seek(record_end)
        require(actual_count == count, 'ZIP end-record entry count mismatch')


def checked_entries(entries):
    """Reject aliases before slicing a prefix or constructing filesystem paths."""
    require(entries, 'ZIP is empty')
    require(len(entries) <= MAX_ENTRIES, 'Too many ZIP entries')
    require(sum(entry.file_size for entry in entries) <= MAX_EXPANDED_BYTES,
            'ZIP expanded bytes exceed the total budget')
    seen, files, directories, spellings = set(), set(), set(), {}
    for entry in entries:
        name = entry.filename
        require(name and name == entry.orig_filename, 'Empty or normalized ZIP name')
        require(name.startswith(PROJECT_ROOT + '/'), 'Expected Dice-Abyss/ prefix: ' + name)
        body = name[:-1] if entry.is_dir() else name
        parts = body.split('/')
        require(all(part and part not in ('.', '..') for part in parts), 'Noncanonical ZIP path: ' + name)
        require(all(not any(ord(char) < 32 or char in '\\:<>"|?*' for char in part)
                    and part.rstrip(' .') == part
                    and part.split('.')[0].casefold() not in WINDOWS_DEVICES
                    for part in parts), 'Unsafe or nonportable ZIP path: ' + name)
        require(entry.is_dir() or len(parts) > 1, 'Empty ZIP file name')
        mode = stat.S_IFMT(entry.external_attr >> 16)
        require(mode in (0, stat.S_IFREG, stat.S_IFDIR), 'Symlinks and special files are not allowed')
        require(not mode or (mode == stat.S_IFDIR) == entry.is_dir(), 'ZIP file/directory type mismatch')
        require(not entry.is_dir() or entry.file_size == 0, 'Directory entries must be empty')
        require(entry.file_size <= MAX_FILE_BYTES, 'Unexpectedly large expanded file')
        require(entry.file_size < 1_000_000 or entry.file_size <= max(1, entry.compress_size) * MAX_COMPRESSION_RATIO,
                'Suspicious ZIP compression ratio: ' + name)
        key = body.casefold()
        require(key not in seen, 'Duplicate/case-colliding ZIP paths: ' + name)
        seen.add(key)
        (directories if entry.is_dir() else files).add(key)
        # Include implicit parent directories, including case-only spelling
        # aliases that would otherwise merge on a Windows filesystem.
        for length in range(1, len(parts) + 1):
            spelling = '/'.join(parts[:length])
            parent_key = spelling.casefold()
            require(parent_key not in spellings or spellings[parent_key] == spelling,
                    'Case-colliding ZIP path components: ' + name)
            spellings[parent_key] = spelling
            if length < len(parts):
                directories.add(parent_key)
    require(not files.intersection(directories), 'ZIP file/directory prefix conflict')


def extraction_target(root, name):
    """Check the resolved boundary before creating parents, writing, or reading."""
    require(not root.is_symlink() and root.resolve() == root, 'Extraction root changed')
    target = root / PROJECT_ROOT / name
    resolved = target.resolve()
    require(root in resolved.parents, 'Extraction target escapes destination: ' + name)
    for part in (target, *target.parents):
        if part == root:
            break
        require(not part.is_symlink(), 'Symlink in extraction target: ' + name)
    return target


def verify(archive, destination=None):
    size = archive.stat().st_size
    require(size < MAX_ZIP_BYTES, 'ZIP must be strictly below 50,000,000 bytes')
    preflight_archive(archive, size)
    with zipfile.ZipFile(archive) as source:
        entries = source.infolist()
        checked_entries(entries)
        require(source.testzip() is None, 'ZIP CRC verification failed')
        prefix = PROJECT_ROOT + '/'
        manifest_path = 'docs/iteration/FILE_MANIFEST.json'
        data = {entry.filename[len(prefix):]: source.read(entry) for entry in entries if not entry.is_dir()}
        require(manifest_path in data, 'Missing delivery manifest')
        manifest = json.loads(data[manifest_path])
        rows = manifest['files']
        paths = [row['path'] for row in rows]
        require(paths == sorted(paths) and len(paths) == len(set(paths)), 'Manifest must have unique, sorted paths')
        require(set(paths) == set(data) - {manifest_path}, 'Manifest file set differs from ZIP')
        for row in rows:
            payload = data[row['path']]
            require(len(payload) == row['bytes'], 'Byte mismatch: ' + row['path'])
            require(sha(payload) == row['sha256'], 'Hash mismatch: ' + row['path'])
        package = json.loads(data['package.json'])
        state = json.loads(data['docs/iteration/STATE.json'])
        require(package['version'] == state['outputVersion'], 'Package/iteration version mismatch')
        require(f'name="dice-abyss-release" content="{package["version"]}"'.encode() in data['index.html'], 'HTML release mismatch')
        forbidden = {'.git', 'node_modules', '__pycache__', '.cache', 'cache', 'generated_images'}
        require(all(not forbidden.intersection(PurePosixPath(name.casefold()).parts) for name in data), 'Excluded cache or dependency directory found')
        require(all(not name.casefold().endswith(('.zip', '.pyc')) for name in data), 'Nested archive or Python cache found')
        if destination is not None:
            # Check the supplied root before resolving it, including dangling
            # symlinks. The CLI must not resolve this argument ahead of us.
            require(not destination.is_symlink(), 'Extraction destination must not be a symlink')
            require(not destination.exists() or (destination.is_dir() and not any(destination.iterdir())),
                    'Extraction destination must be an empty directory')
            root = destination.resolve()
            root.mkdir(parents=True, exist_ok=True)
            require(not destination.is_symlink() and destination.resolve() == root, 'Extraction destination changed')
            for name, payload in data.items():
                target = extraction_target(root, name)
                target.parent.mkdir(parents=True, exist_ok=True)
                target = extraction_target(root, name)
                with target.open('xb') as output:
                    output.write(payload)
            for name, payload in data.items():
                require(sha(extraction_target(root, name).read_bytes()) == sha(payload), 'Extracted bytes differ: ' + name)
        return {'zip': archive.name, 'bytes': size, 'decimalMB': size / 1_000_000, 'sha256': sha(archive.read_bytes()), 'files': len(data), 'manifestEntries': len(rows), 'version': package['version'], 'round': state['round'], 'crcVerified': True, 'allManifestHashesVerified': True, 'extractedFilesVerified': destination is not None, 'expandedBytes': sum(entry.file_size for entry in entries), 'entries': len(entries), 'pathSafetyVerified': True, 'expandedBudgetVerified': True}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('zip', type=Path)
    parser.add_argument('--extract', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    result = verify(args.zip.resolve(), args.extract if args.extract else None)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False, indent=2))
