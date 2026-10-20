#!/usr/bin/env python3
"""Restore the exact uploaded v5.21 runtime to an empty external directory.

This restores runtime files only, not the original ZIP or historical documents.
All data comes from this delivered project and its small compressed overlay.
"""
from pathlib import Path, PurePosixPath
import argparse, gzip, hashlib, json

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--project', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
project = args.project.resolve()
output = args.output.absolute()
overlay_path = Path(__file__).with_name('runtime-overlay.json.gz')
overlay = json.loads(gzip.decompress(overlay_path.read_bytes()))
if output.is_symlink() or output.resolve() != output:
    parser.error('output must not be a symlink or contain symlink ancestors')
if output.exists() and any(output.iterdir()):
    parser.error('output must be empty; no existing files will be overwritten')
if output == project or project in output.parents or output in project.parents:
    parser.error('output must be outside the delivered project')
pending = []
for entry in overlay['originalFiles']:
    rel = PurePosixPath(entry['path'])
    if rel.is_absolute() or '..' in rel.parts or '\\' in str(rel):
        parser.error('noncanonical overlay path')
    target = output.joinpath(*rel.parts)
    if output not in target.resolve().parents:
        parser.error('overlay path escapes destination')
    data = (overlay['textOverrides'][str(rel)].encode('utf-8')
            if str(rel) in overlay['textOverrides'] else (project / str(rel)).read_bytes())
    if len(data) != entry['bytes'] or hashlib.sha256(data).hexdigest() != entry['sha256']:
        parser.error('source differs from uploaded runtime: ' + str(rel))
    pending.append((target, data))
output.mkdir(parents=True, exist_ok=True)
for target, data in pending:
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open('xb') as handle:
        handle.write(data)
print(json.dumps({'status':'PASS','scope':overlay['scope'],'files':len(pending),
                  'bytes':sum(len(data) for _,data in pending),'output':str(output)}))
