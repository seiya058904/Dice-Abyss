"""Scratch-only command recorder. No changes to the tested project."""
from pathlib import Path
import argparse, datetime, gzip, hashlib, json, subprocess, time

parser = argparse.ArgumentParser()
parser.add_argument('--cwd', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--name', required=True)
parser.add_argument('command', nargs=argparse.REMAINDER)
args = parser.parse_args()
command = args.command[1:] if args.command[:1] == ['--'] else args.command
assert command
output = Path(args.output).resolve()
output.mkdir(parents=True, exist_ok=True)
record = output / (args.name + '.run.json')
assert not record.exists(), 'Use a fresh result name or directory'
started = datetime.datetime.now(datetime.timezone.utc).isoformat()
print(json.dumps(dict(command=command, cwd=args.cwd, startedUTC=started)), flush=True)
clock = time.perf_counter()
result = subprocess.run(command, cwd=args.cwd, capture_output=True)
seconds = round(time.perf_counter() - clock, 4)
for label, raw in [('stdout', result.stdout), ('stderr', result.stderr)]:
    (output / (args.name + '.' + label + '.log.gz')).write_bytes(gzip.compress(raw, mtime=0))
data = dict(command=command, cwd=args.cwd, startedUTC=started,
            finishedUTC=datetime.datetime.now(datetime.timezone.utc).isoformat(),
            seconds=seconds, exitCode=result.returncode,
            stdoutSha256=hashlib.sha256(result.stdout).hexdigest(),
            stderrSha256=hashlib.sha256(result.stderr).hexdigest(),
            tail=result.stdout.decode('utf-8', errors='replace')[-2200:],
            stderrTail=result.stderr.decode('utf-8', errors='replace')[-1200:])
record.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(data, ensure_ascii=False), flush=True)
raise SystemExit(result.returncode)
