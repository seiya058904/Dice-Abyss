import json, hashlib, math
from pathlib import Path

base=Path(__file__).resolve().parent
p=base/'performance-general/performance-round.json'
d=json.loads(p.read_text()); checks=[]
def eq(a,b,label):
    ok=abs(a-b)<1e-6 if isinstance(a,(int,float)) and isinstance(b,(int,float)) else a==b
    checks.append({'label':label,'passed':ok})
    assert ok,(label,a,b)
def summary(values):
    v=sorted(values)
    return {'samples':len(v),'p50':v[math.floor((len(v)-1)*.5)],'p95':v[math.floor((len(v)-1)*.95)],'p99':v[math.floor((len(v)-1)*.99)],'max':v[-1],'min':v[0]}
eq(d['status'],'MEASURED_WITH_LIMITATIONS','completed report status')
eq(d['errors'],[],'no browser errors')
eq(len(d['inventory']['runs']),24,'24 formal inventory samples')
eq(len(d['frames']['runs']),32,'32 main frame windows')
eq(len(d['coverage']['runs']),14,'14 separate quality coverage windows')
for label in ['baseline','after']:
    for key,value in summary([r['elapsedMs'] for r in d['inventory']['runs'] if r['label']==label]).items():
        eq(d['inventory']['aggregate'][label][key],value,label+' inventory '+key)
for group in ['frames','coverage']:
    for i,r in enumerate(d[group]['runs']):
        values=r['rafIntervalsMs'];prefix=f'{group} {i}'
        for key,value in summary(values).items():
            if key in r:eq(r[key],value,prefix+' '+key)
        eq(r['frames'],len(values),prefix+' complete interval count')
        eq(r['over50'],sum(x>50 for x in values),prefix+' over50')
        eq(r['over100'],sum(x>100 for x in values),prefix+' over100')
        eq(sum(values),r['actualWindowMs'],prefix+' complete time window')
        eq(r['exactTransition'],True,prefix+' exact state')
        eq(r['mirrorSaved'],True,prefix+' mirror')
        eq(r['trusted'],True,prefix+' native click')
        eq(r['longTasks']['count'],len(r['longTasks']['samples']),prefix+' long task count')
        eq(r['longTasks']['totalOverlapMs'],sum(t['overlapMs'] for t in r['longTasks']['samples']),prefix+' long task overlap')
    for i,cell in enumerate(d[group]['aggregate']):
        runs=[r for r in d[group]['runs'] if all(r[k]==cell[k] for k in ['label','scene','width','height','effects'])]
        eq(cell['repeats'],len(runs),f'{group} cell {i} repeat count')
        eq(cell['medianRunP50'],summary([r['p50'] for r in runs])['p50'],f'{group} cell {i} p50')
        eq(cell['medianRunP95'],summary([r['p95'] for r in runs])['p50'],f'{group} cell {i} p95')
        eq(cell['worstFrameMs'],max(r['max'] for r in runs),f'{group} cell {i} max')
roots={'baseline':Path(d['baselineSource']),'after':Path(d['source'])}
source_matches=0
for label,root in roots.items():
    eq(d['sourceBefore'][label],d['sourceAfter'][label],label+' frozen source before/after')
    for row in d['sourceBefore'][label]:
        f=root/row['file'];eq(f.exists(),row['exists'],label+' existence '+row['file'])
        if row['exists']:
            eq(hashlib.sha256(f.read_bytes()).hexdigest(),row['sha256'],label+' actual source '+row['file']);source_matches+=1
eq(hashlib.sha256((roots['after']/'scripts/qa-performance-round12.mjs').read_bytes()).hexdigest(),d['scriptSha256'],'actual unchanged protocol script')
all_runs=d['frames']['runs']+d['coverage']['runs']
result={'status':'PASS','inputSha256':hashlib.sha256(p.read_bytes()).hexdigest(),'checks':checks,'passedChecks':len(checks),'sourceFilesMatched':source_matches,
        'inventory':d['inventory']['aggregate'],'rafIntervals':sum(len(r['rafIntervalsMs']) for r in all_runs),
        'rafOver50':sum(r['over50'] for r in all_runs),'longTasks':sum(len(r['longTasks']['samples']) for r in all_runs),
        'missingExpectedFullWindows':[{'group':group,**{k:r[k] for k in ['label','scene','width','repeat','max']}} for group in ['frames','coverage'] for r in d[group]['runs'] if r['effects']=='full' and not r['effectObserved']],
        'frameAggregate':d['frames']['aggregate'],'notes':['Independent arithmetic and current file identity review. No new performance run.','Original sorted-rank floor((n-1)*p) is retained, including lower-middle p50 for n=12; no discarded slow samples.','Software Chromium callback timing, not hardware GPU FPS or physical 4K.']}
(base/'performance-general/independent-review.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k not in ['checks','frameAggregate','notes','missingExpectedFullWindows']},ensure_ascii=False))
print('missingExpectedFullWindows',len(result['missingExpectedFullWindows']))
