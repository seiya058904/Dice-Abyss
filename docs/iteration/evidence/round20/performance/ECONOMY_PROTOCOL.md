# Round20 fixed consumption observation — declared before execution

The project source remains the uploaded read-only v5.19.0 baseline. This experiment observes the existing `scripts/audit-economy-round06.mjs`; it does not propose or optimise a new spending strategy.

- Fixed seeds, in fixed order: `7919`, `15838`.
- Fixed endpoint: 160 floors per seed. Existing 128,000-decision limit and stop above 20 deaths remain.
- Build: the script's existing `balanced` allocation.
- Spending policy: existing `conservative`, including first enabled adventurous event choice. This name is historical and does **not** mean zero budget or absence of financial risk.
- Shop choices use current visible item comparisons, the existing weapon-below-9 forge condition retains its 80-gold reserve, and fusion uses existing eligible low-rarity materials. No free gold, future RNG, changed price, or forced room is introduced.
- Cash accounting follows the script's explicit gross legal quote before each transaction. Gross receipts = committed gold change + gross payment. Immediate half-price refunds are counted separately from the full payment. Final gold must reconcile with both gross and net ledgers.
- The intended observation is how often the two paid dice events appear and how gross payment differs from immediate refund. `wishingvault` is only eligible from floor 140; these fixed trajectories may never encounter it. An absent event will be reported as absent, without extending the run or replacing seeds.
- Existing script forge and respec counterfactuals remain labelled counterfactuals from naturally reached states; they do not influence the natural policy's decisions and will not be presented as independent natural journeys.
- All runs, failures, stopping reasons, source identity, command, stdout/stderr, and wall time are retained. No success-rate, optimal-budget, UI-effectiveness, or balance-improvement claim is permitted from two fixed seeds.

Command (run only after the current deep baseline completes and before the root agent reserves CPU for formal browser timing):

```sh
node scripts/audit-economy-round06.mjs --source /workspace/scratch/da3202002fbd/baseline/Dice-Abyss --floors 160 --seeds 7919,15838 --builds balanced --policies conservative --output /workspace/scratch/da3202002fbd/analysis/performance/economy-baseline.json
```
