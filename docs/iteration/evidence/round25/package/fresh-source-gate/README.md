# Source-identical candidate: actual fresh extraction gate

This folder records an already executed gate, completed at 2026-10-20T06:36:45.054245+00:00. It refers to the **candidate**, not the final downloadable archive. The candidate was CRC/manifest/path/type/budget verified and extracted by the unchanged project verifier into a new directory. All following commands ran from that extracted directory, with every output outside it.

- `npm run check`: exit 0, 5.4904 seconds.
- `verify-test-cases.py --root <fresh Dice-Abyss> --output <external/native> --workers 4`: 98/98 modules, **902/902 native cases**, no failures, cancelled, skipped or todo; native measurement 83.5424 seconds. Complete per-module SHA and TAP are preserved.
- `SMOKE_PORT=4192 node scripts/smoke-http.mjs --output <external/http.json>`: all **66 resources** and actual spawned-server readiness, byte contents, imports/CSS URLs, MIME and private 404 policy passed.
- All 3851 extracted files and the entire candidate ZIP remained byte-identical before/after execution.
- All **328 execution files** (src, tests, scripts, entry, package and launcher) were checked again against the final work tree before final assembly. Set SHA-256: `7a611cdcc25e425f88a6cf88b5937bfac2a3080911c53ba526248ebaf2a3da3e`. This exact file mapping is retained in `execution-files.json.gz`.

Candidate identity: `Dice-Abyss-v5.25.0-cloud-round-25-candidate.zip`, 40109664 bytes, SHA-256 `5593e980efc2806dd1e6264193328e6cdd41837db5cf7ccef49311e39ab146cb`. These are explicitly **not the final release size/hash**. The candidate includes the same executable source but precedes report closeout and the mapped lossless re-encoding of four complete JSONL traces. It is an internal test stage and is not a second deliverable.

The final archive is assembled only after these source checks and report updates. Its own CRC, complete manifest, safe extraction, syntax, 902-case runner and 66-resource HTTP gate are run again against the actual final entity; their external receipt and final delivery message identify that entity. Its exact size/counts/expanded bytes are in the standard ZIP comment. The archive cannot contain its own final SHA-256 without a circular dependency.

Compressed files in this folder preserve the complete original logs, including npm configuration warnings. Rerunning these gates requires the supplied scripts and normal Node/Python runtimes; no prior workspace path or candidate archive is a runtime dependency.
