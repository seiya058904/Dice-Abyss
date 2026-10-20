# Original fixed 4 × 400 policy results

Both versions ran their unchanged `scripts/strategy-round18.mjs` with the original seeds 7919 / 15838 / 23757 / 31676, 400-floor target, 160,000-decision budget, death-stop threshold, free public-information defense policy and zero spending. Commands and stdout/stderr/exit are preserved under `baseline/` and `current/`. They ran in parallel as functional trajectory checks; their wall times are not performance evidence.

Both commands completed with **exit 2** and `MEASURED_WITH_INCOMPLETE_POLICY_SAMPLES`. Seeds 15838 and 23757 completed 400 floors. Seeds 7919 and 31676 stopped at the original death limit, on floor 40 / 85 with 39 / 84 completed floors. Totals match: 923 completed natural floors, 13,294 rolls, 44 deaths, 42 defense decisions and 4 swaps.

`archive-map.json` lists all 40 original files with exact original/archive bytes and SHA-256. The four complete final/last-partial reports use Python standard-library XZ, preset 6; all other JSON stays gzip level 9 / mtime 0, and existing stdout/stderr gzip files are copied unchanged. No decisions, unknown state fields, slow samples or failure records were removed. The original file total remains 40,370,754 bytes; final archived payload is 367,308 bytes, excluding this README, mapping and restoration script. The preceding all-gzip payload was 1,475,068 bytes. The 1,107,760-byte reduction is a payload/expanded-package difference; final ZIP size is measured separately.

See `FINAL-XZ-CONVERGENCE.md` for the final compression amendment. Pre-conversion map/helper/byte-index/both READMEs are preserved losslessly under `../package/pre-xz/`. The original independent report and its original restoration receipt remain unchanged; their earlier gzip-stage sizes and helper identity are historical. The new restoration result is `../independent/long-policy-xz-archive-verification.json`.

The four large report files include both full final reports and both last partial reports. Each partial deliberately retains the original `RUNNING` status with `completedSeedRuns=4`; its complete journeys match the final report. This is the original intermediate record, not a claim that the commands are still running.

To verify all compressed and decompressed bytes without writing outputs:

```sh
python docs/iteration/evidence/round23/long-policy/restore-long-policy-round23.py --verify-only
```

To restore the complete original tree, choose a new or empty directory outside the project:

```sh
python docs/iteration/evidence/round23/long-policy/restore-long-policy-round23.py --output /tmp/dice-abyss-round23-original-policy
```

Restoration verifies every byte and SHA before creating output, bounds gzip and XZ decompression, rejects symlinks and project-internal/nonempty destinations, and uses exclusive creation. The original gzip-stage 40-file restoration receipt is `../independent/long-policy-archive-verification.json`; the repeated final XZ-stage restoration and the same three guard checks are in `../independent/long-policy-xz-archive-verification.json`.

The independent comparator and `long-policy-comparison.json` are in `../independent/`. That unchanged Node comparator accepts plain/gzip inputs; after this final XZ conversion, use the restoration command above and point it at the restored plain directories. All 4 complete exported journeys, 42 full decisions, 48 exported attempt openings, 96 final-roll records, reported hashes and 15 full save pairs match; only the original declared `runId` state normalization is used. The full original `attempts` arrays were **not exported**, so their 4 reported hashes are compared without claiming to read/recalculate nonexistent arrays. Full final saves were exported only for the 2 incomplete seeds. Source paths, versions, engine hashes and timestamps/durations are retained as explicit report metadata differences.
