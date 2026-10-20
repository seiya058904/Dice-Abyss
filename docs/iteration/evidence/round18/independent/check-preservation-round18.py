from pathlib import Path, PurePosixPath
from datetime import datetime, timezone
from hashlib import sha256
import json
import zipfile

workspace = Path('/workspace/scratch/f0146b2cbcc6')
archive = workspace / 'upload/Dice-Abyss-v5.17.0-cloud-round-17(1).zip'
baseline = workspace / 'baseline/Dice-Abyss'
current = workspace / 'work/Dice-Abyss'
output = workspace / 'analysis/independent/preservation-round18.json'

def digest(data):
    return sha256(data).hexdigest()

def describe(path):
    if path.is_symlink():
        return 'symlink'
    if path.is_file():
        return 'file'
    if path.is_dir():
        return 'directory'
    return 'missing'

original = {}
original_directories = set()
with zipfile.ZipFile(archive) as z:
    for info in z.infolist():
        parts = PurePosixPath(info.filename).parts
        if parts[0] != 'Dice-Abyss':
            raise RuntimeError('Unexpected archive root: ' + info.filename)
        relative = PurePosixPath(*parts[1:])
        if '..' in relative.parts or relative.is_absolute():
            raise RuntimeError('Unsafe archive path: ' + info.filename)
        if not relative.parts:
            continue
        for parent in relative.parents:
            if str(parent) != '.':
                original_directories.add(str(parent))
        if info.is_dir():
            original_directories.add(str(relative))
            continue
        raw = z.read(info)
        original[str(relative)] = {'bytes': len(raw), 'sha256': digest(raw)}

def compare_root(root):
    missing = []
    changed = []
    types = []
    for relative, old in original.items():
        path = root / relative
        kind = describe(path)
        if kind == 'missing':
            missing.append(relative)
        elif kind != 'file':
            types.append({'path': relative, 'expected': 'file', 'actual': kind})
        else:
            current_hash = digest(path.read_bytes())
            if current_hash != old['sha256']:
                changed.append({'path': relative, 'originalBytes': old['bytes'],
                    'currentBytes': path.stat().st_size, 'originalSha256': old['sha256'],
                    'currentSha256': current_hash})
    missing_directories = [p for p in sorted(original_directories) if describe(root / p) != 'directory']
    present = {str(p.relative_to(root)) for p in root.rglob('*') if p.is_file() or p.is_symlink()}
    return {'root': str(root), 'originalFileCount': len(original),
        'retainedOriginalFiles': len(original) - len(missing) - len(types),
        'currentFileCount': len(present), 'missingOriginalFiles': missing,
        'typeMismatches': types, 'originalDirectoryCount': len(original_directories),
        'missingOriginalDirectories': missing_directories, 'modifiedOriginalFiles': changed,
        'addedFiles': sorted(present - set(original)),
        'allOriginalPathsPreserved': not missing and not types and not missing_directories}

baseline_result = compare_root(baseline)
current_result = compare_root(current)
changed = {x['path'] for x in current_result['modifiedOriginalFiles']}
missing = set(current_result['missingOriginalFiles'])
types = {x['path'] for x in current_result['typeMismatches']}

selectors = {
    'originalTestModules': lambda p: p.startswith('tests/') and p.endswith('.test.mjs'),
    'originalFixtures': lambda p: p.startswith('tests/fixtures/'),
    'originalTestTree': lambda p: p.startswith('tests/'),
    'originalFontTreeIncludingLicenses': lambda p: p.startswith('src/fonts/'),
}
groups = {}
for name, select in selectors.items():
    files = sorted(p for p in original if select(p))
    problems = sorted(set(files) & (changed | missing | types))
    groups[name] = {'files': len(files), 'bytes': sum(original[p]['bytes'] for p in files),
        'byteExact': not problems, 'problems': problems,
        'manifest': [{'path': p, **original[p]} for p in files]}

baseline_exact = baseline_result['allOriginalPathsPreserved'] and not baseline_result['modifiedOriginalFiles']
status = baseline_exact and current_result['allOriginalPathsPreserved'] and all(x['byteExact'] for x in groups.values())
report = {'status': 'PASS' if status else 'FAIL',
    'generatedAt': datetime.now(timezone.utc).isoformat(),
    'scope': 'Authoritative uploaded ZIP bytes, immutable baseline and current work tree; only explicit target code/document changes may differ. No files were changed by this checker.',
    'archive': {'path': str(archive), 'bytes': archive.stat().st_size,
        'sha256': digest(archive.read_bytes()), 'files': len(original)},
    'baselineByteExactToUpload': baseline_exact, 'baseline': baseline_result,
    'current': current_result, 'groups': groups}
output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'status': report['status'], 'output': str(output),
    'baselineByteExactToUpload': baseline_exact,
    'retainedOriginalFiles': current_result['retainedOriginalFiles'],
    'allOriginalFiles': len(original),
    'originalDirectoryCount': len(original_directories),
    'allOriginalPathsPreserved': current_result['allOriginalPathsPreserved'],
    'currentFiles': current_result['currentFileCount'],
    'modifiedOriginalFiles': [row['path'] for row in current_result['modifiedOriginalFiles']],
    'groups': {name: {k: v for k, v in row.items() if k != 'manifest'} for name, row in groups.items()}}, ensure_ascii=False, indent=2))
raise SystemExit(0 if status else 1)
