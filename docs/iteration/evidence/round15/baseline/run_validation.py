from pathlib import Path
import datetime
import hashlib
import json
import subprocess
import time

ROOT = Path(__file__).resolve().parents[2] / 'baseline' / 'Dice-Abyss'
OUT = Path(__file__).resolve().parent

def run(name, argv):
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    start = time.perf_counter()
    with (OUT / f'{name}.stdout').open('wb') as stdout, (OUT / f'{name}.stderr').open('wb') as stderr:
        p = subprocess.run(argv, cwd=ROOT, stdout=stdout, stderr=stderr)
    result = {'name': name, 'command': argv, 'cwd': str(ROOT), 'started': started,
              'completed': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'durationSeconds': round(time.perf_counter() - start, 4), 'exitCode': p.returncode}
    for stream in ['stdout', 'stderr']:
        raw = (OUT / f'{name}.{stream}').read_bytes()
        result[stream] = {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
    (OUT / f'{name}.run.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result), flush=True)
    return result

if __name__ == '__main__':
    results = []
    for name, argv in [('check', ['npm', 'run', 'check']), ('test', ['npm', 'test']),
                       ('simulate1000', ['npm', 'run', 'simulate', '--', '1000'])]:
        results.append(run(name, argv))
    (OUT / 'validation-runs.json').write_text(json.dumps(results, indent=2) + '\n')
