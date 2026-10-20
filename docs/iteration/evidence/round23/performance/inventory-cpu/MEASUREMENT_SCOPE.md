# CPU measurement scope, Round23

All fixed raw samples in report.json are retained without adjustment.

- `complete-center-*`: complete synchronous `views.center` HTML generation, including selection/sorting, comparison, formatting and markup. This is the primary CPU metric.
- `comparisons-*`: the named closure includes compact-state construction and visible-card selection/sorting as well as equipment comparison. Label these results **selection/sorting + comparison**, never pure comparison API time.
- Fixture creation, output hashing and equality assertions occur outside measured time.
- 24 balanced measured pairs per cell follow 4 fixed warmups. All tails retained. Node CPU timings are not browser latency or FPS.
- The run completed before this explanatory note was written. The script and raw results were not changed after observation and no sample was rerun or replaced to improve the figures.
