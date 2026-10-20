import os,json,time,subprocess,hashlib
from pathlib import Path

base=Path(__file__).resolve().parent
root=base.parent/'work/Dice-Abyss'
baseline=base.parent/'baseline/Dice-Abyss'
out=base/'browser-regression';out.mkdir(exist_ok=True)
assert not (out/'runs.json').exists(),'Do not overwrite a prior complete or failed attempt.'
env=os.environ.copy()
env['PLAYWRIGHT_MODULE']='/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js'
env['CHROMIUM_PATH']='/tmp/dice-r15-browser/chrome-headless-shell-linux64/chrome-headless-shell'
def identities():
    paths=[root/'index.html',root/'package.json',*sorted((root/'src').glob('*.js')),*sorted((root/'src').glob('*.css'))]
    return {str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
jobs=[
 ('core',['node','scripts/qa-core-browser.mjs','--url=http://127.0.0.1:4189/',f'--output={out}/core']),
 ('fusion',['node','scripts/qa-fusion-browser.mjs','--url=http://127.0.0.1:4189/',f'--output={out}/fusion']),
 ('talents',['node','scripts/qa-talents-browser.mjs','--url=http://127.0.0.1:4189/',f'--output={out}/talents']),
 ('save-recovery',['node','scripts/qa-save-recovery-round13.mjs',f'--source={root}','--url=http://127.0.0.1:4189/',f'--output={out}/save-recovery']),
 ('decisions',['node','scripts/qa-decisions-round12.mjs',f'--source={root}','--url=http://127.0.0.1:4189/',f'--output={out}/decisions']),
 ('defeat-preparation',['node','scripts/qa-defeat-preparation-round15.mjs','--source',str(root),'--baseline',str(baseline),'--url','http://127.0.0.1:4189/','--baseline-url','http://127.0.0.1:4188/','--output',str(out/'defeat-preparation')]),
 ('lifecycle',['node','scripts/qa-renderer-lifecycle.mjs','--url=http://127.0.0.1:4189/','--baseline-url=http://127.0.0.1:4188/',f'--output={out}/lifecycle']),
]
report={'purpose':'Complete frozen-source functional browser regression. Concurrency with Node correctness/simulation means durations are not performance data.','sourceBefore':identities(),'runs':[]}
for label,argv in jobs:
    started=time.time();print('START '+label,flush=True)
    try:
        proc=subprocess.run(argv,cwd=root,env=env,capture_output=True,timeout=600)
        stdout,stderr,exit_code=proc.stdout,proc.stderr,proc.returncode
    except subprocess.TimeoutExpired as exc:
        stdout,stderr,exit_code=exc.stdout or b'',exc.stderr or b'',124
    log=out/(label+'.stdout');err=out/(label+'.stderr');log.write_bytes(stdout);err.write_bytes(stderr)
    row={'name':label,'argv':argv,'exitCode':exit_code,'elapsedSeconds':time.time()-started,'stdout':log.name,'stderr':err.name,'stdoutSha256':hashlib.sha256(stdout).hexdigest(),'stderrSha256':hashlib.sha256(stderr).hexdigest()}
    report['runs'].append(row);(out/'runs.json').write_text(json.dumps(report,indent=2)+'\n');print('END '+label+' exit='+str(exit_code),flush=True)
report['sourceAfter']=identities();report['sourceStable']=report['sourceBefore']==report['sourceAfter'];report['passed']=all(row['exitCode']==0 for row in report['runs']) and report['sourceStable']
(out/'runs.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'passed':report['passed'],'sourceStable':report['sourceStable'],'runs':[{'name':r['name'],'exitCode':r['exitCode']} for r in report['runs']]}),flush=True)
raise SystemExit(0 if report['passed'] else 1)
