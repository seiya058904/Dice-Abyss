# Round22 verification evidence

**Tests PASS · Standard simulation PASS · Fixed long policy INCOMPLETE.**

These are actual Round22 reruns of the supplied **5.21.0** input (`baseline/`) and frozen **5.22.0** current source (`current/`). See [VERIFY](../../../VERIFY.md) for the Chinese acceptance record and the pending final ZIP gate.

| Result | Input 5.21.0 | Current 5.22.0 |
|---|---:|---:|
| Syntax modules | 159 passed | 163 passed |
| Default module wrappers | 86/86 | 90/90 |
| Native TAP cases | 811/811 | 840/840 |
| Standard + no-shopping runs | 1000/1000 + 50/50 | 1000/1000 + 50/50 |
| Fixed 400-floor policy | 4/4, exit 0 | **2/4, exit 2** |

All 86 inherited modules retain their bytes and 811 native case counts. Four added modules contribute 29 cases. All native failure/cancellation/skip/todo counters are zero. Both short samples have zero deaths, but their stdout differs at nine statistical leaf values.

## Complete evidence and recovery

`evidence-map.json` maps all 70 copied artifacts from original path/bytes/SHA to packaged path/bytes/SHA. Every copy was read back, decompressed when applicable and compared with its original bytes. It includes both versions' complete command receipts, stdout/stderr, native summaries and original TAP.gz, full final long reports, all seven baseline saves and all fifteen current saves. No failure content was shortened.

Text above 100,000 bytes and every original save use gzip. Native TAP was already gzip and is copied byte for byte. Recover a complete report without changing the packaged gzip:

```sh
gzip -dc docs/iteration/evidence/round22/verification/current/natural-armor-v2/report.json.gz > /tmp/round22-current-report.json
```

The same operation recovers each `.save.json.gz`. Original receipts retain actual execution paths and timestamps; portable rerun commands are in VERIFY. `sourceBytes/sourceSha256` identify restored bytes and `packageBytes/packageSha256` identify shipped bytes.

The current policy retains seed 7919 stopping at floor 40 and seed 31676 at floor 85 after 21 deaths each. Seeds 15838/23757 reach floor 400. Totals are 923 completed floors, 13,294 rolls, 44 deaths, 42 armor decisions, four swaps and zero spending. No seed, policy, 160,000-decision budget or stopping rule changed. `current/save-evidence-audit.json` independently decodes all fifteen save envelopes and matches their complete normalized state hashes and metadata against the final report; no gameplay transition was executed.

## Omissions and the retained QA correction

Each original `report.json.partial.json` is a checkpoint of the same execution. All four journey objects and their complete fields exactly equal the retained final report. The map preserves each partial's original bytes/SHA, metadata and equivalence check; it is not another test or seed run. Both complete final reports remain included.

External helpers with workspace paths are not bundled. Existing project scripts reproduce the real checks and original policy. Repeated full input inventories and inherited-hash arrays are omitted with their original identities/reasons in the map. `SOURCE-INTEGRITY.json` explicitly identifies itself as a compact projection; every unique frozen path/bytes/SHA remains once, with both no-change check results.

The initial baseline post-processing summary incorrectly treated a save envelope as a gameplay state and normalized an absent outer runId. That false summary and the explicit correction remain in `baseline/development/`. The corrected summary and `decoded-save-comparison.json` decode and validate both original envelopes using unchanged storage code, normalize only the actual state.runId and compare all other fields: seven pairs match. Actual game commands had already exited 0. The old helper named in the original correction record remains external, as recorded in the map; the initial result, correction and final result are all shipped.

Current default/native tests ran concurrently, then short/long simulations ran concurrently. Wall times are execution receipts, not speed measurements; the incomplete long run also executed fewer floors. Browser functionality and formal performance are separate Round22 collections.

**PENDING_FINAL_PACKAGE_GATE:** these byte-recovery checks do not replace the root process's final ZIP safety, manifest, fresh extraction, syntax/test and HTTP gates.
