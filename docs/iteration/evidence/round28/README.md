# Round28 / V5.27 public release evidence

Public Pages verification for the merged `main` commit of V5.27.0, captured locally on 2026-10-22 with isolated browser contexts and synthetic saves only — no real player profile was touched.

This directory preserves the only local record of the 74-shipping-file byte comparison. It is a record of one execution made before the release was closed; it is not a new run and it does not replace CI.

## Contents

- `public-release/report.json`: full SHA-256 manifest of the 74 shipping files served by Pages, plus version, functional and recovery results. `status` PASS, `errors` [], `failedRequests` [], `sha` `c94dc752195d68831c74c546288a431907ba9f6d`, release 5.27.0, save-schema build 5, Chromium 156.0.8078.4, window 2026-10-22T01:57:39Z–01:58:14Z.
- `public-release/public-combat.png`: combat phase on the public page.
- `public-release/public-inventory-debug.png`: inventory debug surface on the public page.
- `verify-public-release.mjs`: the verification driver that produced the report. It is not part of the shipped site and is kept for reproducibility.

## File hashes (as archived)

| File | SHA-256 |
| --- | --- |
| `public-release/report.json` | E9372283E3201CC695CD62292B5648E4CDD049B5AAA7F0A6303D26DC34BD800A |
| `public-release/public-combat.png` | 1520CDF298FFCDFCCFD4032F163AC11009525BFDD2949E2F345D11F6AE180A2E |
| `public-release/public-inventory-debug.png` | 7B721FE11164167BF2F3C328A54F2FA359C20F06C5DDBABA96032790C8041434 |
| `verify-public-release.mjs` | D52865BD356FC9277AC1F67976F5301A9BF8B362F9383B264B91FB3077C7FEA5 |

## Reproduce

The driver needs an externally installed Playwright module and Chromium; neither is a game dependency and `--output` must stay outside the repository.

```powershell
$env:PLAYWRIGHT_MODULE = '<external playwright module>'
$env:CHROMIUM_PATH = '<external Chromium executable>'
node verify-public-release.mjs --url=https://seiya058904.github.io/Dice-Abyss/ `
  --repo="D:\path\to\Dice Abyss" `
  --sha=c94dc752195d68831c74c546288a431907ba9f6d `
  --output="D:\path\outside\repo\round28-rerun"
```

## Limits

- The authoritative release record is GitHub Actions run 39702021110 (verify / browser-gate / deploy all SUCCESS) and the Pages deployment log; this directory only backs the public 74/74 byte comparison.
- Reruns reproduce the comparison only while Pages still serves the `c94dc75` artifacts; a later deployment changes the served bytes.
- The captured PNGs are selected evidence, not an exhaustive screenshot set, and they do not establish physical-GPU, 4K/60 FPS or long-term memory behavior.
- The original QA working directory also held per-mode logs and duplicate `_site` builds; those were disposable and are not archived here.
