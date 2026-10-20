#!/usr/bin/env python3
"""Round 15 final validation. Does not execute any gate without --go.

All product paths are read-only inputs to this runner. Outputs are captured in
memory and written atomically after each subprocess exits. Choose a fresh --out
directory for every independent run; prior evidence is never overwritten.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time

WORKSPACE = Path(__file__).resolve().parents[2]
COUNTERS = ['tests', 'suites', 'pass', 'fail', 'cancelled', 'skipped', 'todo']
ASSET_SUFFIXES = {'.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico',
                  '.woff', '.woff2', '.ttf', '.otf', '.wav', '.ogg', '.mp3'}


def utc_now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def atomic_bytes(path, raw):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix='.qa-write-', delete=False) as file:
        temporary = Path(file.name)
        file.write(raw)
        file.flush()
        os.fsync(file.fileno())
    os.replace(temporary, path)


def write_json(path, value):
    atomic_bytes(path, (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode())


def identity(path):
    raw = path.read_bytes()
    return {'bytes': len(raw), 'sha256': sha(raw)}


def execution_identity(root):
    files = [root / name for name in ['package.json', 'index.html', 'favicon.svg', '启动游戏.cmd']
             if (root / name).is_file()]
    for folder in ['src', 'scripts', 'tests']:
        files.extend(path for path in (root / folder).rglob('*') if path.is_file())
    return {path.relative_to(root).as_posix(): identity(path) for path in sorted(files)}


def run_command(name, argv, source, out, extra=None):
    started, clock = utc_now(), time.perf_counter()
    error = None
    try:
        process = subprocess.run(argv, cwd=source, capture_output=True, check=False)
        code, stdout, stderr = process.returncode, process.stdout, process.stderr
    except OSError as exception:
        code, stdout, stderr = None, b'', str(exception).encode()
        error = type(exception).__name__ + ': ' + str(exception)
    finished, duration = utc_now(), time.perf_counter() - clock
    stdout_path, stderr_path = out / (name + '.stdout'), out / (name + '.stderr')
    atomic_bytes(stdout_path, stdout)
    atomic_bytes(stderr_path, stderr)
    receipt = {'name': name, 'command': argv, 'cwd': str(source), 'started': started,
               'completed': finished, 'durationSeconds': round(duration, 4),
               'exitCode': code, 'launchError': error,
               'stdout': {'path': stdout_path.relative_to(out).as_posix(), 'bytes': len(stdout), 'sha256': sha(stdout)},
               'stderr': {'path': stderr_path.relative_to(out).as_posix(), 'bytes': len(stderr), 'sha256': sha(stderr)}}
    if extra:
        receipt.update(extra)
    write_json(out / (name + '.run.json'), receipt)
    return receipt, stdout, stderr


def parse_counts(raw, native_tap=False):
    text = raw.decode('utf-8', errors='replace')
    pattern = r'^# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$' if native_tap else r'^[#ℹ] (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$'
    return {key: int(value) for key, value in re.findall(pattern, text, re.M)}


def counts_pass(counts):
    return counts.get('tests', 0) > 0 and counts.get('tests') == counts.get('pass') and all(
        counts.get(key) == 0 for key in ['fail', 'cancelled', 'skipped', 'todo'])


def preservation(baseline, source):
    manifest = json.loads((baseline / 'docs/iteration/FILE_MANIFEST.json').read_text())
    expected = {row['path']: {'bytes': row['bytes'], 'sha256': row['sha256']} for row in manifest['files']}
    rows = []
    for name in sorted(expected):
        if name.startswith('tests/'):
            category = 'original-test-module' if name.endswith('.test.mjs') else 'original-test-fixture'
        elif name.startswith('src/fonts/'):
            category = 'font-license-notice'
        elif (name.startswith('src/') or '/' not in name) and Path(name).suffix.lower() in ASSET_SUFFIXES:
            category = 'other-runtime-asset'
        else:
            continue
        original, current = baseline / name, source / name
        before = identity(original) if original.is_file() else None
        after = identity(current) if current.is_file() else None
        rows.append({'path': name, 'category': category, 'manifest': expected[name], 'baseline': before,
                     'current': after, 'baselineMatchesInput': before == expected[name], 'preserved': after == expected[name]})
    groups = {}
    for category in sorted({row['category'] for row in rows}):
        items = [row for row in rows if row['category'] == category]
        groups[category] = {'files': len(items), 'bytes': sum(row['manifest']['bytes'] for row in items),
                            'preserved': sum(row['preserved'] for row in items)}
    return {'method': 'Actual baseline and current bytes/SHA256 compared to the uploaded non-self-referential manifest.',
            'scope': 'Every original test module and fixture; all src/fonts files including licenses/notices; remaining runtime image/audio/font assets. Historical evidence screenshots are outside this runtime-asset gate.',
            'groups': groups, 'rows': rows,
            'pass': bool(rows) and all(row['baselineMatchesInput'] and row['preserved'] for row in rows)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--go', action='store_true', help='Explicit integrator GO; starts CPU-intensive gates.')
    parser.add_argument('--source', type=Path, default=WORKSPACE / 'work/Dice-Abyss')
    parser.add_argument('--baseline', type=Path, default=WORKSPACE / 'baseline/Dice-Abyss')
    parser.add_argument('--out', type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument('--expected-modules', type=int, default=70)
    parser.add_argument('--expected-cases', type=int, default=608)
    parser.add_argument('--workers', type=int, default=4)
    args = parser.parse_args()
    if not args.go:
        parser.error('Prepared only. Do not start until the integrator sends GO; then explicitly supply --go.')
    source, baseline, out = args.source.resolve(), args.baseline.resolve(), args.out.resolve()
    if source == baseline or out == source or out.is_relative_to(source) or out == baseline or out.is_relative_to(baseline):
        parser.error('Use a separate candidate source, untouched baseline, and output directory outside both.')
    if not 1 <= args.workers <= 8:
        parser.error('--workers must be between 1 and 8.')
    out.mkdir(parents=True, exist_ok=True)
    if (out / 'validation-start.json').exists():
        parser.error('Prior evidence exists. Choose a fresh --out directory; do not overwrite the earlier run.')

    started, clock = utc_now(), time.perf_counter()
    files = sorted((source / 'tests').glob('*.test.mjs'))
    before = execution_identity(source)
    package = json.loads((source / 'package.json').read_text())
    metadata = {'started': started, 'source': str(source), 'baseline': str(baseline), 'out': str(out),
                'version': package['version'], 'expectedModulesAtPlanning': args.expected_modules,
                'expectedCasesAtPlanning': args.expected_cases, 'actualTestModulesAtStart': len(files),
                'workers': args.workers, 'productMutation': False,
                'durationScope': 'Execution receipts only. Not product performance measurements.',
                'sequence': ['preservation', 'syntax', 'default npm test', 'independent native TAP modules', '1000 standard + 50 existing no-shopping simulation', 'source and retained-output integrity']}
    write_json(out / 'validation-start.json', metadata)
    write_json(out / 'execution-source-before.json', before)
    print(json.dumps({'event': 'started', 'version': package['version'], 'modules': len(files), 'out': str(out)}), flush=True)
    kept = preservation(baseline, source)
    write_json(out / 'original-tests-assets-preservation.json', kept)
    environment = {}
    for label, argv in [('node', ['node', '--version']), ('npm', ['npm', '--version'])]:
        receipt, raw, _ = run_command('environment-' + label, argv, source, out)
        environment[label] = {'value': raw.decode(errors='replace').strip(), 'exitCode': receipt['exitCode']}
    write_json(out / 'environment.json', environment)

    check, _, _ = run_command('check', ['npm', 'run', 'check'], source, out)
    print(json.dumps({'event': 'check-finished', 'exitCode': check['exitCode']}), flush=True)
    npm_test, raw, _ = run_command('npm-test', ['npm', 'test'], source, out)
    npm_counts = parse_counts(raw)
    write_json(out / 'npm-test-summary.json', {'receipt': 'npm-test.run.json', 'counts': npm_counts,
               'pass': npm_test['exitCode'] == 0 and counts_pass(npm_counts) and npm_counts.get('tests') == args.expected_modules})
    print(json.dumps({'event': 'default-tests-finished', 'exitCode': npm_test['exitCode'], 'counts': npm_counts}), flush=True)

    detailed_rows = []
    detailed_clock, detailed_started = time.perf_counter(), utc_now()

    def module(file):
        relative = file.relative_to(source).as_posix()
        stem = 'detailed-modules/' + file.name.removesuffix('.test.mjs')
        receipt, raw, _ = run_command(stem, ['node', '--test-reporter=tap', relative], source, out,
                                     {'testFile': relative, 'testSource': before[relative]})
        counts = parse_counts(raw, native_tap=True)
        return {'file': relative, 'receipt': stem + '.run.json', 'counts': counts,
                'exitCode': receipt['exitCode'], 'stdout': receipt['stdout'], 'stderr': receipt['stderr'],
                'pass': receipt['exitCode'] == 0 and counts_pass(counts)}

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(module, file) for file in files]
        for future in as_completed(futures):
            row = future.result()
            detailed_rows.append(row)
            if not row['pass'] or len(detailed_rows) % 10 == 0:
                print(json.dumps({'event': 'detailed-progress', 'completedModules': len(detailed_rows),
                                  'lastModule': row['file'], 'pass': row['pass']}), flush=True)
    detailed_rows.sort(key=lambda row: row['file'])
    detailed = {'started': detailed_started, 'completed': utc_now(), 'durationSeconds': round(time.perf_counter() - detailed_clock, 4),
                'method': 'Each unchanged file runs directly in its own Node process; native TAP totals are counted, not module wrappers.',
                'modules': len(detailed_rows), 'modulesPassed': sum(row['pass'] for row in detailed_rows),
                'counts': {key: sum(row['counts'].get(key, 0) for row in detailed_rows) for key in COUNTERS},
                'rows': detailed_rows, 'pass': all(row['pass'] for row in detailed_rows)}
    write_json(out / 'test-detailed-summary.json', detailed)
    print(json.dumps({'event': 'detailed-tests-finished', 'modules': detailed['modules'], 'counts': detailed['counts']}), flush=True)

    simulation_run, raw, _ = run_command('simulate1000', ['npm', 'run', 'simulate', '--', '1000'], source, out)
    try:
        match = re.search(rb'(?m)^\{', raw)
        if match is None:
            raise ValueError('No complete JSON object after the npm command banner.')
        body = raw[match.start():]
        sim = json.loads(body)
        atomic_bytes(out / 'simulation1000.json', body)
        baseline_json = WORKSPACE / 'qa-r15/baseline/simulation1000.json'
        expected_hash = sha(baseline_json.read_bytes())
        simulation = {'standardSeeds': sim['seeds'], 'standardCompleted': sim['completed'], 'standardFailures': sim['failures'],
                      'deaths': sim['deaths'], 'noShoppingSeeds': len(sim['noShopping']),
                      'noShoppingCompleted': sum(row['complete'] for row in sim['noShopping']),
                      'noShoppingDeaths': sum(row['deaths'] for row in sim['noShopping']),
                      'jsonBytes': len(body), 'jsonSha256': sha(body), 'baselineJsonSha256': expected_hash,
                      'byteIdenticalToFreshBaseline': sha(body) == expected_hash,
                      'scope': 'Existing fixed-seed standard policy and its 50 no-shopping runs; no natural-policy performance or win-rate claim.',
                      'pass': simulation_run['exitCode'] == 0 and sim['seeds'] == 1000 and sim['completed'] == 1000 and not sim['failures']
                              and len(sim['noShopping']) == 50 and all(row['complete'] for row in sim['noShopping'])}
    except (ValueError, KeyError, TypeError, OSError) as exception:
        simulation = {'pass': False, 'parseError': type(exception).__name__ + ': ' + str(exception)}
    write_json(out / 'simulation-summary.json', simulation)
    print(json.dumps({'event': 'simulation-finished', 'exitCode': simulation_run['exitCode'], 'summary': simulation}), flush=True)

    after = execution_identity(source)
    write_json(out / 'execution-source-after.json', after)
    changes = [{'path': name, 'before': before.get(name), 'after': after.get(name)}
               for name in sorted(set(before) | set(after)) if before.get(name) != after.get(name)]
    receipt_errors = []
    receipts = sorted(out.rglob('*.run.json'))
    for receipt_file in receipts:
        record = json.loads(receipt_file.read_text())
        for stream in ['stdout', 'stderr']:
            recorded = record[stream]
            actual = identity(out / recorded['path'])
            if actual != {'bytes': recorded['bytes'], 'sha256': recorded['sha256']}:
                receipt_errors.append({'receipt': receipt_file.relative_to(out).as_posix(), 'stream': stream,
                                       'expected': recorded, 'actual': actual})
    checks = {'syntax': check['exitCode'] == 0,
              'defaultAllModules': npm_test['exitCode'] == 0 and counts_pass(npm_counts) and npm_counts.get('tests') == args.expected_modules,
              'detailedAllModules': detailed['pass'] and detailed['modules'] == args.expected_modules,
              'actualFineCaseCountMatchesPlanning': detailed['counts']['tests'] == args.expected_cases,
              'standardAndNoShoppingComplete': simulation['pass'],
              'deterministicSimulationMatchesBaseline': simulation.get('byteIdenticalToFreshBaseline', False),
              'originalTestsFixturesFontsAssetsPreserved': kept['pass'],
              'executionSourceStable': not changes, 'retainedOutputHashesMatch': not receipt_errors}
    final = {'started': started, 'completed': utc_now(), 'durationSeconds': round(time.perf_counter() - clock, 4),
             'source': str(source), 'version': package['version'], 'checks': checks, 'pass': all(checks.values()),
             'moduleCounts': npm_counts, 'fineCounts': detailed['counts'], 'simulation': simulation,
             'preservationGroups': kept['groups'], 'sourceChanges': changes, 'retainedOutputErrors': receipt_errors,
             'outputReceiptCount': len(receipts), 'outputManifest': 'OUTPUT_MANIFEST.json',
             'limits': ['No browser, HTTP, natural-policy or product performance gate is executed by this runner.',
                        'Tests/simulation are validation workloads, not timing comparisons.',
                        'Expectation counts are explicit planning gates; actual native TAP counts are retained and never replaced by expected values.']}
    write_json(out / 'FINAL_VALIDATION.json', final)
    manifest = {'selfExcluded': 'OUTPUT_MANIFEST.json', 'algorithm': 'sha256',
                'files': [{'path': path.relative_to(out).as_posix(), **identity(path)}
                          for path in sorted(out.rglob('*')) if path.is_file() and path.name != 'OUTPUT_MANIFEST.json']}
    write_json(out / 'OUTPUT_MANIFEST.json', manifest)
    print(json.dumps({'event': 'validation-completed', 'pass': final['pass'], 'checks': checks,
                      'fineCounts': detailed['counts'], 'report': str(out / 'FINAL_VALIDATION.json')}), flush=True)
    return 0 if final['pass'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
