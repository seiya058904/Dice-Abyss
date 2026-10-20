import json, os, subprocess, time, hashlib
from pathlib import Path
root=Path('/workspace/scratch/85c02edcd5e2/work/Dice-Abyss')
out=Path('/workspace/scratch/85c02edcd5e2/qa/browser-release-regression')
out.mkdir(parents=True,exist_ok=True)
env=os.environ.copy()
env['PLAYWRIGHT_MODULE']='/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
env['CHROMIUM_PATH']='/workspace/scratch/85c02edcd5e2/qa-tools/chrome/chrome-linux64/chrome'
suites=[
 ('core','qa-core-browser.mjs',[]),
 ('interactions','qa-interactions.mjs',['--cases=rapid-click-space-refresh,forge-talents-inventory-settings,fusion-protected-three-relics,merchant-and-paid-events,next-luck-cross-room,v4-import-export-archive']),
 ('pages','qa-pages.mjs',['--cases=eight-rarity-chest-reward,codex-gates-30-50-80-140']),
 ('webgl','qa-iteration.mjs',['--cases=static-webgl-loss-and-restoration']),
 ('environment','qa-environment.mjs',[]),
]
report={'purpose':'Fresh release correctness only; may run concurrently with deterministic Node simulations, never used for performance claims.','started':time.time(),'suites':[]}
for name,script,extra in suites:
 target=out/name; target.mkdir(exist_ok=True)
 cmd=['node','scripts/'+script,'--source='+str(root),'--url=http://127.0.0.1:4189/','--label=round21','--output='+str(target),*extra]
 start=time.time()
 with (out/(name+'.stdout')).open('wb') as stdout,(out/(name+'.stderr')).open('wb') as stderr:
  result=subprocess.run(cmd,cwd=root,env=env,stdout=stdout,stderr=stderr)
 row={'name':name,'command':cmd,'exitCode':result.returncode,'elapsedSeconds':time.time()-start,'scriptSha256':hashlib.sha256((root/'scripts'/script).read_bytes()).hexdigest()}
 report['suites'].append(row)
 (out/'run-summary.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps(row),flush=True)
report['finished']=time.time();report['allPassed']=all(x['exitCode']==0 for x in report['suites'])
(out/'run-summary.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
raise SystemExit(0 if report['allPassed'] else 1)
