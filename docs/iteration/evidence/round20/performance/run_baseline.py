import json, time, subprocess, hashlib, datetime
from pathlib import Path
base=Path('/workspace/scratch/da3202002fbd/baseline/Dice-Abyss')
out=Path('/workspace/scratch/da3202002fbd/analysis/performance')
files=['src/engine.js','src/equipment.js','src/equipment-content.js','src/deep-content.js','src/deep-rules.js','src/encounters.js','src/rarity.js','src/route-weights.js','src/content.js','src/storage.js','src/equipment-comparison.js','scripts/simulate.mjs','scripts/qa-combat-adventure.mjs','scripts/strategy-round18.mjs','package.json']
def sources():return {f:hashlib.sha256((base/f).read_bytes()).hexdigest() for f in files}
for name,cmd in [('standard',['node','scripts/simulate.mjs','1000']),('deep',['node','scripts/strategy-round18.mjs','--source',str(base),'--output',str(out/'baseline-deep'/'report.json')])]:
    before=sources();start=time.monotonic();began=datetime.datetime.now(datetime.timezone.utc).isoformat()
    with (out/(name+'-baseline.stdout')).open('w') as stdout,(out/(name+'-baseline.stderr')).open('w') as stderr:
        result=subprocess.run(cmd,cwd=base,stdout=stdout,stderr=stderr)
    receipt={'name':name,'command':cmd,'cwd':str(base),'startedAt':began,'finishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'durationSeconds':time.monotonic()-start,'exitCode':result.returncode,'sourceHashesBefore':before,'sourceHashesAfter':sources(),'sourceStable':before==sources(),'stdoutBytes':(out/(name+'-baseline.stdout')).stat().st_size,'stdoutSha256':hashlib.sha256((out/(name+'-baseline.stdout')).read_bytes()).hexdigest()}
    (out/(name+'-baseline.run.json')).write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps({k:receipt[k] for k in ['name','durationSeconds','exitCode','sourceStable','stdoutBytes']}),flush=True)
