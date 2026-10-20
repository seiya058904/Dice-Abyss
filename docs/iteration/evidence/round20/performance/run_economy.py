import datetime
import hashlib
import json
import subprocess
import time
from pathlib import Path

base = Path('/workspace/scratch/da3202002fbd/baseline/Dice-Abyss')
out = Path('/workspace/scratch/da3202002fbd/analysis/performance')
cmd = ['node', 'scripts/audit-economy-round06.mjs', '--source', str(base), '--floors', '160',
       '--seeds', '7919,15838', '--builds', 'balanced', '--policies', 'conservative',
       '--output', str(out / 'economy-baseline.json')]
protocol = out / 'ECONOMY_PROTOCOL.md'
protocol_sha = hashlib.sha256(protocol.read_bytes()).hexdigest()
start = time.monotonic()
began = datetime.datetime.now(datetime.timezone.utc).isoformat()
with (out/'economy-baseline.stdout').open('w') as stdout, (out/'economy-baseline.stderr').open('w') as stderr:
    result = subprocess.run(cmd, cwd=base, stdout=stdout, stderr=stderr)
receipt = {'command': cmd, 'cwd': str(base), 'startedAt': began,
           'finishedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
           'durationSeconds': time.monotonic()-start, 'exitCode': result.returncode,
           'protocolSha256': protocol_sha,
           'protocolStable': hashlib.sha256(protocol.read_bytes()).hexdigest() == protocol_sha,
           'stdoutSha256': hashlib.sha256((out/'economy-baseline.stdout').read_bytes()).hexdigest()}
(out/'economy-baseline.run.json').write_text(json.dumps(receipt, indent=2)+'\n')
print(json.dumps(receipt), flush=True)
