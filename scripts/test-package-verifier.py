#!/usr/bin/env python3
"""Small, isolated ZIP verifier examples; all writes stay under the chosen QA dir."""
import argparse
import hashlib
import json
import stat
import struct
import subprocess
import sys
import warnings
import zipfile
from pathlib import Path


def sha(data):
    return hashlib.sha256(data).hexdigest()


def make_zip(path, extra=None, directories=(), manifest_change=None, symlink=False):
    data = {
        "package.json": b'{"name":"dice-abyss","version":"5.2.0"}',
        "index.html": b'<meta name="dice-abyss-release" content="5.2.0">',
        "docs/iteration/STATE.json": b'{"outputVersion":"5.2.0","round":1}',
    }
    data.update(extra or {})
    rows = [{"path": key, "bytes": len(value), "sha256": sha(value)} for key, value in sorted(data.items())]
    if manifest_change:
        manifest_change(rows)
    data["docs/iteration/FILE_MANIFEST.json"] = json.dumps({"files": rows}).encode()
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name in directories:
            archive.writestr(name, b"")
        for name, value in data.items():
            archive.writestr("Dice-Abyss/" + name, value)
        if symlink:
            item = zipfile.ZipInfo("Dice-Abyss/link")
            item.create_system = 3
            item.external_attr = (stat.S_IFLNK | 0o777) << 16
            archive.writestr(item, "outside")
    return path


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--script", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
args.output = args.output.resolve()
args.output.mkdir(parents=True, exist_ok=False)
module = {"__name__": "package_under_review", "__file__": str(args.script)}
exec(compile(args.script.read_text(), str(args.script), "exec"), module)
verify = module["verify"]
records = []


def check(name, expected, *, extra=None, directories=(), manifest_change=None,
          symlink=False, empty=False, destination_link=False, collision=None, limit=None,
          central_count=None):
    folder = args.output / name
    folder.mkdir()
    archive = folder / "sample.zip"
    if empty:
        with zipfile.ZipFile(archive, "w"):
            pass
    else:
        make_zip(archive, extra, directories, manifest_change, symlink)
    if collision:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            with zipfile.ZipFile(archive, "a") as source:
                source.writestr(collision, b"same")
    if central_count is not None:
        raw = bytearray(archive.read_bytes())
        end = raw.rfind(b"PK\x05\x06")
        struct.pack_into("<HH", raw, end + 8, central_count, central_count)
        archive.write_bytes(raw)
    destination = folder / "extract"
    if destination_link:
        outside = folder / "different-empty-root"
        outside.mkdir()
        destination.symlink_to(outside, target_is_directory=True)
    if limit:
        key, value = limit
        prior = module.get(key)
        module[key] = value(archive) if callable(value) else value
    try:
        result = verify(archive, destination)
        accepted = True
        error = None
    except Exception as caught:
        accepted = False
        result = None
        error = f"{type(caught).__name__}: {caught}"
    finally:
        if limit:
            if prior is None:
                module.pop(key, None)
            else:
                module[key] = prior
    untouched = not any(outside.iterdir()) if destination_link else not destination.exists()
    row = {"name": name, "expected": expected, "accepted": accepted,
           "expectation_met": accepted == (expected == "accept") and (expected == "accept" or untouched),
           "rejected_without_output_changes": not accepted and untouched,
           "zip_bytes": archive.stat().st_size, "error": error}
    if result:
        row["reported_files"] = result["files"]
        row["actual_extracted_files"] = sum(p.is_file() for p in destination.rglob("*"))
    records.append(row)
    return row


check("valid", "accept", extra={"docs/中文说明.md": b"valid"}, directories=("Dice-Abyss/", "Dice-Abyss/docs/"))
check("empty", "reject", empty=True)
check("parent", "reject", extra={"notes/../escape": b"bad"})
check("backslash", "reject", extra={"notes\\escape": b"bad"})
check("drive", "reject", extra={"C:/escape": b"bad"})
check("exact-duplicate", "reject", extra={"same": b"same"}, collision="Dice-Abyss/same")
check("case-collision", "reject", extra={"a.txt": b"same", "A.txt": b"same"})
check("repeated-separator", "reject", extra={"notes/a.txt": b"same", "notes//a.txt": b"same"})
check("dot-alias", "reject", extra={"notes/a.txt": b"same", "notes/./a.txt": b"same"})
check("root-dot-alias", "reject", directories=("./Dice-Abyss/",))
check("empty-file-name", "reject", extra={"": b"bad"})
check("file-directory-prefix", "reject", extra={"node": b"file", "node/child.txt": b"child"})
check("case-directory-prefix", "reject", extra={"NODE": b"file", "node/child.txt": b"child"})
check("explicit-file-directory", "reject", extra={"node": b"file"}, directories=("Dice-Abyss/node/",))
check("windows-trailing-dot", "reject", extra={"file.txt.": b"bad"})
check("windows-device", "reject", extra={"NUL.txt": b"bad"})
check("archive-symlink", "reject", symlink=True)
check("destination-symlink", "reject", destination_link=True)
check("bad-hash", "reject", manifest_change=lambda rows: rows[0].update(sha256="0" * 64))
check("bad-bytes", "reject", manifest_change=lambda rows: rows[0].update(bytes=999))
check("unsorted-manifest", "reject", manifest_change=lambda rows: rows.reverse())
check("compression-ratio", "reject", extra={"many-zeros.txt": b"0" * 1_100_000})

# This sentinel is deliberately inside the disposable QA case directory, but
# outside its extraction root. No existing user or project file is used.
sentinel = (args.output / "outside-extraction-sentinel.txt").resolve()
sentinel.write_bytes(b"KEEP")
escape = check("absolute-after-prefix", "reject", extra={str(sentinel): b"OVERWRITTEN"})
escape["outside_sentinel_unchanged"] = sentinel.read_bytes() == b"KEEP"

# Exercise configurable resource boundaries using tiny archives. Default limit
# values are recorded below; lowering them avoids large memory/disk probes.
check("expanded-total-budget", "reject", extra={"small.txt": b"0123456789"}, limit=("MAX_EXPANDED_BYTES", 100))
check("entry-count-budget", "reject", extra={"a": b"1", "b": b"2"}, limit=("MAX_ENTRIES", 5))
check("false-central-count", "reject", central_count=1)
check("false-count-budget", "reject", extra={"a": b"1", "b": b"2"}, central_count=1, limit=("MAX_ENTRIES", 5))
check("zip-size-at-limit", "reject", limit=("MAX_ZIP_BYTES", lambda archive: archive.stat().st_size))
check("zip-size-one-below-limit", "accept", limit=("MAX_ZIP_BYTES", lambda archive: archive.stat().st_size + 1))

# CLI must inspect the supplied path before resolving it; otherwise an internal
# symlink-root guard can be bypassed by the argument parser.
cli_folder = args.output / "cli-destination-symlink"
cli_folder.mkdir()
cli_zip = make_zip(cli_folder / "sample.zip")
cli_target = cli_folder / "different-empty-root"
cli_target.mkdir()
cli_link = cli_folder / "extract"
cli_link.symlink_to(cli_target, target_is_directory=True)
run = subprocess.run([sys.executable, str(args.script), str(cli_zip), "--extract", str(cli_link)], capture_output=True, text=True)
records.append({"name": "cli-destination-symlink", "expected": "reject", "accepted": run.returncode == 0,
                "expectation_met": run.returncode != 0 and not any(cli_target.iterdir()),
                "returncode": run.returncode, "outside_directory_unchanged": not any(cli_target.iterdir())})

result = {
    "script": str(args.script),
    "script_sha256": sha(args.script.read_bytes()),
    "limits": {key: module.get(key) for key in ("MAX_ZIP_BYTES", "MAX_EXPANDED_BYTES", "MAX_FILE_BYTES", "MAX_ENTRIES", "MAX_COMPRESSION_RATIO")},
    "cases": records,
    "expectations_met": sum(r["expectation_met"] for r in records),
    "case_count": len(records),
}
(args.output / "results.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(result, ensure_ascii=False, indent=2))
raise SystemExit(0 if result["expectations_met"] == result["case_count"] else 1)
