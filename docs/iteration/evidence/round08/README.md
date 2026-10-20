# Round08 evidence index

This directory contains new evidence from the sole Round07 ZIP to Round08 iteration. Older round directories remain history. Counts across overlapping audits, synthetic fixtures, replays and repeated harness checks must not be added as unique players.

- Input, identity and invariants: input-integrity.json, input-manifest.json, input-final-integrity.json, source-and-assets-audit.json, source-freeze.json.
- Full final Node tests: unit-summary.json, baseline-cases.tap, current-cases.tap. Final current run follows the native SUMMARY guard fix.
- Game-state evidence: simulate-*.json, deep-*.json, combat-readout-audit.json, history-label-reproduction.json, natural-65-current.save.json. Deep raw final hashes differ by new metadata; the separate complete-state comparison normalizes only the two named historical factor paths.
- Persistence: talents-shape-*.json/tap, storage-new-cases.tap, final-save-closure.json, final-save-size.json, final-committed-multiplier-independent-review.json. Final closure is current-only this round.
- Native browser: browser-*.json; readout 6 groups/678 checks, rules-scroll 1/35 (13 repeated environment checks), primary-focus 8/42. The portable readout script now defaults to all seven groups.
- Performance: performance-round.json and performance-fixture-manifest.json, plus independent review; only one formal all run, with all scheduled samples and long tails retained.
- Actual screenshots: screenshot-receipt.json and six screenshots/*.webp. The 4K viewport image alone is downsampled for documentary size; no imagegen concept is shipped.
- Failures and corrections: qa-attempts-root.json, qa-attempts-gameplay.json, qa-attempts-ux.json, ux-readout-review.md.
- Packaging: fresh-code-verification.json, fresh-core-tests.tap, fresh-http.json and package-budget.json refer to the explicitly named code-identical candidate. Final archive identity and the second fresh extraction receipt stay outside the archive to avoid self-reference.

Primary human-readable entry points: ../../LATEST_REPORT.md, ../../VERIFY.md, ../../PERFORMANCE.md, ../../PACKAGE_REVIEW.md.
