# Round25 · Independent context-restoration probe review

## Original probe and actual result

Root completed the original `scripts/qa-context-restore-round25.mjs`: baseline and current each ran three native loss/restore cycles and 25 checks, PASS. This reviewer did not run that browser task. Its proven scope was native events, DOM fallback/class state, drawElements submissions after the restoration sequence, unchanged complete persisted snapshots, and one subsequent real manual fate action agreeing with the full expected engine state.

Before the authorized correction, the exact original script bytes were gzip archived at `qa-round25/context-restore/driver-original.mjs.gz`. Original length: 7,871 bytes; gzip: 3,267 bytes. Decompression was compared directly to the original bytes. The original report remains unchanged. No source hashes were recomputed for this review.

## Oracle findings

1. A drawElements call returning plus nonzero canvas dimensions and isConnected did not prove a nontransparent framebuffer or visible dice. The native call counter also did not query GL errors. The original label overclaimed a nonempty visible dice buffer.
2. The original draw counter baseline was collected before requesting context loss. It did not separately establish a post-loss/pre-restore counter for the recovery increment.
3. errors listened only to pageerror, so an empty array was not evidence of zero console errors or warnings.
4. Comparing both stored strings before/after proves snapshot equality. It does not measure setItem calls or forbid intermediate identical rewrites; final wording must stay at snapshot level.

## Authorized correction, statically reviewed; final native run completed by root

Only the new QA script changed. Runtime sources and production rendering behavior were not edited. Root subsequently executed the strengthened probe in a fresh directory, outside formal timing; the final report was read for this documentation review.

- After loss is confirmed and the saved snapshots checked, the probe records drawBeforeRestore and enables one recovery readback session. Draw calls while recovery sampling is disabled are still passed through synchronously without any pixel work.
- The wrapper calls the original native drawElements, increments the submission count and immediately reads the actual drawingBufferWidth × drawingBufferHeight framebuffer before returning. It uses native RGBA/UNSIGNED_BYTE readPixels with a Uint8Array. The read occurs within that same call, preventing a later task from accidentally reading a cleared preserveDrawingBuffer=false backbuffer.
- Each sampled draw records its serial, dimensions, byte count, alpha-positive pixel count, alpha sum and draw/read getError results. Sampling stops at the first nontransparent result. That captured array is digested asynchronously for SHA256 without changing the synchronous drawElements return contract. No giant raw framebuffer is persisted.
- Each cycle asserts a post-loss submission increment, at least one nontransparent capture with a valid digest and no recorded sampled GL/capture errors. Sampling is disabled again after collecting the cycle. Failed captured cycles are inserted into the report before assertions, so alpha-zero or GL-error evidence is retained if the gate fails.
- Page errors and console.error are recorded as errors. Console warnings have their own report.warnings array and are not silently recast as no-warning health.
- The original persistence assertions now describe unchanged complete snapshots rather than unmeasured write counts.

## Remaining limits

The first nontransparent capture can be the first die's draw before the second die is submitted. The strengthened oracle therefore proves that at least one restored native draw produced alpha-positive framebuffer content; it does not certify the complete two-dice image, atlas/text correctness, exact RGBA recovery, every later GL call or CSS composited visibility. Scope and assertion labels say this explicitly. The existing production callback performs the actual GPU resource rebuilding; the probe does not replace that implementation.

Readback and error queries can stall or alter GPU scheduling. They are deliberately confined to this functional probe and must not enter inventory/frame performance runs. The environment remains an idle 1920×1080 Linux software-rendered game with low effects and reduced motion, followed by one real manual fate action, not an active-motion context-loss matrix or physical GPU certification.

This reviewer did not start another browser, benchmark, syntax-run or source rehash. Root completed qa-round25/context-restore-final/report.json: baseline and current each three cycles and 31 checks (62 total), PASS, errors empty. Every recovery cycle captured 35,128 alpha-positive pixels in a 424×214 framebuffer with drawError=0/readError=0; the first captured draw SHA was 04112f293de6f59e1602477d5a14a956d2b9b7921cc51eb4975c5c45381e44bd. These are bounded functional observations, not proof of the complete two-dice image or strict cross-version restoration equivalence. Four actual ReadPixels stall warnings remain in the report (three baseline, one current); they are neither suppressed nor counted as timing evidence. ART/RESEARCH/PERFORMANCE now state this final result and retain the original report.
