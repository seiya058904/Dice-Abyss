from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.ttLib import woff2
import argparse,json,subprocess,types,re,os

parser=argparse.ArgumentParser(description='Audit offline font coverage without changing font resources.')
parser.add_argument('--output',default='docs/iteration/evidence/offline-font-cmap.json')
args=parser.parse_args()
report_path=Path(args.output).resolve()

# The runtime has fontTools but lacks its optional Python Brotli extension.
# Use Node's bundled offline decoder without changing packages or font files.
if not woff2.haveBrotli:
    def decode_brotli(data):
        source="const fs=require('node:fs'),z=require('node:zlib');process.stdout.write(z.brotliDecompressSync(fs.readFileSync(0)))"
        return subprocess.run(['node','-e',source],input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True).stdout
    woff2.brotli=types.SimpleNamespace(decompress=decode_brotli)
    woff2.haveBrotli=True
    decoder='Node built-in node:zlib Brotli decoder (Python Brotli extension unavailable)'
else:
    decoder='fontTools Python Brotli decoder'

root=Path(__file__).resolve().parents[1]
os.chdir(root)
files=[Path('index.html'),*sorted(Path('src').glob('*.js')),*sorted(Path('src').glob('*.css'))]
texts={str(p):p.read_text() for p in files}
is_han=lambda c:0x3400<=ord(c)<=0x4dbf or 0x4e00<=ord(c)<=0x9fff or 0xf900<=ord(c)<=0xfaff or 0x20000<=ord(c)<=0x323af
is_punct=lambda c:0x3000<=ord(c)<=0x303f or 0xff00<=ord(c)<=0xffef
han=sorted(set(c for s in texts.values() for c in s if is_han(c)))
punct=sorted(set(c for s in texts.values() for c in s if is_punct(c)))
results={'sourceFiles':len(files),'uniqueHan':len(han),'uniqueCjkPunctuation':len(punct),'sourceScope':'index.html and src/*.js, src/*.css; includes comments, excludes tests/docs and arbitrary imported names','decoder':decoder,'fonts':[]}
font_paths=sorted(Path('src/fonts').glob('*.woff2'))
required_fonts={'fusion-pixel-12px-proportional-zh_hans.otf.woff2','SourceHanSansCN-VF.otf.woff2'}
results['missingRequiredFonts']=sorted(required_fonts-{p.name for p in font_paths})
for path in font_paths:
    font=TTFont(path,lazy=True)
    cmap=font.getBestCmap()
    missing_han=[c for c in han if ord(c) not in cmap]
    missing_punct=[c for c in punct if ord(c) not in cmap]
    results['fonts'].append({'path':str(path),'bytes':path.stat().st_size,'unicodeMappings':len(cmap),'missingHan':missing_han,'missingHanCodepoints':[f'U+{ord(c):04X}' for c in missing_han],'missingCjkPunctuation':missing_punct})
    font.close()
# This is a structural audit of the recorded family insertions, not a browser
# CSS parser. Unchanged font size/weight/line-height prefixes remain untouched.
history_paths=[Path('docs/qa/evidence/font-fallback-repairs.json'),Path('docs/qa/evidence/font-fallback-corrections.json')]
missing_history=[str(p) for p in history_paths if not p.is_file()]
repairs=json.loads(history_paths[0].read_text()) if history_paths[0].is_file() else []
corrections=json.loads(history_paths[1].read_text()) if history_paths[1].is_file() else []
results['historicalRepairTrace']={'status':'NOT_AVAILABLE' if missing_history else 'AVAILABLE','missingInputs':missing_history,'reason':'Historical repair records were not included in the supplied ZIP.' if missing_history else 'Historical records read; current source is checked independently.'}
invalid_repairs=[]
for entry in repairs:
    before,after=entry['before'],entry['after']
    if (before.split(':',1)[0] not in ('font','font-family') or
        before.split(':',1)[0]!=after.split(':',1)[0] or
        after.replace("'Abyss Text',",'',1)!=before or
        re.search(r"[^,\s:]'Abyss Text'",after)):
        invalid_repairs.append(entry)
unresolved_repairs=[entry for entry in invalid_repairs if entry['after'] in Path(entry['file']).read_text()]
font_declarations=[]
uncovered=[]
malformed=[]
for path in sorted(Path('src').glob('*.css')):
    source=path.read_text()
    for match in re.finditer(r'(?:^|[;{])\s*(font(?:-family)?)\s*:\s*([^;}]+)',source):
        value=match.group(2)
        entry={'file':str(path),'declaration':match.group(1)+':'+value}
        font_declarations.append(entry)
        if re.search(r"[^,\s:]'Abyss Text'",value):
            malformed.append(entry)
        if not ('Abyss' in value or '--font-' in value or value.strip() in ('inherit','unset','revert')):
            uncovered.append(entry)
results['fontStackAudit']={'recordedInsertions':len(repairs),'consolasFirstPreserved':sum('Consolas' in entry['before'] for entry in repairs),'declarationsChecked':len(font_declarations),'initialInvalidInsertions':invalid_repairs,'recordedCorrections':corrections,'unresolvedInvalidInsertions':unresolved_repairs,'malformedLiveFamilies':malformed,'localFontBypasses':uncovered}
results['pass']=not results['missingRequiredFonts'] and all(not f['missingHan'] and not f['missingCjkPunctuation'] for f in results['fonts']) and not unresolved_repairs and not malformed and not uncovered
results['currentAudit']={'status':'PASS' if results['pass'] else 'FAIL','scope':'Both required local fonts, complete current-source Han/CJK punctuation coverage, and live CSS font stacks. This does not validate missing historical repair records.'}
report_path.parent.mkdir(parents=True,exist_ok=True)
report_path.write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(results,ensure_ascii=False,indent=2))
if not results['pass']:raise SystemExit(1)
