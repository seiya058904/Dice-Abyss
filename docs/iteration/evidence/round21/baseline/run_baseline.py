from pathlib import Path
import datetime, hashlib, json, os, platform, re, subprocess, time, zipfile

BASE = Path('/workspace/scratch/85c02edcd5e2/baseline/Dice-Abyss')
OUT = Path('/workspace/scratch/85c02edcd5e2/qa/baseline')
ARCHIVE = Path('/workspace/scratch/85c02edcd5e2/upload/Dice-Abyss-v5.20.0-cloud-round-20(1).zip')
OUT.mkdir(parents=True, exist_ok=True)
sha = lambda data: hashlib.sha256(data).hexdigest()
now = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()

def write(name, value):
    (OUT/name).write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n')

environment = {
    'recordedAt': now(), 'platform': platform.platform(),
    'python': platform.python_version(),
    'node': subprocess.check_output(['node','--version'], text=True).strip(),
    'npm': subprocess.check_output(['npm','--version'], text=True).strip(),
    'logicalCpus': os.cpu_count(), 'root': str(BASE),
    'note': 'Shared cloud host; wall durations are task durations, not game performance benchmarks.'
}
write('environment.json', environment)

files = sorted(p for p in BASE.rglob('*') if p.is_file())
actual = {p.relative_to(BASE).as_posix(): {'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())} for p in files}
write('source-before.json', actual)
manifest = json.loads((BASE/'docs/iteration/FILE_MANIFEST.json').read_text())
expected = {r['path']: {'bytes':r['bytes'],'sha256':r['sha256']} for r in manifest['files']}
excluded = 'docs/iteration/FILE_MANIFEST.json'
missing = sorted(set(expected)-set(actual))
extra = sorted(set(actual)-set(expected)-{excluded})
mismatches = [name for name in expected.keys() & actual.keys() if expected[name] != actual[name]]
receipt = {'recordedAt':now(),'files':len(actual),'manifestEntries':len(expected),'missing':missing,'extra':extra,'mismatches':mismatches,'manifestMatches':not(missing or extra or mismatches),'manifestExcludesOnlyItself':excluded not in expected}
write('manifest-receipt.json', receipt)
assert receipt['manifestMatches'] and receipt['manifestExcludesOnlyItself']

steps = []
def run(label, argv):
    print(json.dumps({'step':label,'started':now(),'command':argv}),flush=True)
    started = now(); clock = time.perf_counter()
    with (OUT/(label+'.stdout')).open('wb') as stdout, (OUT/(label+'.stderr')).open('wb') as stderr:
        result = subprocess.run(argv, cwd=BASE, stdout=stdout, stderr=stderr)
    raw = (OUT/(label+'.stdout')).read_bytes()
    row = {'step':label,'command':argv,'cwd':str(BASE),'started':started,'finished':now(),'durationSeconds':round(time.perf_counter()-clock,4),'exitCode':result.returncode,'stdoutBytes':len(raw),'stdoutSha256':sha(raw),'stderrBytes':(OUT/(label+'.stderr')).stat().st_size}
    if label == 'default-tests':
        row['counters'] = {key:int(value) for key,value in re.findall(r'^# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$',raw.decode(),re.M)}
    if label == 'standard-1000':
        data = json.loads(raw)
        row['summary'] = {k:data[k] for k in ['seeds','completed','failures','deaths','totalRolls','rarities','finalLevel']}
        row['noShopping'] = {'seeds':len(data['noShopping']),'completed':sum(r['complete'] for r in data['noShopping']),'deaths':sum(r['deaths'] for r in data['noShopping'])}
        assert row['noShopping']['completed'] == 50
    write(label+'.run.json',row)
    steps.append(row); write('run-summary.json',steps)
    print(json.dumps(row),flush=True)
    assert result.returncode == 0, label+' failed'

run('package-verification',['python3','scripts/verify-package.py',str(ARCHIVE),'--output',str(OUT/'package-receipt.json')])
run('syntax',['npm','run','check'])
run('default-tests',['npm','test'])
run('native-tests',['python3','scripts/verify-test-cases.py','--root',str(BASE),'--output',str(OUT/'native'),'--workers','4'])
run('standard-1000',['node','scripts/simulate.mjs','1000'])
after = {p.relative_to(BASE).as_posix(): {'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())} for p in sorted(BASE.rglob('*')) if p.is_file()}
write('source-after-verification.json',{'recordedAt':now(),'files':len(after),'unchanged':actual==after,'differences':sorted(name for name in set(actual)|set(after) if actual.get(name)!=after.get(name))})
assert actual == after, 'Baseline changed while QA ran'
print(json.dumps({'allPassed':True,'baselineUnchanged':True,'evidence':str(OUT)}),flush=True)
