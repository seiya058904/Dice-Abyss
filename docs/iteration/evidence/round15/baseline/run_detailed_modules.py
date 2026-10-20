from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import datetime
import hashlib
import json
import re
import subprocess
import time

ROOT = Path(__file__).resolve().parents[2] / 'baseline' / 'Dice-Abyss'
OUT = Path(__file__).resolve().parent / 'detailed-modules'
OUT.mkdir(exist_ok=True)
START = datetime.datetime.now(datetime.timezone.utc).isoformat()
START_CLOCK = time.perf_counter()

def run(file):
    stem = file.name.removesuffix('.test.mjs')
    argv = ['node', '--test-reporter=tap', file.relative_to(ROOT).as_posix()]
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    clock = time.perf_counter()
    with (OUT / (stem + '.tap')).open('wb') as stdout, (OUT / (stem + '.stderr')).open('wb') as stderr:
        p = subprocess.run(argv, cwd=ROOT, stdout=stdout, stderr=stderr)
    raw = (OUT / (stem + '.tap')).read_bytes()
    text = raw.decode()
    counts = {k: int(v) for k, v in re.findall(r'^# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$', text, re.M)}
    return {'file': file.relative_to(ROOT).as_posix(), 'sourceSha256': hashlib.sha256(file.read_bytes()).hexdigest(),
            'command': argv, 'started': started, 'durationSeconds': round(time.perf_counter() - clock, 4),
            'exitCode': p.returncode, 'counts': counts, 'stdoutBytes': len(raw),
            'stdoutSha256': hashlib.sha256(raw).hexdigest(),
            'valid': p.returncode == 0 and counts.get('tests', 0) > 0 and counts.get('tests') == counts.get('pass')
                     and all(counts.get(k) == 0 for k in ['fail', 'cancelled', 'skipped', 'todo'])}

files = sorted((ROOT / 'tests').glob('*.test.mjs'))
rows = []
print(json.dumps({'started': START, 'modules': len(files), 'mode': 'Each unchanged file directly runs in an independent Node process; native TAP summary is parsed.', 'workers': 4}), flush=True)
with ThreadPoolExecutor(max_workers=4) as pool:
    futures = [pool.submit(run, file) for file in files]
    for future in as_completed(futures):
        row = future.result()
        rows.append(row)
        if not row['valid'] or len(rows) % 10 == 0:
            print(json.dumps({'finishedModules': len(rows), 'last': row['file'], 'valid': row['valid']}), flush=True)
rows.sort(key=lambda x: x['file'])
report = {'started': START, 'completed': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'durationSeconds': round(time.perf_counter() - START_CLOCK, 4), 'cwd': str(ROOT),
          'concurrency': 4, 'purpose': 'Detailed case accounting because the default runner exposes only module wrappers and one flat all-file run returned no output.',
          'modules': len(rows), 'modulesPassed': sum(row['valid'] for row in rows),
          'counts': {k: sum(row['counts'].get(k, 0) for row in rows) for k in ['tests', 'suites', 'pass', 'fail', 'cancelled', 'skipped', 'todo']},
          'rows': rows, 'pass': all(row['valid'] for row in rows)}
(OUT.parent / 'test-detailed-summary.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({k: v for k, v in report.items() if k != 'rows'}), flush=True)
