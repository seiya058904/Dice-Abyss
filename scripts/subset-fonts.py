"""Reproducible offline font derivation. QA-only: fonttools==4.60.1 brotli==1.1.0.
Run with --output outside the repository. Original fonts/licenses stay intact.
"""
import argparse, hashlib, json, re
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.recordingPen import DecomposingRecordingPen

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--output", required=True)
args = parser.parse_args()
out = Path(args.output).resolve()
out.mkdir(parents=True, exist_ok=True)
files = [root / "index.html", *sorted((root / "src").glob("*.js")), *sorted((root / "src").glob("*.css"))]
# Exclude generated unicode ranges from the next run's corpus.
texts = [re.sub(r"unicode-range:[^;}]+;?", "", p.read_text(encoding="utf-8")) for p in files]
codes = sorted({ord(c) for text in texts for c in text} | set(range(32, 127)))
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
def ranges(values):
    groups = []
    for n in sorted(values):
        if groups and n == groups[-1][1] + 1:
            groups[-1][1] = n
        else:
            groups.append([n, n])
    return ",".join(f"U+{a:X}" + (f"-{b:X}" if a != b else "") for a, b in groups)

report = {"files": [str(p.relative_to(root)) for p in files], "codepoints": codes, "fonts": [], "weights": [250, 400, 700, 900]}
faces = []
for family, source, dest, internal, weight in [
    ("Abyss Pixel", "fusion-pixel-12px-proportional-zh_hans.otf.woff2", "abyss-pixel-core.woff2", "AbyssCorePixel", "400"),
    ("Abyss Text", "SourceHanSansCN-VF.otf.woff2", "abyss-text-core.woff2", "AbyssCoreText", "250 900"),
]:
    original = root / "src/fonts" / source
    target = root / "src/fonts" / dest
    font = TTFont(original, recalcTimestamp=False)
    cmap = font.getBestCmap()
    core = set(codes) & set(cmap)
    options = subset.Options()
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.name_legacy = True
    options.recalc_timestamp = False
    sub = subset.Subsetter(options=options)
    sub.populate(unicodes=core)
    sub.subset(font)
    # Preserve copyright (0), trademark (7), license (13/14) and attribution.
    instance_ps = {i.postscriptNameID for i in font["fvar"].instances} if "fvar" in font else set()
    for record in font["name"].names:
        if record.nameID in (1, 3, 4, 6, 16, 18, 21, 25) or record.nameID in instance_ps:
            value = internal + ("-" + record.toUnicode().split("-")[-1] if record.nameID in instance_ps else "")
            record.string = value.encode(record.getEncoding())
    # CFF2 has no font-name INDEX; its names live in the name table.
    if "CFF " in font:
        font["CFF "].cff.fontNames = [internal]
        for top in font["CFF "].cff.topDictIndex:
            top.FamilyName = internal
            top.FullName = internal
    font.flavor = "woff2"
    font.save(target)
    derived = TTFont(target)
    assert set(derived.getBestCmap()) == core
    identifying_ids = {1, 3, 4, 6, 16, 18, 21, 25} | instance_ps
    assert all("Source" not in n.toUnicode() and "Fusion" not in n.toUnicode() for n in derived["name"].names if n.nameID in identifying_ids)
    assert ("fvar" in font) == ("fvar" in TTFont(original))
    if "fvar" in font:
        assert [(a.axisTag,a.minValue,a.defaultValue,a.maxValue) for a in font["fvar"].axes] == [(a.axisTag,a.minValue,a.defaultValue,a.maxValue) for a in TTFont(original)["fvar"].axes]
    weights = []
    # Compare decomposed outlines and advance widths for EVERY retained glyph.
    for w in report["weights"]:
        a, b = TTFont(original), TTFont(target)
        if "fvar" in a:
            a = instantiateVariableFont(a, {"wght": w}, inplace=True)
            b = instantiateVariableFont(b, {"wght": w}, inplace=True)
        ga, gb = a.getGlyphSet(), b.getGlyphSet()
        for cp in core:
            x, y = ga[a.getBestCmap()[cp]], gb[b.getBestCmap()[cp]]
            pa, pb = DecomposingRecordingPen(ga), DecomposingRecordingPen(gb)
            x.draw(pa); y.draw(pb)
            assert x.width == y.width and pa.value == pb.value, (family, w, cp)
        weights.append({"weight": w, "glyphs": len(core), "outlinesAndAdvances": "PASS"})
    remainder = set(cmap) - core
    faces.append(f"@font-face{{font-family:'{family}';src:url('./fonts/{dest}') format('woff2');font-weight:{weight};font-display:swap}}")
    faces.append(f"@font-face{{font-family:'{family} Full';src:url('./fonts/{source}') format('woff2');font-weight:{weight};font-display:swap;unicode-range:{ranges(remainder)}}}")
    report["fonts"].append({"family":family,"source":source,"core":dest,"sourceBytes":original.stat().st_size,"coreBytes":target.stat().st_size,"sourceSha256":sha(original),"coreSha256":sha(target),"sourceCmap":len(cmap),"coreCmap":len(core),"missingSourceCodepoints":sorted(set(codes)-set(cmap)),"fallbackProbe":next(n for n in sorted(remainder) if 0x4e00 <= n <= 0x9fff),"weights":weights})
css = root / "src/refinement.css"
text = css.read_text(encoding="utf-8")
text = re.sub(r"@font-face\s*\{[^}]*\}\s*", "", text)
css.write_text("\n".join(faces) + "\n" + text, encoding="utf-8", newline="\n")
(out / "font-derivation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
fixture={"codepoints":codes,"fonts":[{"file":f["core"],"sha256":f["coreSha256"],"missing":f["missingSourceCodepoints"]} for f in report["fonts"]]}
(root/"tests/fixtures/font-core-codepoints.json").write_text(json.dumps(fixture)+"\n",encoding="utf-8",newline="\n")
print(json.dumps(report["fonts"], ensure_ascii=False))
