#!/usr/bin/env python3
"""Read-only Round15 archive gate; no workload starts without --go.

Example, from the workspace (use a new output/extraction path for every run):
  python qa-r15/fresh-archive-gate.py --zip /absolute/final.zip --go

Reuses the retained current/run_final_validation.py capture/hash helpers.
Only ZIP extraction writes product files. Tests and HTTP write evidence outside
the extracted product. No install, simulation, browser or glyph scan is run.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import sys
import time
import zipfile

sys.dont_write_bytecode = True
os.environ['PYTHONDONTWRITEBYTECODE'] = '1'
HERE = Path(__file__).resolve().parent
MANIFEST = 'docs/iteration/FILE_MANIFEST.json'
COUNTERS = ['tests', 'suites', 'pass', 'fail', 'cancelled', 'skipped', 'todo']


def relative_name(name):
    if not isinstance(name, str) or not name or '\\' in name or ':' in name:
        raise ValueError('Unsafe relative path: ' + repr(name))
    parts = name.split('/')
    if any(part in {'', '.', '..'} or part.endswith((' ', '.')) for part in parts):
        raise ValueError('Unsafe path component: ' + repr(name))
    if any(ord(character) < 32 or ord(character) == 127 for character in name):
        raise ValueError('Control character in path: ' + repr(name))
    if PurePosixPath(name).is_absolute():
        raise ValueError('Absolute path: ' + repr(name))
    return parts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--zip', required=True, type=Path)
    parser.add_argument('--go', action='store_true')
    parser.add_argument('--extract-root', type=Path, default=Path.cwd() / 'verify-final')
    parser.add_argument('--out', type=Path, default=Path.cwd() / 'qa-r15/final-archive-receipt')
    parser.add_argument('--frozen-source', type=Path, default=HERE / 'current/execution-source-after.json')
    parser.add_argument('--preservation', type=Path, default=HERE / 'current/original-tests-assets-preservation.json')
    parser.add_argument('--expected-version', default='5.15.0')
    parser.add_argument('--expected-modules', type=int, default=70)
    parser.add_argument('--expected-cases', type=int, default=608)
    parser.add_argument('--expected-http-files', type=int, default=57)
    parser.add_argument('--port', type=int, default=4199)
    parser.add_argument('--workers', type=int, default=4)
    args = parser.parse_args()
    if not args.go:
        parser.error('Prepared only. Supply the unique final ZIP and explicit --go after integrator authorization.')
    if not 1 <= args.workers <= 8 or not 1024 <= args.port <= 65535:
        parser.error('Use 1..8 workers and a loopback port in 1024..65535.')
    archive, extract, out = args.zip.resolve(), args.extract_root.resolve(), args.out.resolve()
    if extract.exists() or out.exists():
        parser.error('Extraction and output paths must both be new; prior evidence is never overwritten.')
    if out.is_relative_to(extract) or extract.is_relative_to(out):
        parser.error('Evidence and extracted product must use separate directories.')
    if archive.is_relative_to(extract) or archive.is_relative_to(out):
        parser.error('The ZIP must be outside both new directories.')

    helper_path = HERE / 'current/run_final_validation.py'
    spec = importlib.util.spec_from_file_location('round15_capture_helpers', helper_path)
    helpers = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helpers)
    out.mkdir(parents=True)
    clock = time.perf_counter()
    report = {'started': helpers.utc_now(), 'archive': str(archive), 'extractRoot': str(extract),
              'source': str(extract / 'Dice-Abyss'), 'checks': {}, 'limits':
              ['No simulation, browser, glyph scan, installation or performance comparison.',
               'Expected counts are planning gates; actual TAP counts and exit codes are retained.'],
              'protocol': {'script': helpers.identity(Path(__file__)), 'helpers': helpers.identity(helper_path)},
              'expected': {'version': args.expected_version, 'modules': args.expected_modules,
                           'cases': args.expected_cases, 'httpFiles': args.expected_http_files}}

    def gate(label, passed):
        report['checks'][label] = bool(passed)
        if not passed:
            raise ValueError('Gate failed: ' + label)

    def event(label, **values):
        print(json.dumps({'event': label, **values}), flush=True)

    def manifest_check(source):
        data = json.loads((source / MANIFEST).read_text())
        if data.get('selfExcluded') != MANIFEST or data.get('algorithm') != 'sha256':
            raise ValueError('Manifest must explicitly exclude only itself and use SHA256.')
        if data.get('version') != args.expected_version:
            raise ValueError('Manifest release differs from expected version.')
        expected = {}
        for row in data['files']:
            name = row['path']
            relative_name(name)
            if name == MANIFEST or name in expected:
                raise ValueError('Self-reference or duplicate manifest path: ' + name)
            if type(row['bytes']) is not int or row['bytes'] < 0 or not re.fullmatch('[0-9a-f]{64}', row['sha256']):
                raise ValueError('Malformed manifest identity: ' + name)
            expected[name] = {'bytes': row['bytes'], 'sha256': row['sha256']}
        actual = {p.relative_to(source).as_posix(): helpers.identity(p)
                  for p in source.rglob('*') if p.is_file() and p.relative_to(source).as_posix() != MANIFEST}
        differences = [{'path': name, 'expected': expected.get(name), 'actual': actual.get(name)}
                       for name in sorted(set(expected) | set(actual)) if expected.get(name) != actual.get(name)]
        return {'manifest': helpers.identity(source / MANIFEST), 'entries': len(expected),
                'actualFilesExcludingSelf': len(actual), 'differences': differences,
                'pass': bool(expected) and not differences}

    try:
        gate('zipBelow50000000Bytes', 0 < archive.stat().st_size < 50_000_000)
        report['zipIdentity'] = helpers.identity(archive)
        frozen_path, kept_path = args.frozen_source.resolve(), args.preservation.resolve()
        frozen = json.loads(frozen_path.read_text())
        kept = json.loads(kept_path.read_text())
        report['referenceInputs'] = {'frozenSource': {'path': str(frozen_path), **helpers.identity(frozen_path)},
                                    'preservation': {'path': str(kept_path), **helpers.identity(kept_path)}}
        with zipfile.ZipFile(archive) as package:
            infos = package.infolist()
            seen, prefixes = set(), {}
            expanded = sum(info.file_size for info in infos)
            gate('boundedExpandedSize', 0 < expanded <= 512 * 1024 * 1024)
            for info in infos:
                name = info.filename.rstrip('/') if info.is_dir() else info.filename
                parts = relative_name(name)
                if info.orig_filename != info.filename or parts[0] != 'Dice-Abyss':
                    raise ValueError('Wrong root or altered ZIP filename: ' + repr(info.orig_filename))
                if len(parts) == 1 and not info.is_dir():
                    raise ValueError('Root entry must be a directory.')
                if name in seen or info.flag_bits & 1:
                    raise ValueError('Duplicate or encrypted ZIP member: ' + name)
                seen.add(name)
                mode = (info.external_attr >> 16) & 0xffff
                kind = stat.S_IFMT(mode)
                if kind not in {0, stat.S_IFREG, stat.S_IFDIR}:
                    raise ValueError('Link or special ZIP member: ' + name)
                for index in range(1, len(parts) + 1):
                    prefix = '/'.join(parts[:index])
                    folded = prefix.casefold()
                    if folded in prefixes and prefixes[folded] != prefix:
                        raise ValueError('Case collision: ' + prefix)
                    prefixes[folded] = prefix
            gate('safePathsDuplicatesCaseAndLinks', True)
            crc_failure = package.testzip()
            report['zipScan'] = {'entries': len(infos), 'files': sum(not i.is_dir() for i in infos),
                                 'expandedBytes': expanded, 'crcFailure': crc_failure}
            gate('allMemberCrc', crc_failure is None)
            extract.mkdir(parents=True)
            for info in infos:
                target = extract / info.filename
                if info.is_dir():
                    target.mkdir(parents=True, exist_ok=True)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with package.open(info) as incoming, target.open('xb') as outgoing:
                        shutil.copyfileobj(incoming, outgoing, 1024 * 1024)
        source = extract / 'Dice-Abyss'
        before_manifest = manifest_check(source)
        helpers.write_json(out / 'manifest-before.json', before_manifest)
        gate('fullNonSelfReferentialManifest', before_manifest['pass'])
        gate('packageVersion', json.loads((source / 'package.json').read_text())['version'] == args.expected_version)
        before = helpers.execution_identity(source)
        helpers.write_json(out / 'execution-source-before.json', before)
        source_diff = [{'path': name, 'expected': frozen.get(name), 'actual': before.get(name)}
                       for name in sorted(set(frozen) | set(before)) if frozen.get(name) != before.get(name)]
        helpers.write_json(out / 'frozen-source-comparison.json', {'expectedFiles': len(frozen),
                           'actualFiles': len(before), 'differences': source_diff})
        gate('exactFrozenExecutionSource', bool(frozen) and not source_diff)
        preserved = []
        for row in kept['rows']:
            relative_name(row['path'])
            p = source / row['path']
            actual = helpers.identity(p) if p.is_file() else None
            preserved.append({'path': row['path'], 'category': row['category'],
                              'expected': row['manifest'], 'actual': actual,
                              'pass': actual == row['manifest'] and row['baselineMatchesInput']})
        helpers.write_json(out / 'original-preservation.json', {'rows': preserved, 'groups': kept['groups']})
        gate('originalTestsFixturesFontsAndAssets', bool(preserved) and all(row['pass'] for row in preserved))
        files = sorted((source / 'tests').glob('*.test.mjs'))
        gate('testModuleFileCount', len(files) == args.expected_modules)
        event('archive-identity-passed', files=len(before), modules=len(files))

        for name, command in [('environment-node', ['node', '--version']), ('environment-npm', ['npm', '--version']),
                              ('check', ['npm', 'run', 'check'])]:
            receipt, _, _ = helpers.run_command(name, command, source, out)
            gate(name, receipt['exitCode'] == 0)
        event('check-finished', exitCode=0)
        receipt, raw, _ = helpers.run_command('npm-test', ['npm', 'test'], source, out)
        counts = helpers.parse_counts(raw)
        report['defaultCounts'] = counts
        gate('default70Modules', receipt['exitCode'] == 0 and helpers.counts_pass(counts)
             and counts.get('tests') == args.expected_modules)
        event('default-tests-finished', counts=counts)

        def module(file):
            relative = file.relative_to(source).as_posix()
            stem = 'detailed-modules/' + file.name.removesuffix('.test.mjs')
            receipt, raw, _ = helpers.run_command(stem, ['node', '--test-reporter=tap', relative], source, out)
            counts = helpers.parse_counts(raw, native_tap=True)
            return {'file': relative, 'receipt': stem + '.run.json', 'exitCode': receipt['exitCode'],
                    'counts': counts, 'pass': receipt['exitCode'] == 0 and helpers.counts_pass(counts)}

        rows = []
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            for future in as_completed([pool.submit(module, file) for file in files]):
                rows.append(future.result())
                if len(rows) % 10 == 0 or not rows[-1]['pass']:
                    event('detailed-progress', modules=len(rows), last=rows[-1]['file'], passed=rows[-1]['pass'])
        fine = {key: sum(row['counts'].get(key, 0) for row in rows) for key in COUNTERS}
        helpers.write_json(out / 'test-detailed-summary.json', {'modules': len(rows), 'counts': fine,
                           'rows': sorted(rows, key=lambda row: row['file'])})
        report['fineCounts'] = fine
        gate('native608Cases', len(rows) == args.expected_modules and all(row['pass'] for row in rows)
             and fine['tests'] == args.expected_cases)
        event('detailed-tests-finished', counts=fine)

        old_port = os.environ.get('SMOKE_PORT')
        try:
            os.environ['SMOKE_PORT'] = str(args.port)
            receipt, _, _ = helpers.run_command('http', ['node', 'scripts/smoke-http.mjs', '--output',
                                               str(out / 'http-smoke.json')], source, out)
        finally:
            if old_port is None:
                os.environ.pop('SMOKE_PORT', None)
            else:
                os.environ['SMOKE_PORT'] = old_port
        gate('httpProcess', receipt['exitCode'] == 0)
        http = json.loads((out / 'http-smoke.json').read_text())
        gate('http57ShippingResources', http['allPassed'] and http['spawnedServerReady']
             and http['release'] == args.expected_version and http['files'] == args.expected_http_files
             and len(http['rows']) == args.expected_http_files and all(row['status'] == 200 for row in http['rows']))
        font_rows = [row for row in http['rows'] if row['file'].endswith('.woff2')]
        gate('httpTwoExistingFonts', len(font_rows) == 2 and all(row['type'] == 'font/woff2' for row in font_rows))
        event('http-finished', files=http['files'])

        after = helpers.execution_identity(source)
        helpers.write_json(out / 'execution-source-after.json', after)
        gate('executionSourceUnchanged', after == before)
        after_manifest = manifest_check(source)
        helpers.write_json(out / 'manifest-after.json', after_manifest)
        gate('allExtractedFilesUnchanged', after_manifest['pass'] and after_manifest['manifest'] == before_manifest['manifest'])
        gate('originalZipUnchanged', helpers.identity(archive) == report['zipIdentity'])
        receipt_errors = []
        receipts = sorted(out.rglob('*.run.json'))
        for path in receipts:
            receipt = json.loads(path.read_text())
            for stream in ['stdout', 'stderr']:
                recorded = receipt[stream]
                if helpers.identity(out / recorded['path']) != {k: recorded[k] for k in ['bytes', 'sha256']}:
                    receipt_errors.append({'receipt': path.relative_to(out).as_posix(), 'stream': stream})
        report['outputReceiptCount'] = len(receipts)
        report['retainedOutputErrors'] = receipt_errors
        gate('retainedOutputHashes', not receipt_errors)
    except Exception as error:
        report['error'] = type(error).__name__ + ': ' + str(error)
    report['completed'] = helpers.utc_now()
    report['durationSeconds'] = round(time.perf_counter() - clock, 4)
    report['pass'] = 'error' not in report and bool(report['checks']) and all(report['checks'].values())
    helpers.write_json(out / 'FINAL_ARCHIVE_RECEIPT.json', report)
    helpers.write_json(out / 'OUTPUT_MANIFEST.json', {'algorithm': 'sha256', 'selfExcluded': 'OUTPUT_MANIFEST.json',
                       'files': [{'path': p.relative_to(out).as_posix(), **helpers.identity(p)}
                                 for p in sorted(out.rglob('*')) if p.is_file() and p.name != 'OUTPUT_MANIFEST.json']})
    event('archive-gate-completed', passed=report['pass'], report=str(out / 'FINAL_ARCHIVE_RECEIPT.json'),
          error=report.get('error'))
    return 0 if report['pass'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
