# Dice Abyss

**骰狱：无尽深渊** is a desktop-first, single-player dice dungeon RPG. Roll manually, let combat resolve from the real dice result, and open a chest after every kill.

[Play Dice Abyss](https://seiya058904.github.io/Dice-Abyss/) · [Source on GitHub](https://github.com/seiya058904/Dice-Abyss)

## Gameplay

![Dice Abyss running in a desktop browser at 1920×1080](docs/screenshots/gameplay-desktop.png)

Real gameplay captured from a fresh browser session. No save file was imported.

## Features

- Explore a six-room route, with 30 room types, recurring services, events, and special encounters.
- Roll up to six dice by clicking **Roll** or pressing **Space**. Combat is resolved from the actual roll; the player chooses when to roll.
- Collect 648 weapons, armor pieces, and relics across four rarities. Equipment has levels and item-bound upgrades.
- Fuse equipment, build through five talent paths with 30 nodes, and face 12 bosses that cycle through the endless dungeon.
- Continue beyond the early floors. There is no designed final floor; browser and numeric limits still apply.
- Keep progress in browser storage. The game has no account, server, analytics, or remote runtime dependency.
- Migrate supported V1–V3 saves to V4 with a preserved pre-migration archive.

## Run locally

Requires Node.js 20 or newer. The game has no install step or runtime package dependencies.

```powershell
npm start
```

Open <http://127.0.0.1:4188>. On Windows, you can also double-click `启动游戏.cmd`.

The server binds to `127.0.0.1`. To choose another port in PowerShell:

```powershell
$env:PORT = '4190'
npm start
```

Use a browser rather than opening `index.html` directly so JavaScript modules and local saves work correctly. Saves belong to the browser and site origin; they do not upload or sync. Export a backup before clearing browser data. Local and GitHub Pages saves are separate.

## Verify

```powershell
npm run check
npm test
npm run simulate -- 1000
```

There is no compile step. GitHub Actions runs the same checks and publishes only `index.html`, `favicon.svg`, and `src/` to Pages.

## Project layout

- `src/engine.js`, `src/content.js`, `src/equipment-content.js`, `src/equipment.js`, and `src/encounters.js`: game rules and content.
- `src/storage.js`: validated, origin-local save data and legacy migration.
- `src/app.js`, `src/views.js`, and the CSS files: browser interface, effects, and dice rendering.
- `scripts/`: local server, Windows launcher support, simulation, and audits.
- `tests/`: Node.js tests for game rules, content, saves, and views.
- `src/fonts/`: bundled offline fonts and their separate license notices.

## Known limits

- Simulated 4K long-frame performance remains unresolved. This project does not claim stable native 4K at 60 FPS.
- Automated tests and browser checks do not replace extended human playtesting. No completed long-session human playtest is claimed.
- The supported layout is a landscape desktop browser. Mobile touch play is not a target for this release.

## Licensing

No project-wide open-source license is granted by this repository. The bundled fonts are distributed under their respective SIL Open Font License 1.1 notices in `src/fonts/`; see [`src/fonts/README.md`](src/fonts/README.md). Do not assume the font license applies to the game code or other project assets.
