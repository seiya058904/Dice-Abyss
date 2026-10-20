# Round25 · Independent final presentation-announcement review

## Scope and verdict

Read-only review; **no blocking source finding**. Reviewed final `src/app.js`, `src/action-focus.js`, `src/visual-timeline.js`, effects cancellation, state reset/recovery/storage paths and `tests/presentation-announcement-round25.test.mjs`.

Final app SHA256: `7c463a2d27ba8a03ebdcef166c3f5988e85febc14173b006b8e84ce893faa7ad`.

The repair resolves the earlier source finding where an early resize could settle a committed action before its result reached the announcement region. It does not make a second game transition or save write. This reviewer did not edit runtime or run additional browser/announcement suites. The author's 13-case harness result and root's final native checks remain distinct evidence.

## Result preparation and generation lifecycle

- `act` prepares an announcement only after the locked transition/save succeeds and `state = after`. A failed primary save returns from the catch path before any new result is queued; the successful primary / failed mirror path keeps the committed result and warning.
- One record holds generation, runId, prepared result string and the existing event-toast intent. Preparation happens before the first animation wait for fate, combat, chest, forging/blessing/fusion and event dice.
- Normal reveal and early settlement call the same publisher. A mismatched generation returns without consuming a newer record. A matched generation consumes its record before publication; a mismatched current runId discards it. Thus a delayed old caller cannot publish another run's result or clear a newer generation's result.
- `settlePresentation` returns when not busy, captures the old generation, increments the global generation, clears the visual/busy flags and renders the already committed state. Rendering cancels the old timeline; pending waiter resolutions run after this synchronous sequence. Publication then uses the captured old generation once. Every action continuation checks generation immediately after its awaited presentation step; the delayed follow sound also checks generation and busy.
- If normal reveal already consumed the result, a later resize, Skip, hidden-page or deadline settlement has no pending result to publish. Repeated resize does not continually rebuild, since the first settlement clears busy.

## Run changes, replacement and warnings

- `clearRunSelections` clears pending presentation results for begin/import/run reset paths. `cancelSaveInteractions` clears them while invalidating the generation on recovery cancellation.
- Storage replacement clears the pending result and advances generation even when the replacement has the same runId. A different run also resets run-scoped selections. The complete-state comparison and recovery protections remain before this branch.
- A storage event with exactly the same complete state may update `ui.saveError` without rendering during anticipation. The publisher reads the current warning at publication time and prefixes it to the prepared committed result. It therefore does not freeze an obsolete warning from the initial save. If there is no current warning, it publishes only the result.
- The first warning notification and the later result notification are separate messages by design. The one-shot guarantee applies to consumption of the committed result, not to suppressing a prior save warning. Original complete primary/mirror records and unknown fields are not manipulated by this feature.

## Event timing and accessibility limits

Event results still use `notify`, now when the result is revealed rather than another delayed call after the reveal wait. The old delayed event notification and Skip-only result path are removed, so normal reveal, early Skip and automatic settlement use the same prepared string. This is a small observable toast-timing change aligned with the visible result.

The focus helper still checks captured generation and runId, modal state, target visibility/enabled state and whether the player has moved focus to another control. The review found no path bypassing those checks. The initial 43-check resize report measured button release rather than document.activeElement. The final native report below supersedes that validation limit for the six primary-action initiated scenarios; it does not expand the focus policy to arbitrary event-choice controls.

The new test file observes assignments to `#announcement` using the existing real-app/engine/storage harness; its DOM, focus and FX are stubs. It checks seven action families, no repeated result after reveal/Skip, full state/save bytes, warning prefix, same-run replacement, recovery cancellation and failed primary save. That is substantive logic coverage, not certification of external speech behavior. `notify` still updates both the existing toast status and announcement region; actual screen-reader treatment of those regions was not newly tested.

## Final native functional evidence received and inspected

Read the final resize report and its oracle source without running the browser or recomputing hashes. `qa-round25/resize-current-final/report.json` is PASS, 8 cases / 105 checks, against the declared final app source. The final input reproduction is `qa-round25/resize-baseline-extended-fixed-http/report.json`: 8 cases / 63 checks, BASELINE_RESIZE_DEFECT_REPRODUCED, with geometryMismatch in boss impact, chest charge and eternal reveal. The older `resize-baseline-extended/report.json` remains its original failed setup attempt and is not the 63-check evidence.

The six non-event-choice active cases record `document.activeElement.id === primary-action` after actual page.setViewportSize. Event-choice records BODY and deliberately has no primary-intent assertion. All seven active cases validate the committed-result live text; already announced results are not assigned again, while anticipation publishes the result once. The synthetic mirror-warning scene retains its visible warning and prefixes that warning to the one result announcement; its total two assignments include the earlier warning itself. Exact state and both persisted records remain under the report's existing full oracles. This is actual DOM/focus evidence, not external speech certification.

Other final functional numbers supplied by root: core 6 cases / 43 checks PASS; other browser functionality 47 groups / 841 checks PASS. The inspected renderer-lifecycle-final report summarizes 11/11 PASS, consisting of 3 baseline and 8 current cases. Functional lifecycle timings are not performance certification.
