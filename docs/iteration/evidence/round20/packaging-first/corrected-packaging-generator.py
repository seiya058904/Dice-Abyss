from pathlib import Path
import hashlib,json,zipfile,stat,re

base=Path('/workspace/scratch/da3202002fbd')
root=base/'work/Dice-Abyss'; docs=root/'docs/iteration'
artifact=base/'artifacts/Dice-Abyss-v5.20.0-cloud-round-20.zip'
preview=base/'analysis/package-preview.zip'
manifest_name='docs/iteration/FILE_MANIFEST.json'
stored={'docs/iteration/STATE.json','docs/iteration/LATEST_REPORT.md',
        'docs/iteration/PACKAGE_REVIEW.md',manifest_name}
sha=lambda data:hashlib.sha256(data).hexdigest()

def paths():
    return sorted((p for p in root.rglob('*') if p.is_file()), key=lambda p:str(p.relative_to(root)))

def make_manifest():
    rows=[{'path':str(p.relative_to(root)),'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())}
          for p in paths() if str(p.relative_to(root))!=manifest_name]
    result={'project':'Dice Abyss','version':'5.20.0','round':20,'algorithm':'SHA-256',
            'scope':'Every project file except this manifest; sorted relative paths; no ZIP self-reference.',
            'files':rows}
    (root/manifest_name).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    return rows

def pack(output):
    output.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(output,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9,allowZip64=False) as z:
        for p in paths():
            name=str(p.relative_to(root)); mode=zipfile.ZIP_STORED if name in stored else zipfile.ZIP_DEFLATED
            info=zipfile.ZipInfo('Dice-Abyss/'+name,date_time=(2026,10,19,0,0,0))
            info.create_system=3; info.external_attr=(stat.S_IFREG|0o644)<<16; info.compress_type=mode
            z.writestr(info,p.read_bytes(),compress_type=mode,compresslevel=9 if mode==zipfile.ZIP_DEFLATED else None)
    return output.stat().st_size

state_path=docs/'STATE.json'
state=json.loads(state_path.read_text())
for key,value in [('outputZipBytes',88888888),('outputDecimalMB','88.888888'),('outputFiles',8888),('outputExpandedBytes',88888888)]:
    state['artifactBudget'][key]=value
state_path.write_text(json.dumps(state,ensure_ascii=False,indent=2)+'\n')
for name in ['LATEST_REPORT.md','PACKAGE_REVIEW.md']:
    p=docs/name;text=p.read_text()
    if name=='LATEST_REPORT.md':
        text=re.sub(r'(?m)^(\| 新输出字节 / 十进制 MB \| ).*?( \|)$',r'\g<1>88888888 / 88.888888\g<2>',text)
        text=re.sub(r'(?m)^(\| 新输出文件 / 展开字节 \| ).*?( \|)$',r'\g<1>8888 / 88888888\g<2>',text)
    else:
        for label,value in [('ZIP 字节','88888888'),('十进制 MB','88.888888'),('文件数','8888'),('展开字节','88888888')]:
            text=re.sub(r'(?m)^(\| '+re.escape(label)+r' \| [^|]+\| )[^|]+( \|)$',lambda m:m.group(1)+value+m.group(2),text)
        text=re.sub(r'相对输入增长 \*\*\+[\d.]+%\*\*','相对输入增长 **+88.888888%**',text)
    p.write_text(text)

freeze=json.loads((base/'analysis/release-source-freeze.json').read_text())
for row in freeze['rows']:
    p=root/row['path']; assert p.stat().st_size==row['bytes'] and sha(p.read_bytes())==row['sha256'],row['path']
for p in paths():
    assert not p.is_symlink()
    rel=p.relative_to(root)
    assert not {'.git','node_modules','__pycache__','.cache','cache','generated_images'}.intersection(rel.parts),rel
    assert p.suffix.lower() not in ['.zip','.pyc'],rel
rows=make_manifest()
before={str(p.relative_to(root)):{'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())} for p in paths()}
zip_bytes=pack(preview);file_count=len(before);expanded=sum(v['bytes'] for v in before.values())
assert 10_000_000<=zip_bytes<40_000_000 and expanded<=100_000_000
assert 1000<=file_count<10000
mb=f'{zip_bytes/1_000_000:.6f}'; growth=f'{(zip_bytes/30_381_206-1)*100:09.6f}'
assert len(mb)==len('88.888888') and len(growth)==len('88.888888')

state=json.loads((docs/'STATE.json').read_text())
for key,value in [('outputZipBytes',zip_bytes),('outputDecimalMB',mb),('outputFiles',file_count),('outputExpandedBytes',expanded)]:
    state['artifactBudget'][key]=value
(docs/'STATE.json').write_text(json.dumps(state,ensure_ascii=False,indent=2)+'\n')

p=docs/'LATEST_REPORT.md';text=p.read_text()
assert text.count('88888888 / 88.888888')==1 and text.count('8888 / 88888888')==1
p.write_text(text.replace('88888888 / 88.888888',f'{zip_bytes} / {mb}').replace('8888 / 88888888',f'{file_count} / {expanded}'))
p=docs/'PACKAGE_REVIEW.md';text=p.read_text()
for a,b in [
 ('| ZIP 字节 | 30,381,206 | 88888888 |',f'| ZIP 字节 | 30,381,206 | {zip_bytes} |'),
 ('| 十进制 MB | 30.381206 | 88.888888 |',f'| 十进制 MB | 30.381206 | {mb} |'),
 ('| 文件数 | 2,499 | 8888 |',f'| 文件数 | 2,499 | {file_count} |'),
 ('| 展开字节 | 86,235,711 | 88888888 |',f'| 展开字节 | 86,235,711 | {expanded} |'),
 ('**+88.888888%**',f'**+{growth}%**')]:
    assert text.count(a)==1,a
    text=text.replace(a,b)
p.write_text(text)
make_manifest()
after={str(p.relative_to(root)):{'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())} for p in paths()}
assert before.keys()==after.keys()
assert all(before[p]['bytes']==after[p]['bytes'] for p in before)
assert all(before[p]==after[p] for p in before if p not in stored)
assert all('88888888' not in (root/p).read_text() and '88.888888' not in (root/p).read_text() for p in stored if p!=manifest_name)
final_bytes=pack(artifact)
assert final_bytes==zip_bytes,(final_bytes,zip_bytes)
with zipfile.ZipFile(artifact) as z:
    assert z.testzip() is None
    assert sum(i.file_size for i in z.infolist())==expanded
    assert len(z.infolist())==file_count
    for p in paths():assert z.read('Dice-Abyss/'+str(p.relative_to(root)))==p.read_bytes()
report={'artifact':str(artifact),'bytes':final_bytes,'decimalMB':final_bytes/1_000_000,
        'sha256':sha(artifact.read_bytes()),'files':file_count,'manifestEntries':len(rows),
        'expandedBytes':expanded,'inputBytes':30381206,'growthPercent':(final_bytes/30381206-1)*100,
        'sourceFreezeFilesVerified':len(freeze['rows']),'sourceFreezeSha256':freeze['sha256'],
        'storedMetadataFiles':sorted(stored),'metadataSizeBackfillByteStable':True,
        'freshExtractionGate':'Not yet executed; this is packaging receipt only.'}
(base/'analysis/package-receipt.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
preview.unlink()
print(json.dumps(report,ensure_ascii=False,indent=2))
