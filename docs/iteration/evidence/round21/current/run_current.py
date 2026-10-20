"""Frozen-source Round21 verification. Do not launch before the parent CPU window is released."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import argparse,datetime,hashlib,json,os,platform,re,subprocess,threading,time

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source',type=Path,default=Path('/workspace/scratch/85c02edcd5e2/work/Dice-Abyss'))
parser.add_argument('--baseline',type=Path,default=Path('/workspace/scratch/85c02edcd5e2/baseline/Dice-Abyss'))
parser.add_argument('--output',type=Path,default=Path('/workspace/scratch/85c02edcd5e2/qa/current'))
parser.add_argument('--baseline-evidence',type=Path,default=Path('/workspace/scratch/85c02edcd5e2/qa/baseline'))
args=parser.parse_args()
source,baseline,out,base_evidence=[p.resolve() for p in [args.source,args.baseline,args.output,args.baseline_evidence]]
assert source != baseline and not out.is_relative_to(source) and not out.is_relative_to(baseline)
# Existing modules accept these explicit replay roots. Refuse a stray override
# that would silently test a different tree while this run freezes current.
override_names=sorted({name for p in (source/'tests').glob('*.test.mjs') for name in re.findall(r'process\.env\.((?:QA_|DICE_)[A-Z_]+)',p.read_text())})
source_overrides={name:os.environ[name] for name in override_names if os.environ.get(name)}
for name,value in source_overrides.items():
    assert (source/value).resolve()==source,f'{name} points outside the current frozen source: {value}'
out.mkdir(parents=True,exist_ok=True)
assert not (out/'source-freeze.json').exists(),'Use a fresh output directory; never overwrite a previous run.'
utc=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
sha=lambda b:hashlib.sha256(b).hexdigest()
def write(name,value):
    (out/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')

# These documents are actual existing test / replay inputs. General reports can
# be completed by the parent later without invalidating runtime/test identity.
extra=['index.html','package.json','favicon.svg','启动游戏.cmd','README.md',
       'docs/iteration/STATE.json',
       'docs/iteration/evidence/round13/natural-current-round13.json.seed-23757.incomplete-save.txt',
       'docs/iteration/evidence/round18/strategy/original-seed-23757-first-death.save.json',
       'docs/iteration/evidence/round18/strategy/PREREGISTERED.md']
executed_scripts=['scripts/check.mjs','scripts/simulate.mjs',
                  'scripts/strategy-round18.mjs','scripts/qa-combat-adventure.mjs',
                  'scripts/verify-test-cases.py']
optional_browser_harness='scripts/qa-battle-windows-round21.mjs'
optional_harness_bytes={}
def rows_for(root,paths):
    rows=[]
    for name in sorted(paths):
        raw=(root/name).read_bytes();rows.append({'path':name,'bytes':len(raw),'sha256':sha(raw)})
    return rows
def fingerprint():
    paths={p.relative_to(source).as_posix() for folder in ['src','tests'] for p in (source/folder).rglob('*') if p.is_file()}
    paths.update(extra)
    paths.update(executed_scripts)
    return rows_for(source,paths)
def script_fingerprint(root):
    paths={p.relative_to(root).as_posix() for p in (root/'scripts').rglob('*') if p.is_file()}
    rows=rows_for(root,paths-{optional_browser_harness})
    # Capture exactly the bytes hashed, even if an authorized browser-driver
    # correction happens at the same step boundary. Its temporary absence is
    # an explicit optional-script difference, not a game regression failure.
    try:
        raw=(root/optional_browser_harness).read_bytes()
    except FileNotFoundError:
        pass
    else:
        digest=sha(raw);rows.append({'path':optional_browser_harness,'bytes':len(raw),'sha256':digest})
        if root==source:optional_harness_bytes[digest]=raw
    return sorted(rows,key=lambda row:row['path'])
def changed_rows(before_rows,after_rows):
    before={r['path']:r for r in before_rows};after={r['path']:r for r in after_rows}
    return [{'path':name,'before':before.get(name),'after':after.get(name)} for name in sorted(before.keys()|after.keys()) if before.get(name)!=after.get(name)]
def scope_sha(rows):
    return sha(json.dumps(rows,ensure_ascii=False,separators=(',',':')).encode())
frozen=fingerprint()
freeze={'recordedAt':utc(),'source':str(source),
 'scope':'All src/tests files; exact executed check/simulation/strategy/adapter/native-count scripts; launch/release/root README, STATE and exact replay inputs.',
 'otherScripts':'Every script is captured and checked separately in scripts-freeze.json and scripts-after-*.json. Only the named new optional browser harness may be corrected during this correctness run.',
 'deliberateExclusions':['General reporting/evidence output',optional_browser_harness],
 'optionalHarnessReason':'Parent authorized a correction to the new optional browser driver while offline correctness runs; old and observed new bytes are retained. No source/test/runtime exception. Parent must redo affected browser QA, then final fresh ZIP syntax/full-tests gates all final scripts.',
 'files':frozen,'filesCount':len(frozen),'scopeSha256':scope_sha(frozen)}
write('source-freeze.json',freeze)
initial_scripts=script_fingerprint(source)
baseline_scripts=script_fingerprint(baseline)
original_names={r['path'] for r in baseline_scripts}
inherited_differences=changed_rows(baseline_scripts,[r for r in initial_scripts if r['path'] in original_names])
write('scripts-freeze.json',{'recordedAt':utc(),'files':initial_scripts,'filesCount':len(initial_scripts),'scopeSha256':scope_sha(initial_scripts),
 'baselineFiles':len(baseline_scripts),'inheritedDifferences':inherited_differences,'allInheritedScriptsByteIdentical':not inherited_differences,
 'newScripts':[r['path'] for r in initial_scripts if r['path'] not in original_names],
 'onlyPermittedLiveCorrection':optional_browser_harness,
 'rule':'Every other script must remain byte-identical to this launch inventory; all inherited scripts also match the input. The optional driver is never executed by this runner beyond the original syntax command. Its final version requires final ZIP syntax and separate browser QA.'})
assert not inherited_differences,'Inherited script changed before launch: '+', '.join(r['path'] for r in inherited_differences)
assert optional_browser_harness not in original_names and any(r['path']==optional_browser_harness for r in initial_scripts)
observed_harness_versions=[]
def preserve_harness(row,label):
    if any(r['sha256']==row['sha256'] for r in observed_harness_versions):
        return
    folder=out/'optional-browser-harness';folder.mkdir(exist_ok=True)
    target=folder/(row['sha256']+'.mjs');target.write_bytes(optional_harness_bytes[row['sha256']])
    observed_harness_versions.append({'observedAt':utc(),'step':label,**row,'retainedFile':target.relative_to(out).as_posix()})
    write('optional-browser-harness-versions.json',{'script':optional_browser_harness,'versions':observed_harness_versions,
     'limitation':'This captures launch and step-boundary versions only. Parent browser receipts must retain the exact executed driver version and redo affected checks if corrected.'})
preserve_harness(next(r for r in initial_scripts if r['path']==optional_browser_harness),'launch')
def check_frozen(label):
    current=fingerprint()
    differences=[r['path'] for r in changed_rows(frozen,current)]
    receipt={'checkedAt':utc(),'afterStep':label,'unchanged':not differences,'files':len(current),'scopeSha256':freeze['scopeSha256'],'differences':differences}
    write('source-after-'+label+'.json',receipt)
    assert not differences,'Frozen source changed: '+', '.join(differences)
    current_scripts=script_fingerprint(source)
    script_differences=changed_rows(initial_scripts,current_scripts)
    forbidden=[r for r in script_differences if r['path']!=optional_browser_harness]
    optional=next((r for r in current_scripts if r['path']==optional_browser_harness),None)
    if optional:preserve_harness(optional,label)
    script_receipt={'checkedAt':utc(),'afterStep':label,'files':len(current_scripts),'scopeSha256':scope_sha(current_scripts),
      'allOtherScriptsUnchanged':not forbidden,'allInheritedScriptsUnchanged':not any(r['path'] in original_names for r in script_differences),
      'differences':script_differences,'forbiddenDifferences':forbidden,'onlyPermittedLiveCorrection':optional_browser_harness}
    if label=='final':script_receipt['finalFiles']=current_scripts
    write('scripts-after-'+label+'.json',script_receipt)
    assert not forbidden,'Unapproved frozen script change: '+', '.join(r['path'] for r in forbidden)

pkg=json.loads((source/'package.json').read_text())
assert pkg['scripts']['check']=='node scripts/check.mjs'
assert pkg['scripts']['test']=='node --test tests/*.test.mjs'
assert pkg['scripts']['simulate']=='node scripts/simulate.mjs'
for relative in executed_scripts:
    assert (source/relative).read_bytes()==(baseline/relative).read_bytes(),'Changed inherited verification methodology: '+relative
baseline_modules={p.relative_to(baseline).as_posix():sha(p.read_bytes()) for p in (baseline/'tests').glob('*.test.mjs')}
current_modules={p.relative_to(source).as_posix():sha(p.read_bytes()) for p in (source/'tests').glob('*.test.mjs')}
missing=sorted(baseline_modules.keys()-current_modules.keys())
changed=sorted(name for name in baseline_modules.keys()&current_modules.keys() if baseline_modules[name]!=current_modules[name])
write('test-preservation.json',{'baselineModules':len(baseline_modules),'currentModules':len(current_modules),'missing':missing,'changedExistingModules':changed,'allExistingModulesByteIdentical':not missing and not changed,'addedModules':sorted(current_modules.keys()-baseline_modules.keys())})
assert not missing,'Existing test modules were removed: '+', '.join(missing)
assert not changed,'Inherited test modules changed: '+', '.join(changed)
environment={'recordedAt':utc(),'platform':platform.platform(),'python':platform.python_version(),
 'node':subprocess.check_output(['node','--version'],text=True).strip(),
 'npm':subprocess.check_output(['npm','--version'],text=True).strip(),
 'logicalCpus':os.cpu_count(),'root':str(source),'version':pkg['version'],
 'sourceRootOverrides':source_overrides,'nodeOptions':os.environ.get('NODE_OPTIONS',''),
 'note':'Shared cloud host. Check/default/native commands are sequential; standard and deep simulations run concurrently afterward. Parent browser correctness may overlap. None of these task durations is a game performance A/B benchmark.'}
write('environment.json',environment)
steps=[]
evidence_lock=threading.RLock()
def run(label,argv,execution_mode='sequential correctness commands; parent browser correctness may overlap'):
    with evidence_lock:
        check_frozen('before-'+label)
        start,clock=utc(),time.perf_counter()
        print(json.dumps({'step':label,'started':start,'command':argv,'executionMode':execution_mode}),flush=True)
    with (out/(label+'.stdout')).open('wb') as stdout,(out/(label+'.stderr')).open('wb') as stderr:
        result=subprocess.run(argv,cwd=source,stdout=stdout,stderr=stderr)
    raw=(out/(label+'.stdout')).read_bytes()
    row={'step':label,'command':argv,'cwd':str(source),'started':start,'finished':utc(),'durationSeconds':round(time.perf_counter()-clock,4),'exitCode':result.returncode,'stdoutBytes':len(raw),'stdoutSha256':sha(raw),'stderrBytes':(out/(label+'.stderr')).stat().st_size,'frozenScopeSha256':freeze['scopeSha256'],'executionMode':execution_mode,'timingInterpretation':'Correctness wall time on a shared host; never a game performance A/B result.'}
    if label=='default-tests':
        row['counters']={key:int(value) for key,value in re.findall(r'^[#ℹ] (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$',raw.decode(),re.M)}
        row['counterUnit']='Node default file wrappers; native cases separately counted.'
    if label=='native-tests' and (out/'native/summary.json').exists():
        native=json.loads((out/'native/summary.json').read_text())
        row['counts']=native['counts'];row['modules']=native['modules'];row['nativeDurationSeconds']=native['durationSeconds']
    if label=='standard-1000' and result.returncode==0:
        data=json.loads(raw)
        row['summary']={k:data[k] for k in ['seeds','completed','failures','deaths','totalRolls','rarities','finalLevel']}
        row['noShopping']={'seeds':len(data['noShopping']),'completed':sum(r['complete'] for r in data['noShopping']),'deaths':sum(r['deaths'] for r in data['noShopping'])}
        baseline_raw=(base_evidence/'standard-1000.stdout').read_bytes()
        row['baselineExactOutputComparison']={'bytesEqual':raw==baseline_raw,'baselineSha256':sha(baseline_raw),'currentSha256':sha(raw),'normalization':'none; complete stdout compared'}
    if label=='deep' and (out/'deep/report.json').exists():
        row['summary']=json.loads((out/'deep/report.json').read_text())['summary']
    with evidence_lock:
        write(label+'.run.json',row);steps.append(row);write('run-summary.json',steps)
        print(json.dumps(row),flush=True)
        check_frozen(label)
    assert result.returncode==0,label+' failed; raw output retained'
    if label=='default-tests':
        assert row['counters'].get('pass')==row['counters'].get('tests') and row['counters'].get('tests',0)>0
        assert all(row['counters'].get(k)==0 for k in ['fail','cancelled','skipped','todo'])
    if label=='native-tests':
        assert native['passed'] and native['modules']==native['modulesPassed'] and native['counts']['tests']==native['counts']['pass']
        baseline_native=json.loads((base_evidence/'native/summary.json').read_text())
        assert native['counts']['tests']>=baseline_native['counts']['tests'],'Native test count dropped below the actual input baseline.'
    if label=='standard-1000':
        assert row['noShopping']['completed']==50
        assert row['baselineExactOutputComparison']['bytesEqual'],'Standard simulation changed; review exact output, do not normalize it.'

run('syntax',['npm','run','check'])
run('default-tests',['npm','test'])
run('native-tests',['python3','scripts/verify-test-cases.py','--root',str(source),'--output',str(out/'native'),'--workers','4'])
with ThreadPoolExecutor(max_workers=2) as pool:
    mode='Concurrent standard1000+50 and deep4x400 correctness jobs; parent browser correctness may also overlap'
    simulations=[
      pool.submit(run,'standard-1000',['node','scripts/simulate.mjs','1000'],mode),
      pool.submit(run,'deep',['node','scripts/strategy-round18.mjs','--source',str(source),'--output',str(out/'deep/report.json')],mode)]
    for result in simulations:result.result()
driver=Path(__file__).resolve().parent
run('deep-comparison',['node',str(driver/'compare-current-round21.mjs'),str(baseline),str(source),str(base_evidence/'deep/report.json'),str(out/'deep/report.json'),str(out/'deep-comparison.json'),str(out/'source-freeze.json')])
check_frozen('final')
write('completion.json',{'completedAt':utc(),'allCommandsPassed':True,'sourceFrozenThroughout':True,'sourceScopeSha256':freeze['scopeSha256'],
 'allInheritedAndOtherScriptsFrozenThroughout':True,'optionalBrowserHarness':{'path':optional_browser_harness,'observedVersions':len(observed_harness_versions),'evidence':'optional-browser-harness-versions.json'},
 'version':pkg['version'],'steps':[r['step'] for r in steps],
 'note':'This receipt covers the explicit runtime/test/replay freeze and unchanged original/other scripts, not browser QA or final ZIP extraction gates. A corrected optional browser driver requires the parent to rerun affected browser checks. Final ZIP syntax/full-tests must gate every final script.'})
print(json.dumps({'allPassed':True,'sourceFrozenThroughout':True,'output':str(out)}),flush=True)
