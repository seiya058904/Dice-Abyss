from pathlib import Path
import datetime
import hashlib
import json
import subprocess
import time

root = Path('/workspace/scratch/da3202002fbd')
evidence = root / 'analysis/performance'
work = root / 'work/Dice-Abyss'
baseline = root / 'baseline/Dice-Abyss'
script = work / 'scripts/benchmark-event-risk-round20.mjs'
output = evidence / 'event-risk-cpu.json'
command = ['node', str(script), str(baseline), str(work), str(output)]

def stamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

receipt = {
    'command': command,
    'cwd': str(work),
    'startedAt': stamp(),
    'scriptSha256Before': digest(script),
    'coordination': 'Root confirmed all correctness CPU and functional browser tests had finished. Current deep simulation then completed. This benchmark ran before root started formal page performance. Shared-host background activity remains uncontrolled.',
}
start = time.perf_counter()
with (evidence / 'event-risk-cpu.stdout').open('w') as out, (evidence / 'event-risk-cpu.stderr').open('w') as err:
    result = subprocess.run(command, cwd=work, stdout=out, stderr=err)
receipt.update({
    'finishedAt': stamp(),
    'durationSeconds': time.perf_counter() - start,
    'exitCode': result.returncode,
    'scriptSha256After': digest(script),
    'outputSha256': digest(output) if output.exists() else None,
    'stdoutSha256': digest(evidence / 'event-risk-cpu.stdout'),
    'stderrSha256': digest(evidence / 'event-risk-cpu.stderr'),
})
receipt['scriptStable'] = receipt['scriptSha256Before'] == receipt['scriptSha256After']
(evidence / 'event-risk-cpu.run.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(receipt, ensure_ascii=False))
raise SystemExit(result.returncode)
