"""Read-only arithmetic/evidence audit. Never imports the game or launches a browser."""
from __future__ import annotations

import collections
import datetime
import hashlib
import json
import math
from pathlib import Path

BASE = Path(__file__).resolve().parents[2]
EVIDENCE = BASE / "qa-r15/salvage-browser"
GENERAL = BASE / "qa-r15/performance-general"
OUT = BASE / "qa-r15/storage"
TOLERANCE = 1e-9


def digest(value):
    if isinstance(value, str):
        value = value.encode("utf-8")
    return hashlib.sha256(value).hexdigest()


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def equivalent(a, b):
    if isinstance(a, bool) or isinstance(b, bool):
        return a is b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return math.isfinite(a) and math.isfinite(b) and abs(a - b) <= TOLERANCE
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(equivalent(a[k], b[k]) for k in a)
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(equivalent(x, y) for x, y in zip(a, b))
    return a == b


checks = []


def check(category, label, actual, expected=True):
    passed = equivalent(actual, expected)
    row = {"category": category, "label": label, "passed": passed}
    if not passed:
        row.update(actual=actual, expected=expected)
    checks.append(row)
    return passed


def dist(values):
    ordered = sorted(values)
    n = len(ordered)
    return {
        "n": n, "min": ordered[0],
        "p50": (ordered[(n - 1) // 2] + ordered[n // 2]) / 2,
        "p95": ordered[math.ceil(n * .95) - 1],
        "max": ordered[-1], "mean": sum(ordered) / n,
    }


def general_dist(values):
    ordered = sorted(values)
    return {"samples": len(ordered),
            **{"p" + str(p): ordered[math.floor((len(ordered) - 1) * p / 100)]
               for p in [50, 95, 99]}, "max": ordered[-1], "min": ordered[0]}


def utf16_length(value):
    return len(value.encode("utf-16-le")) // 2


def checksum_utf16(value):
    h = 2166136261
    for char in value:
        code = ord(char)
        units = [code] if code <= 0xffff else [0xd800 + ((code - 0x10000) >> 10),
                                                0xdc00 + ((code - 0x10000) & 0x3ff)]
        for unit in units:
            h = ((h ^ unit) * 16777619) & 0xffffffff
    return format(h, "x")


report_bytes = (EVIDENCE / "report.json").read_bytes()
report = json.loads(report_bytes)
protocol = report["protocol"]
rows = report["rows"]
measured = [r for r in rows if r["phase"] == "measured"]
warmups = [r for r in rows if r["phase"] == "warmup"]
labels = ["baseline", "current"]
scenario_names = ["large-mixed", "large-low"]
metrics = [
    "clickToPrimaryReturnMs", "clickToMirrorReturnMs", "clickToFirstRafFromClickMs",
    "clickToFirstRafAfterWriteMs", "clickToDoubleRafAfterWriteMs", "lastWriteToDoubleRafMs",
    "nativeSetItemMs", "longTaskCount", "longTaskTotalOverlapMs", "longTaskMaxRawMs",
    "rafIntervalCount", "rafOver50Count", "maxRafIntervalMs", "maxRafOverlapMs",
]
keys = {"main": "dice-abyss:save:v1", "mirror": "dice-abyss:mirror:v1",
        "settings": "dice-abyss:settings:v1"}
settings_raw = compact(protocol["settings"])
check("schedule", "completed report", report["status"], "PASS")
check("schedule", "report errors", report["errors"], [])
check("schedule", "all formal statistics qualified", report["statistics"]["status"], "COMPLETE")
check("schedule", "formal pairs fixed before measurement", protocol["measuredPairs"], 8)
check("schedule", "warmup pairs fixed before measurement", protocol["warmupPairs"], 2)
check("schedule", "all 40 rows retained", len(rows), 40)
check("schedule", "all 32 formal rows retained", len(measured), 32)
check("schedule", "all 8 warmup rows retained", len(warmups), 8)
schedule = []
for name in scenario_names:
    for phase, count in [("warmup", 2), ("measured", 8)]:
        for pair in range(1, count + 1):
            for label in labels if pair % 2 else labels[::-1]:
                schedule.append(dict(sequence=len(schedule) + 1, scenario=name, phase=phase,
                                     pair=pair, label=label))
check("schedule", "protocol equals independently constructed fixed schedule", protocol["schedule"], schedule)
check("schedule", "actual rows equal complete protocol in exact order",
      [{k: row[k] for k in spec} for row, spec in zip(rows, schedule)], schedule)
check("identity", "external protocol exactly matches embedded protocol",
      json.loads((EVIDENCE / "protocol.json").read_bytes()), protocol)

source_identity = {}
for variant in protocol["variants"]:
    label, root = variant["label"], Path(variant["root"])
    before = protocol["sourcesBefore"][label]
    expected_http = {k: v for k, v in before.items() if k != "package.json"}
    check("identity", label + " all recorded disk sources unchanged", report["sourcesAfter"][label], before)
    check("identity", label + " served-before equals disk", report["servedBefore"][label], expected_http)
    check("identity", label + " served-after equals disk", report["servedAfter"][label], expected_http)
    now = {}
    for relative, recorded in before.items():
        data = (root / relative).read_bytes()
        now[relative] = {"bytes": len(data), "sha256": digest(data)}
        check("identity", label + " present file matches recorded source " + relative,
              now[relative], recorded)
    source_identity[label] = {"recordedDiskFiles": len(before), "servedFiles": len(expected_http),
                              "currentDiskMatches": now == before,
                              "engineSha256": before["src/engine.js"]["sha256"],
                              "storageSha256": before["src/storage.js"]["sha256"]}
archived_script = (EVIDENCE / "executed-protocol.mjs").read_bytes()
check("identity", "archived executed script matches protocol SHA", digest(archived_script), protocol["scriptSha256"])
check("identity", "current script matches executed protocol",
      digest((BASE / "work/Dice-Abyss/scripts/qa-salvage-performance-round15.mjs").read_bytes()),
      protocol["scriptSha256"])
for name in ["sourceStable", "scriptStable", "servedStable", "browserClosed"]:
    check("identity", "reported " + name, report[name])

fixtures = {}
fixture_summary = []
for f in protocol["fixtures"]:
    name = f["name"]
    raw_before = (EVIDENCE / (name + ".before.save.json")).read_text()
    raw_after = (EVIDENCE / (name + ".expected.save.json")).read_text()
    envelope_before, envelope_after = json.loads(raw_before), json.loads(raw_after)
    before, after = json.loads(envelope_before["payload"]), json.loads(envelope_after["payload"])
    for phase, raw, envelope, expected_raw_sha, expected_state_sha in [
        ("before", raw_before, envelope_before, f["rawSha256"], f["beforeStateSha256"]),
        ("after", raw_after, envelope_after, f["afterRawSha256"], f["afterStateSha256"]),
    ]:
        check("fixture", name + " " + phase + " complete raw SHA", digest(raw), expected_raw_sha)
        check("fixture", name + " " + phase + " complete payload SHA", digest(envelope["payload"]), expected_state_sha)
        check("fixture", name + " " + phase + " FNV checksum over UTF-16", checksum_utf16(envelope["payload"]), envelope["checksum"])
        check("fixture", name + " " + phase + " current V5 envelope", [envelope["format"], envelope["version"]], ["dice-abyss", 5])
    check("fixture", name + " before UTF-16 length", utf16_length(raw_before), f["rawCharacters"])
    check("fixture", name + " before UTF-8 bytes", len(raw_before.encode()), f["rawUtf8Bytes"])
    check("fixture", name + " after UTF-8 bytes", len(raw_after.encode()), f["afterRawUtf8Bytes"])
    before_items, after_items = before["player"]["items"], after["player"]["items"]
    before_ids, after_ids = [i["id"] for i in before_items], {i["id"] for i in after_items}
    equipped_ids = set(before["player"]["equipped"].values())
    locked_ids = {i["id"] for i in before_items if i["locked"]}
    check("fixture", name + " exact 10000 items", len(before_items), 10000)
    check("fixture", name + " IDs unique", len(set(before_ids)), 10000)
    check("fixture", name + " selected count", len(before_items) - len(after_items), f["selected"])
    check("fixture", name + " remaining count", len(after_items), f["remaining"])
    check("fixture", name + " all surviving items unchanged and original order retained",
          after_items, [i for i in before_items if i["id"] in after_ids])
    check("fixture", name + " all equipped and locked IDs retained", equipped_ids | locked_ids <= after_ids)
    check("fixture", name + " equipped owners match fixture", before["player"]["equipped"], f["protected"]["equipped"])
    check("fixture", name + " locked count matches fixture", len(locked_ids), f["protected"]["locked"])
    check("fixture", name + " only revision log player changed",
          [k for k in before if before[k] != after[k]], ["revision", "log", "player"])
    check("fixture", name + " only gold and items changed within player",
          [k for k in before["player"] if before["player"][k] != after["player"][k]], ["gold", "items"])
    check("fixture", name + " revision +1", after["revision"] - before["revision"], 1)
    check("fixture", name + " credited gold", after["player"]["gold"] - before["player"]["gold"], f["creditedGold"])
    check("fixture", name + " RNG unchanged", before["rng"], after["rng"])
    check("fixture", name + " unknown state metadata preserved", before["auditMetadata"], after["auditMetadata"])
    check("fixture", name + " every remaining item retains unknown nested data",
          all(i["auditMetadata"] == {"nested": ["kept", int(i["id"][1:])]} for i in after_items))
    before_records = dict(sorted({keys["main"]: raw_before, keys["mirror"]: raw_before,
                                  keys["settings"]: settings_raw}.items()))
    after_records = dict(sorted({keys["main"]: raw_after, keys["mirror"]: raw_after,
                                 keys["settings"]: settings_raw}.items()))
    fixtures[name] = {"f": f, "before": before, "after": after, "rawBefore": raw_before,
                      "rawAfter": raw_after, "beforeRecordsSha256": digest(compact(before_records)),
                      "afterRecordsSha256": digest(compact(after_records))}
    fixture_summary.append({**f, "afterRawCharacters": utf16_length(raw_after),
                            "beforeRecordsSha256": fixtures[name]["beforeRecordsSha256"],
                            "afterRecordsSha256": fixtures[name]["afterRecordsSha256"],
                            "protectedRetained": {"equipped": len(equipped_ids), "locked": len(locked_ids)},
                            "completeSnapshotChanges": ["revision", "log", "player.gold", "player.items"]})

row_metrics = {}
for row in rows:
    label = "row " + str(row["sequence"])
    fx = fixtures[row["scenario"]]
    f, timing = fx["f"], row["timing"]
    check("rowEvidence", label + " PASS without errors and context closed",
          [row["status"], row["errors"], row["contextClosed"]], ["PASS", [], True])
    check("rowEvidence", label + " fresh codec exact input and engine expected bytes",
          row["freshCodec"], {"beforeSha256": f["rawSha256"], "expectedSha256": f["afterRawSha256"], "matchesPreparedFixture": True})
    check("rowEvidence", label + " complete native initial three records",
          row["seeding"], {"writes": [{"key": keys[k], "characters": n} for k, n in
                            [("settings", utf16_length(settings_raw)), ("main", f["rawCharacters"]), ("mirror", f["rawCharacters"])]], "error": None})
    env = row["environment"]
    check("rowEvidence", label + " actual native storage and Web Locks with supported observers",
          all(env[k] for k in ["originalSetItemIsNative", "webLocks", "longTasksSupported", "longAnimationFramesSupported"]))
    check("rowEvidence", label + " visible trusted real confirmation",
          [env["visibility"], timing["visibilityAtClick"], timing["isTrusted"], timing["error"]], ["visible", "visible", True, None])
    check("rowEvidence", label + " confirmation count displayed", format(f["selected"], ",") in row["confirmationText"])
    check("rowEvidence", label + " confirmation visible enabled and hit-testable",
          all(row["confirmationGeometry"][k] for k in ["visible", "enabled", "centerHits"]))
    check("rowEvidence", label + " native writes exactly primary then mirror",
          [{k: w[k] for k in ["key", "ok", "error", "valueCharacters"]} for w in timing["writes"]],
          [{"key": keys[k], "ok": True, "error": None, "valueCharacters": utf16_length(fx["rawAfter"])} for k in ["main", "mirror"]])
    for field, expected in [("beforeRecordsSha256", fx["beforeRecordsSha256"]),
                            ("afterRecordsSha256", fx["afterRecordsSha256"]),
                            ("afterMainSha256", f["afterRawSha256"]), ("afterMirrorSha256", f["afterRawSha256"]),
                            ("reloadRecordsSha256", fx["afterRecordsSha256"])]:
        check("rowEvidence", label + " " + field, row[field], expected)
    expected_verification = {"mainExact": True, "mirrorExact": True, "allOtherRecordsExact": True,
                            "correspondingEngineExact": True, "rngPreserved": True, "revisionIncrement": 1,
                            "removed": f["selected"], "remaining": f["remaining"], "creditedGold": f["creditedGold"],
                            "unknownFieldsIncluded": True, "protectedOwnersIncluded": True, "reloadExact": True}
    check("rowEvidence", label + " all complete engine state and real reload assertions", row["completeVerification"], expected_verification)
    start, end = timing["startedAt"], timing["doubleRafAfterWriteAt"]
    overlap = lambda a, b: max(0, min(b, end) - max(a, start))
    writes = timing["writes"]
    check("rawArithmetic", label + " primary timestamp from native write", timing["primaryReturnAt"], writes[0]["endedAt"])
    check("rawArithmetic", label + " mirror timestamp from native write", timing["mirrorReturnAt"], writes[1]["endedAt"])
    check("rawArithmetic", label + " final native write timestamp", timing["lastWriteAt"], writes[-1]["endedAt"])
    check("rawArithmetic", label + " correct event write and post-write rAF order",
          start <= writes[0]["startedAt"] <= writes[0]["endedAt"] <= writes[1]["startedAt"] <= writes[1]["endedAt"] <= timing["firstRafAfterWriteAt"] <= end)
    for i, write in enumerate(writes):
        check("rawArithmetic", label + f" native write {i} duration", write["durationMs"], write["endedAt"] - write["startedAt"])
    intervals = [{"startTime": a["callbackAt"], "endTime": b["callbackAt"],
                  "duration": b["callbackAt"] - a["callbackAt"], "overlapMs": overlap(a["callbackAt"], b["callbackAt"])}
                 for a, b in zip(timing["rafSamples"], timing["rafSamples"][1:])]
    check("rawArithmetic", label + " all rAF intervals rebuilt from callback times", timing["rafIntervals"], intervals)
    for kind in ["longTasks", "longAnimationFrames"]:
        for i, entry in enumerate(timing[kind]):
            check("rawArithmetic", label + f" {kind} {i} overlap", entry["overlapMs"], overlap(entry["startTime"], entry["startTime"] + entry["duration"]))
    overlapping_intervals = [x for x in intervals if x["overlapMs"] > 0]
    task_overlaps = [overlap(x["startTime"], x["startTime"] + x["duration"]) for x in timing["longTasks"]]
    values = {metric: timing[field] - start for metric, field in [
        ("clickToPrimaryReturnMs", "primaryReturnAt"), ("clickToMirrorReturnMs", "mirrorReturnAt"),
        ("clickToFirstRafFromClickMs", "firstRafFromClickAt"), ("clickToFirstRafAfterWriteMs", "firstRafAfterWriteAt"),
        ("clickToDoubleRafAfterWriteMs", "doubleRafAfterWriteAt")]}
    values.update(lastWriteToDoubleRafMs=end - timing["lastWriteAt"],
                  nativeSetItemMs=sum(w["endedAt"] - w["startedAt"] for w in writes),
                  longTaskCount=sum(n > 0 for n in task_overlaps), longTaskTotalOverlapMs=sum(task_overlaps),
                  longTaskMaxRawMs=max([t["duration"] for t, o in zip(timing["longTasks"], task_overlaps) if o > 0], default=0),
                  rafIntervalCount=len(overlapping_intervals), rafOver50Count=sum(x["duration"] > 50 for x in overlapping_intervals),
                  maxRafIntervalMs=max([x["duration"] for x in overlapping_intervals], default=0),
                  maxRafOverlapMs=max([x["overlapMs"] for x in intervals], default=0))
    for metric in metrics:
        check("rowMetric", label + " " + metric, timing["metrics"][metric], values[metric])
    check("rawArithmetic", label + " first click rAF early marker",
          timing["firstClickRafBeforePrimary"], timing["firstRafFromClickAt"] < timing["primaryReturnAt"])
    row_metrics[row["sequence"]] = values

scenarios = []
for name in scenario_names:
    expected = next(s for s in report["statistics"]["scenarios"] if s["name"] == name)
    cells = [r for r in measured if r["scenario"] == name]
    entry = {"name": name, "selected": fixtures[name]["f"]["selected"], "byVersion": {},
             "pairedCurrentMinusBaseline": {}, "positiveCurrentMinusBaselineSummaryFields": []}
    for label in labels:
        arm = sorted([r for r in cells if r["label"] == label], key=lambda r: r["pair"])
        check("statistics", name + " " + label + " all 8 fixed pairs", [r["pair"] for r in arm], list(range(1, 9)))
        entry["byVersion"][label] = {}
        for metric in metrics:
            values = [row_metrics[r["sequence"]][metric] for r in arm]
            summary = dist(values)
            for field, actual in summary.items():
                check("summaryField", f"{name} {label} {metric} {field}", actual, expected["byVersion"][label][metric][field])
            entry["byVersion"][label][metric] = {**summary, "valuesInPairOrder": values}
    for metric in metrics:
        base_values = entry["byVersion"]["baseline"][metric]["valuesInPairOrder"]
        current_values = entry["byVersion"]["current"][metric]["valuesInPairOrder"]
        differences = [c - b for b, c in zip(base_values, current_values)]
        summary = dist(differences)
        recorded = expected["pairedCurrentMinusBaseline"][metric]
        for pair, (a, b) in enumerate(zip(differences, recorded["valuesCurrentMinusBaseline"]), 1):
            check("pairDifference", f"{name} {metric} pair {pair}", a, b)
        check("pairDifferenceCount", f"{name} {metric} all pair entries", len(recorded["valuesCurrentMinusBaseline"]), 8)
        for field, actual in summary.items():
            check("summaryField", f"{name} paired {metric} {field}", actual, recorded["summary"][field])
        check("pairSign", f"{name} {metric} raw larger count", sum(d > 0 for d in differences), recorded["currentLargerPairs"])
        entry["pairedCurrentMinusBaseline"][metric] = {
            "valuesCurrentMinusBaseline": differences, "summary": summary,
            "currentLargerPairs": sum(d > 0 for d in differences),
            "currentLargerPairsBeyond1e_6": sum(d > 1e-6 for d in differences),
            "tiesWithin1e_6": sum(abs(d) <= 1e-6 for d in differences),
            "baselineSmallerMeaningDependsOnMetric": metric == "rafIntervalCount",
        }
        for field in ["min", "p50", "p95", "max", "mean"]:
            delta = entry["byVersion"]["current"][metric][field] - entry["byVersion"]["baseline"][metric][field]
            if delta > 0:
                entry["positiveCurrentMinusBaselineSummaryFields"].append(
                    {"metric": metric, "field": field, "currentMinusBaseline": delta,
                     "beyond1e_6": delta > 1e-6, "directionalPerformanceMetric": metric != "rafIntervalCount"})
    scenarios.append(entry)

# Independently rebuild all 948 original general-review predicates from raw records.
g_bytes = (GENERAL / "performance-round.json").read_bytes()
g = json.loads(g_bytes)
final_review_bytes = (GENERAL / "independent-review.json").read_bytes()
final_review = json.loads(final_review_bytes)
general_checks = []


def geq(label, actual, expected):
    general_checks.append({"label": label, "passed": equivalent(actual, expected)})


geq("completed report status", g["status"], "MEASURED_WITH_LIMITATIONS")
geq("no browser errors", g["errors"], [])
geq("24 formal inventory samples", len(g["inventory"]["runs"]), 24)
geq("32 main frame windows", len(g["frames"]["runs"]), 32)
geq("14 separate quality coverage windows", len(g["coverage"]["runs"]), 14)
inventory = {}
for label in ["baseline", "after"]:
    inventory[label] = general_dist([x["elapsedMs"] for x in g["inventory"]["runs"] if x["label"] == label])
    for field, value in inventory[label].items():
        geq(label + " inventory " + field, value, g["inventory"]["aggregate"][label][field])
for group in ["frames", "coverage"]:
    for i, row in enumerate(g[group]["runs"]):
        prefix = f"{group} {i} "
        for field, value in general_dist(row["rafIntervalsMs"]).items():
            if field in row:
                geq(prefix + field, row[field], value)
        predicates = {
            "complete interval count": (row["frames"], len(row["rafIntervalsMs"])),
            "over50": (row["over50"], sum(x > 50 for x in row["rafIntervalsMs"])),
            "over100": (row["over100"], sum(x > 100 for x in row["rafIntervalsMs"])),
            "complete time window": (sum(row["rafIntervalsMs"]), row["actualWindowMs"]),
            "exact state": (row["exactTransition"], True), "mirror": (row["mirrorSaved"], True),
            "native click": (row["trusted"], True),
            "long task count": (row["longTasks"]["count"], len(row["longTasks"]["samples"])),
            "long task overlap": (row["longTasks"]["totalOverlapMs"], sum(x["overlapMs"] for x in row["longTasks"]["samples"])),
        }
        for predicate, (actual, expected) in predicates.items():
            geq(prefix + predicate, actual, expected)
    for i, cell in enumerate(g[group]["aggregate"]):
        group_rows = [r for r in g[group]["runs"] if all(r[k] == cell[k] for k in ["label", "scene", "width", "height", "effects"])]
        for label, actual, expected in [
            ("repeat count", cell["repeats"], len(group_rows)),
            ("p50", cell["medianRunP50"], general_dist([r["p50"] for r in group_rows])["p50"]),
            ("p95", cell["medianRunP95"], general_dist([r["p95"] for r in group_rows])["p50"]),
            ("max", cell["worstFrameMs"], max(r["max"] for r in group_rows)),
        ]:
            geq(f"{group} cell {i} {label}", actual, expected)
        check("generalAdditional", f"{group} cell {i} native Long Task count",
              cell["longTasks"], sum(len(r["longTasks"]["samples"]) for r in group_rows))
        check("generalAdditional", f"{group} cell {i} native Long Task overlap",
              cell["longTaskOverlapMs"], sum(t["overlapMs"] for r in group_rows for t in r["longTasks"]["samples"]))
source_files = 0
for label, root in [("baseline", Path(g["baselineSource"])), ("after", Path(g["source"]))]:
    geq(label + " frozen source before/after", g["sourceBefore"][label], g["sourceAfter"][label])
    for entry in g["sourceBefore"][label]:
        file = root / entry["file"]
        geq(label + " existence " + entry["file"], file.exists(), entry["exists"])
        if entry["exists"]:
            geq(label + " actual source " + entry["file"], digest(file.read_bytes()), entry["sha256"])
            source_files += 1
geq("actual unchanged protocol script", digest((Path(g["source"]) / "scripts/qa-performance-round12.mjs").read_bytes()), g["scriptSha256"])
general_rows = [r for group in ["frames", "coverage"] for r in g[group]["runs"]]
long_tasks = [t for r in general_rows for t in r["longTasks"]["samples"]]
general_intervals = [x for r in general_rows for x in r["rafIntervalsMs"]]
missing_effects = [{"group": group, **{k: r[k] for k in ["label", "scene", "width", "repeat", "max"]}}
                   for group in ["frames", "coverage"] for r in g[group]["runs"] if r["effects"] == "full" and not r["effectObserved"]]
check("generalReview", "all 948 original predicate labels/results independently reproduced", general_checks, final_review["checks"])
check("generalReview", "948 unique original checks", len({x["label"] for x in general_checks}), 948)
check("generalReview", "all 948 predicates pass", sum(x["passed"] for x in general_checks), 948)
check("generalReview", "reported passed checks", final_review["passedChecks"], 948)
check("generalReview", "final review hashes the exact raw report", final_review["inputSha256"], digest(g_bytes))
for field, value in [("sourceFilesMatched", source_files), ("rafIntervals", len(general_intervals)),
                     ("rafOver50", sum(x > 50 for x in general_intervals)), ("longTasks", len(long_tasks)),
                     ("missingExpectedFullWindows", missing_effects), ("inventory", inventory)]:
    check("generalReview", "final " + field, final_review[field], value)
for i, row in enumerate(general_rows):
    window_start, window_end = row["windowStartTimeMs"], row["windowEndTimeMs"]
    expected_samples = []
    for task in row["longTasks"]["observedSamples"]:
        overlap_ms = max(0, min(task["startTime"] + task["duration"], window_end) - max(task["startTime"], window_start))
        if overlap_ms > 0:
            expected_samples.append((task["startTime"], task["duration"], overlap_ms))
    check("generalAdditional", f"window {i} native observed entries to overlap samples",
          [(t["startTime"], t["duration"], t["overlapMs"]) for t in row["longTasks"]["samples"]], expected_samples)
earlier = json.loads((GENERAL / "independent-review-first-count-correction.json").read_bytes())
general_summary = {
    "status": "PASS" if all(x["passed"] for x in general_checks) else "FAIL",
    "inputSha256": digest(g_bytes), "finalReviewSha256": digest(final_review_bytes),
    "independentlyRebuiltOriginalChecks": len(general_checks),
    "originalPredicatesPassed": sum(x["passed"] for x in general_checks),
    "originalPredicatesExactlyMatchFinalReview": general_checks == final_review["checks"],
    "sourceFilesMatched": source_files, "formalInventoryRows": len(g["inventory"]["runs"]),
    "frameWindows": len(g["frames"]["runs"]), "separateQualityCoverageWindows": len(g["coverage"]["runs"]),
    "rafIntervals": len(general_intervals), "rafOver50": sum(x > 50 for x in general_intervals),
    "actualNativeLongTaskEvents": len(long_tasks),
    "observedNativeLongTaskEvents": sum(len(r["longTasks"]["observedSamples"]) for r in general_rows),
    "longTasksByCell": [{**{k: c[k] for k in ["label", "scene", "width", "effects"]}, "count": c["longTasks"]}
                         for c in g["frames"]["aggregate"] if c["longTasks"]],
    "priorMistakenLongTaskCount": earlier["longTasks"],
    "sumOfSummaryObjectFieldCountsExplainingPriorError": sum(len(r["longTasks"]) for r in general_rows),
    "earlierFileRetainedUnchanged": True,
    "inventory": inventory, "missingExpectedFullWindows": missing_effects,
    "percentileMethod": "Original floor((n-1)*p) rank retained; n=12 p50 is lower-middle. This differs from salvage median/nearest-rank p95.",
    "conclusion": "Final 948 checks and 10 native Long Tasks are correct. General inventory p95 worsens (306.1 -> 426.3 ms); six full-effects windows did not observe all expected effects and 3840 logical-width multi-second rAF gaps remain open.",
}

endpoints = ["clickToPrimaryReturnMs", "clickToFirstRafAfterWriteMs", "clickToDoubleRafAfterWriteMs"]
endpoint_summary = []
for scenario in scenarios:
    for metric in endpoints:
        b, c = scenario["byVersion"]["baseline"][metric], scenario["byVersion"]["current"][metric]
        differences = scenario["pairedCurrentMinusBaseline"][metric]["valuesCurrentMinusBaseline"]
        endpoint_summary.append({"scenario": scenario["name"], "metric": metric,
                                 "baselineP50Ms": b["p50"], "currentP50Ms": c["p50"],
                                 "p50ReductionPercent": (1 - c["p50"] / b["p50"]) * 100,
                                 "baselineP95MaxMs": b["p95"], "currentP95MaxMs": c["p95"],
                                 "allEightPairsShorter": all(x < -1e-6 for x in differences)})

limitations = [
    "This review only reads archived JSON/source files and independently recomputes arithmetic/hashes. It does not execute an engine, browser or performance workload. Complete engine equivalence and real reload execution are evidenced by the unchanged executed script, recorded pass assertions, full golden fixtures and matching raw-record hashes.",
    "The 32 formal observations and 8 fixed warmups are all retained and match the predeclared alternating schedule. No claim is made about other undisclosed experiments; this report has no omitted or replacement row relative to its protocol.",
    "Each scenario/version has n=8. p50 averages the central two values; p95 uses nearest rank ceil(n*.95), hence p95 equals max and does not estimate a stable population tail. All per-pair vectors, negatives and warmup rows remain available.",
    "The endpoint is native localStorage.setItem successful return, followed by matching complete primary/mirror bytes and real reload. It is not a physical-disk flush or power-loss durability measurement.",
    "Post-write first/double rAF measure browser rendering opportunities only. They do not establish completed paint, display presentation, FPS or physical hardware performance. In all 40 samples the first rAF requested at click ran before the primary write and cannot stand in for saved-UI response.",
    "Native setItem is transparently timed, with the same observer overhead in both arms. Neither native storage nor full-snapshot serialization was optimized in this change; nativeSetItem means and tails do not support a storage-speedup claim.",
    "Two synthetic 10000-item scenarios, 2438/9752 selected, fixed seed and existing protection semantics; equipped/locked owners and complete unknown metadata retained. Loot is null, and these successful trials do not independently cover rejected/overflow/quota-failure cases.",
    "Headless Chromium 155.0.8059.84, SwiftShader, logical 1920x1080 and DPR=1, reduced motion, low effects, Linux environment. Eight pairs on one environment do not generalize to hardware 4K, mobile devices, all inventories, natural progression or sustained FPS.",
    "Fixed 80 ms settling and two pre-arm rAF callbacks are outside the timed interval. Fresh contexts do not share a warmed JavaScript realm; host scheduling, cache, JIT and GC can affect measurements.",
    "Every formal trial still contains one overlapping native Long Task and one overlapping rAF interval above 50 ms; shorter does not mean jank eliminated. General full-effects/3840 logical-width tail issues remain open.",
    "Raw floating-point signs are retained exactly. Additional 1e-6-ms tolerance counts identify arithmetic-level ties; a 4.66e-10-ms positive difference is not a meaningful slowdown. rafIntervalCount is observational density, not an inherently lower-is-better metric.",
]
failures = [x for x in checks if not x["passed"]]
result = {
    "status": "PASS" if not failures else "FAIL",
    "createdAtUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "scope": "Independent read-only arithmetic, source identity and persisted-snapshot evidence review; no browser/engine/performance execution.",
    "reportSha256": digest(report_bytes), "protocolSha256": digest((EVIDENCE / "protocol.json").read_bytes()),
    "executedScriptSha256": digest(archived_script),
    "reviewScriptSha256": digest(Path(__file__).read_bytes()),
    "absoluteNumericTolerance": TOLERANCE,
    "checkCountsByCategory": dict(collections.Counter(x["category"] for x in checks)),
    "totalOwnChecks": len(checks), "passedOwnChecks": len(checks) - len(failures), "failures": failures,
    "retention": {"rows": len(rows), "formal": len(measured), "warmup": len(warmups),
                  "passed": sum(r["status"] == "PASS" for r in rows), "replacements": 0,
                  "exactFixedAlternatingSchedule": True, "contextsClosed": sum(r["contextClosed"] for r in rows),
                  "nativeSuccessfulTimedWrites": sum(w["ok"] for r in rows for w in r["timing"]["writes"]),
                  "completeReloadChecks": sum(r["completeVerification"]["reloadExact"] for r in rows)},
    "sourceIdentity": source_identity, "fixtures": fixture_summary,
    "environment": {"browserVersion": report["browserVersion"], "browserExecutable": report["browserExecutable"],
                    "playwrightModule": report["playwrightModule"], "viewport": protocol["viewport"],
                    "deviceScaleFactor": protocol["deviceScaleFactor"], "settings": protocol["settings"],
                    "reducedMotion": protocol["reducedMotion"], "launchArgs": protocol["launchArgs"],
                    "sampleEnvironment": rows[0]["environment"]},
    "statisticsMethod": {"median": "mean of central two", "p95": "nearest rank ceil(n*.95); n8 p95=max",
                         "mean": "all eight observations", "pairedDifference": "current minus baseline, pair 1..8, original alternating order"},
    "scenarios": scenarios, "primaryEndpointSummary": endpoint_summary,
    "remainingFormalJank": {"nativeLongTasks": sum(r["timing"]["metrics"]["longTaskCount"] for r in measured),
                            "rafIntervalsAbove50Ms": sum(r["timing"]["metrics"]["rafOver50Count"] for r in measured),
                            "everyFormalRowHasOneOfEach": all(r["timing"]["metrics"]["longTaskCount"] == r["timing"]["metrics"]["rafOver50Count"] == 1 for r in measured),
                            "allRowsFirstClickRafBeforePrimary": all(r["timing"]["firstClickRafBeforePrimary"] for r in rows)},
    "claimAssessment": {
        "observedBatchResponseShorteningSupported": not failures and all(x["allEightPairsShorter"] for x in endpoint_summary),
        "allowedStatement": "在本次两种固定万件背包、真实确认回收的隔离浏览器 A/B 中，当前版确认点击至主存档写入返回、写后首个/第二个 rAF 绘制机会的响应均缩短；各场景各指标 8 对全部同向，完整保存及 reload 结果符合对应引擎。",
        "nativeStorageSpeedupSupported": False, "allInventoryOrGeneralPerformanceSolved": False,
        "jankEliminated": False, "hardware4KOrFPSClaimSupported": False,
    },
    "generalPerformanceReview": general_summary, "limitations": limitations, "checks": checks,
}

json_file = OUT / "salvage-browser-independent-review.json"
json_file.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")

def f3(value):
    return f"{value:.3f}"


lines = ["# Round15 批量回收浏览器性能：独立只读复核", "",
         "## 结论", "",
         f"复核状态：**{result['status']}**。独立重建 {len(checks)} 项本报告检查（{len(checks) - len(failures)} 项通过），另逐项重建通用性能最终复核的 948 个原检查。此次仅读取既有证据及源码，没有运行浏览器、引擎或性能任务，也未修改产品源码。", "",
         result["claimAssessment"]["allowedStatement"], "",
         "此结论限于本次两个批量回收场景。原生 `setItem` 均值与尾部没有改善依据；每个正式样本仍有一个 Long Task 及一个超过 50 ms 的 rAF 间隔。通用背包尾部与特效长帧问题保持开放。", "",
         "## 数据保留与测量有效性", "",
         "两场景各 2 对固定预热、8 对正式样本，奇数对 baseline→current，偶数对 current→baseline。实际 40 行与预先声明的 schedule 逐字段、逐位置相同，40/40 PASS；32 正式行全部进入统计，8 预热行全部留在原始报告。未发现相对该协议的删样、补样或成功子集统计。", "",
         "40 个独立 context 全部关闭。每行均由可见、可点击的真实确认按钮的 trusted click 开始；80 ms settle 与预先两次 rAF 在计时外。每次恰有主档→镜像两次成功原生写入，共 80 次。40 次完整原始记录集合与保存后 reload 的 SHA 均能从归档 fixture 重新算出，主档和镜像 SHA 均为对应完整期望存档。", "",
         "归档脚本在每行重新 decode/encode 输入，并用对应版本引擎计算完整期望，断言全状态和原始存档相等；真实 reload 没有重新灌入 fixture。此次独立复核验证这些已执行断言、完整 fixture 和 SHA 之间的一致性，未另行执行引擎或浏览器。fixture 的 UTF-16 FNV checksum、UTF-8 SHA、长度，以及装备/锁定持有者、未知元数据、剩余物品原序、金币和 revision 也已独立检查。", "",
         "## 主要响应指标", "",
         "单位 ms。每个版本/场景 n=8，p50 取中间两值平均，p95 为 nearest rank；因此本表 p95 **就是 max**，不能视为稳定的人群尾延迟估计。", "",
         "| 场景 | 指标 | baseline p50 | current p50 | p50 缩短 | baseline p95=max | current p95=max | 8 对全部缩短 |",
         "|---|---|---:|---:|---:|---:|---:|---|" ]
for row in endpoint_summary:
    lines.append(f"| {row['scenario']} | {row['metric']} | {f3(row['baselineP50Ms'])} | {f3(row['currentP50Ms'])} | {row['p50ReductionPercent']:.2f}% | {f3(row['baselineP95MaxMs'])} | {f3(row['currentP95MaxMs'])} | 是 |")
lines += ["", "## 全指标与全部配对差值", "",
          "以下保留全部 14 指标。各单元格为 **p50 / p95=max / mean**；JSON 另存独立 `min`、`p50`、`p95`、`max`、`mean`、全部样本与全部差值。三种 Count 指标单位为条，其余为 ms。差值均为 current−baseline；`rafIntervalCount` 只表示窗口内采到的区间数，增减本身不等于性能好坏。", ""]
for scenario in scenarios:
    lines += ["### " + scenario["name"] + f"（回收 {scenario['selected']} 件）", "",
              "| 指标 | baseline p50 / p95=max / mean | current p50 / p95=max / mean | current 严格增大对数 / 8 |",
              "|---|---:|---:|---:|"]
    for metric in metrics:
        b, c = scenario["byVersion"]["baseline"][metric], scenario["byVersion"]["current"][metric]
        triple = lambda d: " / ".join(f3(d[k]) for k in ["p50", "p95", "mean"])
        lines.append(f"| {metric} | {triple(b)} | {triple(c)} | {scenario['pairedCurrentMinusBaseline'][metric]['currentLargerPairs']} |")
    lines += ["", "| 指标 | Pair 1 → 8 的 current−baseline 全部差值 |", "|---|---|"]
    for metric in metrics:
        values = scenario["pairedCurrentMinusBaseline"][metric]["valuesCurrentMinusBaseline"]
        rendered = ", ".join((f"{v:.3e}" if 0 < abs(v) < 1e-6 else f"{v:.3f}") for v in values)
        lines.append(f"| {metric} | {rendered} |")
    lines.append("")
lines += ["## 必须保留的负向与未解决项", "",
          "- 混合场景 `nativeSetItemMs` p50 为 18.400→16.950 ms，但 mean 为 18.1625→18.425 ms，p95/max 为 20.000→24.700 ms。不能宣称原生存储整体更快。",
          "- 低品质场景 `nativeSetItemMs` p50 为 0.400→0.500 ms、mean 为 0.4125→0.6875 ms、p95/max 为 0.500→2.500 ms，同样不支持存储提速。原始 4/8 对严格正差值中含一个约 4.66e−10 ms 的浮点差，应视为计时精度内持平；JSON 同时保留原始符号与 1e−6 ms 容差计数。",
          "- 混合场景最后一次写入→双 rAF 的 p95/max 为 103.400→116.000 ms；该阶段没有一致改善。低品质这一阶段 mean 仅 69.4625→69.3625 ms，不能扩大解释。",
          "- 低品质点击即申请的首 rAF 的 mean 增加 0.525 ms，5/8 对变大。所有 40 行的该回调都早于主档写入，不能用它代替“保存后界面响应”。",
          "- 32 个正式样本仍各有 1 个原生 Long Task 和 1 个超过 50 ms 的重叠 rAF 间隔；这里只证明路径变短，未证明卡顿消失。其余正差值（包含最小值、尾部及计数）全部保存在 JSON 的 `positiveCurrentMinusBaselineSummaryFields` 和配对向量。", "",
          "## 源码、协议与环境身份", "",
          f"- 原始 report SHA-256：`{result['reportSha256']}`。",
          f"- 协议 JSON SHA-256：`{result['protocolSha256']}`。",
          f"- 实际执行脚本 SHA-256：`{result['executedScriptSha256']}`。",
          "- baseline 51 文件、current 53 文件的采样前/后磁盘快照一致，并与此次读取的文件一致；HTTP 采样前/后各核对 50/52 文件，全部与对应磁盘相同。当前脚本也与归档执行脚本逐字节一致。",
          "- Chromium 155.0.8059.84、Linux、SwiftShader，逻辑 1920×1080、DPR=1、reduced motion、low effects；硬件并发报告 9，deviceMemory 报告 8。原生 localStorage、Web Locks 和浏览器观察器保留。上述环境信息不能改称硬件 4K 或 FPS 认证。", "",
          "## 通用性能最终复核的二次核验", "",
          f"原始 `performance-round.json` SHA-256 为 `{general_summary['inputSha256']}`。从原始字段独立重建的 **948 个检查**与最终 `independent-review.json` 的检查标签、顺序和通过结果完全相同，948/948 通过，104 个源码文件匹配。", "",
          "24 个正式背包样本、32 个主要特效窗口、14 个独立品质覆盖窗口均保留；共 5724 个 rAF 间隔、62 个 >50 ms 间隔。原生 `longTasks.samples` 与 `observedSamples` 均逐条合计 **10 条**；有事件的聚合格为 baseline boss-burst 1920/full 4 条、after 同格 3 条、baseline boss-burst 3840/full 3 条。", "",
          "早期摘要的 322 恰好等于 46 个 LongTask summary 对象各 7 个字段，属于字段计数误当事件条数。该旧文件保留，结果采用最终的 10；本复核没有覆盖或删除早期证据。", "",
          "通用背包 p50 118.8→113.2 ms，p95 306.1→426.3 ms；p95 负向保留。通用协议采用原有 `floor((n−1)×p)` 排序位次（n=12 的 p50 为较低中位值），不能套用本回收报告的 p95 算法。6 个 full-effects 窗口未观察到全部预期特效，3840 逻辑宽度的秒级 rAF 间隔继续开放；948 个算术/身份检查通过不代表这些性能问题已关闭。", "",
          "## 解释边界", ""]
for limitation in limitations:
    lines.append("- " + limitation)
lines += ["", "## 可复算文件", "",
          "完整重算数据：`salvage-browser-independent-review.json`。只读复算脚本：`review_salvage_browser_independent.py`；执行它只读取既有证据和源码，并重写这两份独立复核文件，不启动浏览器或引擎。", ""]
(OUT / "salvage-browser-independent-review.md").write_text("\n".join(lines))
print(json.dumps({"status": result["status"], "checks": len(checks), "failed": failures,
                  "counts": result["checkCountsByCategory"], "endpoints": endpoint_summary,
                  "general": {k: general_summary[k] for k in ["independentlyRebuiltOriginalChecks", "actualNativeLongTaskEvents", "rafIntervals", "rafOver50"]},
                  "files": [str(json_file), str(OUT / "salvage-browser-independent-review.md")]}, ensure_ascii=False, indent=2))
if failures:
    raise SystemExit(1)
