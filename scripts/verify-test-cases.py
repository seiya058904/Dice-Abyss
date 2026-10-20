"""Run every existing test module directly and retain auditable native TAP.

The default npm runner can report file wrappers rather than nested cases.
This optional QA helper uses only Python and the project's required Node.
Usage: python scripts/verify-test-cases.py --output /tmp/dice-tests
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import argparse
import datetime
import gzip
import hashlib
import json
import re
import subprocess
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--workers', type=int, default=4, choices=range(1, 9))
args = parser.parse_args()
root, output = args.root.resolve(), args.output.resolve()
output.mkdir(parents=True, exist_ok=True)
started = datetime.datetime.now(datetime.timezone.utc).isoformat()
clock = time.perf_counter()
files = sorted((root / 'tests').glob('*.test.mjs'))
if not files:
    raise SystemExit('No test modules found')


def run(file):
    command = ['node', '--test-reporter=tap', str(file)]
    start = time.perf_counter()
    result = subprocess.run(command, cwd=root, capture_output=True)
    text = result.stdout.decode('utf-8', errors='replace')
    counts = {key: int(value) for key, value in re.findall(
        r'^# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$', text, re.M)}
    valid = (result.returncode == 0 and counts.get('tests', 0) > 0
             and counts.get('tests') == counts.get('pass')
             and all(counts.get(key) == 0 for key in ['fail', 'cancelled', 'skipped', 'todo']))
    row = dict(file=file.relative_to(root).as_posix(),
               sourceSha256=hashlib.sha256(file.read_bytes()).hexdigest(),
               exitCode=result.returncode, counts=counts,
               durationSeconds=round(time.perf_counter() - start, 4),
               stdoutSha256=hashlib.sha256(result.stdout).hexdigest(),
               stderr=result.stderr.decode('utf-8', errors='replace'), passed=valid)
    return row, result.stdout


rows, transcripts = [], {}
print(json.dumps(dict(modules=len(files), workers=args.workers, started=started)), flush=True)
with ThreadPoolExecutor(max_workers=args.workers) as pool:
    for future in as_completed([pool.submit(run, file) for file in files]):
        row, raw = future.result()
        rows.append(row)
        transcripts[row['file']] = raw
        if not row['passed'] or len(rows) % 20 == 0:
            print(json.dumps(dict(finished=len(rows), file=row['file'], passed=row['passed'])), flush=True)
rows.sort(key=lambda row: row['file'])
with gzip.GzipFile(filename=str(output / 'native-tap.log.gz'), mode='wb', mtime=0) as stream:
    for row in rows:
        stream.write(('\n### ' + row['file'] + '\n').encode())
        stream.write(transcripts[row['file']])
report = dict(started=started, finished=datetime.datetime.now(datetime.timezone.utc).isoformat(),
              node=subprocess.check_output(['node', '--version'], text=True).strip(),
              root=str(root), workers=args.workers,
              method='Each module in its own Node process; native TAP final counters; no skipped failures.',
              durationSeconds=round(time.perf_counter() - clock, 4),
              modules=len(rows), modulesPassed=sum(row['passed'] for row in rows),
              counts={key: sum(row['counts'].get(key, 0) for row in rows)
                      for key in ['tests', 'suites', 'pass', 'fail', 'cancelled', 'skipped', 'todo']},
              rows=rows, passed=all(row['passed'] for row in rows))
(output / 'summary.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({key: value for key, value in report.items() if key != 'rows'}), flush=True)
raise SystemExit(0 if report['passed'] else 1)
