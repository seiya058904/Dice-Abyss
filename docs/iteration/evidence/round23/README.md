# Round23 evidence index

Read the current top-level STATE / LATEST_REPORT / VERIFY / PERFORMANCE / BUG_LEDGER / GAMEPLAY_REVIEW / NEXT_ROUND first. This directory is self-contained evidence for the uploaded v5.22.0 → final v5.23.0 iteration. Old rounds are historical evidence, not fresh measurements.

| Directory/file | Contents and limits |
| --- | --- |
| `PREREGISTERED.md`, `ENVIRONMENT.md` | Actual premeasurement protocol, browser fallback, environment and execution discipline. |
| `baseline/` | Input archive audit, original top-level reports, exact original bytes of the seven changed runtime files, input runtime SHA list, fresh core browser and an intrusive standalone effects diagnostic. The standalone diagnostic is not pooled with formal frame samples. |
| `verification/` | Fresh input/default/native tests and short simulations, current syntax/native/short simulations/font audit, actual command/exit/log SHA, exact short stdout comparison and source stability. |
| `performance/` | Complete CPU, native inventory opening/filter/page, native save and full frame matrix raw reports/fixtures/logs; all warmups and negative samples retained. |
| `browser/` | Ten functional jobs, 45 result units (42 current and three baseline), 336 explicitly counted checks, two unchanged original PNGs, source identity and original-to-packaged mapping. |
| `renderer/` | Launch failure, two withdrawn shader attempts, final failed strict pixel diagnostic, patches and complete lossless RGBA objects. Functional recovery does not replace the failed pixel gate. |
| `long-policy/` | Both original 4×400 policy executions, their exit2/incomplete paths, full final and last-partial reports, exported saves and exact comparison scope. |
| `independent/` | Independently read source/method review, raw-data recalculation scripts/results and complete long-policy comparison; no invented missing attempt arrays. |
| `package/` | Historical-log gzip mapping and actual restore verification, source preservation audit, fresh-extracted-source gate. Final ZIP SHA is outside the ZIP. |
| `root-evidence-archive-map.json` | Exact original bytes/SHA and compressed-file mappings for root-owned input/setup/renderer diagnostic evidence. Other directories have their own maps. |

## Reading compressed evidence

Raw reports are compressed without parsing or rewriting. Use `gzip -dc path.json.gz` or Python standard-library `gzip.decompress`. The four large long-policy reports and renderer buffers use `lzma.decompress`; their manifest supplies complete decoded bytes/SHA and report dimensions. Follow each directory's explicit map when an unchanged original report mentions an old absolute scratch path or uncompressed filename. Execution paths are provenance, not runtime dependencies. Unincluded screenshots are listed with their original hashes and budget reason; no negative numeric record was discarded.

## Reconstructing this iteration's input runtime for A/B

Make a separate copy of the complete project. In that copy only, decode `docs/iteration/evidence/round23/baseline/original-runtime-files.json.gz`; its `files` array contains `path`, `bytes`, `sha256`, and exact `utf8`. Restore those seven entries and verify them against `runtime-identity.json`. All other src files/assets are byte-identical to the uploaded input. This reconstructs the original **runtime** for QA; the newly added QA and current reports remain current and must not be labeled a historical complete release. Do not overwrite the main project or any private save.

Nineteen old pure JSON logs now have `.gz` appended. Their old paths/bytes/SHA and exact restores are recorded in `package/historical-log-archive.json`. The included `scripts/restore-historical-logs-round23.py` only restores into an external empty directory. Protected old fixtures and script-default companions retain original paths.

## Honest result boundary

CPU improvement and terminal work-count reduction are established. Native UI/storage measurements are mixed; 8/8 main frame cells have worse current worst-max and nine full windows miss required observations. Strict RGBA remains FAILED, including a baseline-self restoration difference. Shader candidates are withdrawn; no physical GPU/FPS/4K60 or overall no-regression claim is made. Complete functional/compatibility verification is separate from these open performance risks.
