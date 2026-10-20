"""Restore audited copies/lossless gzip reports to a NEW empty directory."""
from pathlib import Path,PurePosixPath
import argparse,gzip,hashlib,json
p=argparse.ArgumentParser(description=__doc__);p.add_argument('destination',type=Path);a=p.parse_args()
base=Path(__file__).resolve().parent;target=a.destination
assert not target.is_symlink() and (not target.exists() or (target.is_dir() and not any(target.iterdir()))),'Destination must be new or empty.'
target.mkdir(parents=True,exist_ok=True);target=target.resolve()
rows=json.loads((base/'EVIDENCE_MANIFEST.json').read_text())['files']
for row in rows:
 name=row['packagedPath'];parts=PurePosixPath(name).parts
 assert parts and not name.startswith('/') and all(x not in ('','..','.') for x in parts)
 raw=(base/name).read_bytes();assert len(raw)==row['packagedBytes'] and hashlib.sha256(raw).hexdigest()==row['packagedSha256']
 if row['encoding']=='gzip':raw=gzip.decompress(raw);name=name[:-3]
 assert len(raw)==row['sourceBytes'] and hashlib.sha256(raw).hexdigest()==row['sourceSha256']
 out=target/name;assert target in out.resolve().parents
 out.parent.mkdir(parents=True,exist_ok=True)
 with out.open('xb') as h:h.write(raw)
print(json.dumps({'restored':len(rows),'allOriginalBytesAndSha256Verified':True}))
