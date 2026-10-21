"""Token-aware CSS stack migration/audit. QA dependency: tinycss2==1.4.0."""
import argparse, json
from pathlib import Path
import tinycss2
parser=argparse.ArgumentParser()
parser.add_argument("--write", action="store_true")
parser.add_argument("--output", required=True)
args=parser.parse_args()
root=Path(__file__).resolve().parents[1]
rows=[]
for file in sorted((root/"src").glob("*.css")):
    text=file.read_text(encoding="utf-8")
    lines=text.splitlines(keepends=True)
    offsets=[0]
    for line in lines: offsets.append(offsets[-1]+len(line))
    edits=[]
    def walk(rules):
        for rule in rules:
            if rule.type=="error": raise ValueError(rule)
            if rule.type not in ("at-rule","qualified-rule") or rule.content is None: continue
            face=rule.type=="at-rule" and rule.lower_at_keyword=="font-face"
            if rule.type=="at-rule" and not face:
                walk(tinycss2.parse_rule_list(rule.content));continue
            for d in tinycss2.parse_declaration_list(rule.content):
                if d.type!="declaration": continue
                if d.lower_name not in ("font","font-family") and not d.name.startswith("--"): continue
                tokens=[t for t in d.value if t.type not in ("whitespace","comment")]
                def families(values):
                    compact=[t for t in values if t.type not in ("whitespace","comment")]
                    for t in compact:
                        if t.type=="string" and t.value in ("Abyss Text","Abyss Pixel"):
                            yield compact,t
                        elif t.type=="function":
                            yield from families(t.arguments)
                relevant=list(families(d.value))
                if not relevant and not any(t.type=="function" and t.name=="var" for t in tokens): continue
                entry={"file":str(file.relative_to(root)),"line":d.source_line,"column":d.source_column,"property":d.name,"value":tinycss2.serialize(d.value),"fontFace":face,"missing":[]}
                for siblings,token in relevant:
                    if face: continue
                    i=siblings.index(token)
                    correct=i+2<len(siblings) and siblings[i+1].type=="literal" and siblings[i+1].value=="," and siblings[i+2].type=="string" and siblings[i+2].value==token.value+" Full"
                    if not correct:
                        entry["missing"].append(token.value)
                        pos=offsets[token.source_line-1]+token.source_column-1
                        quote=text[pos]
                        assert quote in "'\"" and text[pos+1:pos+1+len(token.value)]==token.value
                        end=pos+len(token.value)+2
                        edits.append((end,","+quote+token.value+" Full"+quote))
                rows.append(entry)
    walk(tinycss2.parse_stylesheet(text))
    if args.write and edits:
        for pos,value in sorted(edits,reverse=True): text=text[:pos]+value+text[pos:]
        file.write_text(text,encoding="utf-8",newline="\n")
out=Path(args.output);out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding="utf-8")
print(json.dumps({"declarations":len(rows),"missing":sum(len(x["missing"]) for x in rows),"write":args.write}))
if not args.write and any(x["missing"] for x in rows): raise SystemExit(1)
