from pathlib import Path
import datetime, hashlib, json, subprocess, time
base = Path('/workspace/scratch/85c02edcd5e2/baseline/Dice-Abyss')
out = Path('/workspace/scratch/85c02edcd5e2/qa/baseline')
target = out/'deep/report.json'
target.parent.mkdir(parents=True, exist_ok=True)
argv = ['node','scripts/strategy-round18.mjs','--source',str(base),'--output',str(target)]
utc = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()
sha = lambda b: hashlib.sha256(b).hexdigest()
before = {str(p.relative_to(base)):sha(p.read_bytes()) for p in base.rglob('*') if p.is_file()}
start,clock = utc(),time.perf_counter()
print(json.dumps({'started':start,'command':argv}),flush=True)
with (out/'deep.stdout').open('wb') as stdout, (out/'deep.stderr').open('wb') as stderr:
    result = subprocess.run(argv,cwd=base,stdout=stdout,stderr=stderr)
after = {str(p.relative_to(base)):sha(p.read_bytes()) for p in base.rglob('*') if p.is_file()}
row = {'started':start,'finished':utc(),'durationSeconds':round(time.perf_counter()-clock,4),'command':argv,'cwd':str(base),'exitCode':result.returncode,'stdoutSha256':sha((out/'deep.stdout').read_bytes()),'stderrBytes':(out/'deep.stderr').stat().st_size,'allBaselineFilesUnchanged':before==after,'baselineFileCount':len(after),'note':'Fresh independent replay of original preregistered offline policy. Historical failed trajectories are inherited evidence, not rerun by this job. Shared host wall duration is not a speed benchmark.'}
if target.exists():
    report = json.loads(target.read_text())
    row['reportKeys'] = list(report)
    row['summary'] = report.get('summary')
(out/'deep.run.json').write_text(json.dumps(row,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(row),flush=True)
assert before == after,'Baseline modified'
raise SystemExit(result.returncode)
