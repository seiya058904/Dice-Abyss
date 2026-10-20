# Bundled fonts

V5.27 retains the complete locally hosted V4 fonts and adds two derived core subsets. Normal game text loads the cores; imported names outside the cores request the matching complete font on demand. No third-party font server is used.

| File | Source | License notice |
| --- | --- | --- |
| `fusion-pixel-12px-proportional-zh_hans.otf.woff2` | [Fusion Pixel](https://github.com/TakWolf/fusion-pixel-font), 2026-09-01 release; the Simplified Chinese proportional font from the official package | [`fusion-pixel-OFL.txt`](fusion-pixel-OFL.txt), plus the upstream notices in [`fusion-pixel/LICENSES/`](fusion-pixel/LICENSES/) |
| `SourceHanSansCN-VF.otf.woff2` | [Adobe Source Han Sans](https://github.com/adobe-fonts/source-han-sans), Source Han Sans CN variable font | [`source-han-sans-OFL.txt`](source-han-sans-OFL.txt) |

The two original files above remain unchanged. `abyss-text-core.woff2` and
`abyss-pixel-core.woff2` are OFL derivatives, internally renamed to
`AbyssCoreText` and `AbyssCorePixel`. The former avoids Adobe's Reserved Font
Name “Source”; the Fusion Pixel notice declares no additional Reserved Font
Name. All original copyright, trademark and license records are retained,
along with the bundled upstream Fusion Pixel LICENSES directory. These
derivatives are distributed under the same SIL OFL 1.1, not the game license.

Reproduce using isolated Python tools `fonttools==4.60.1`, `brotli==1.1.0`
and `tinycss2==1.4.0`: run `scripts/subset-fonts.py --output <external-dir>`,
then `scripts/font-stacks.py --output <external-json>` (use `--write` only
when adding stacks). The corpus is index.html plus all top-level src JS/CSS,
including comments, and printable ASCII. Generated unicode-range declarations
are excluded. The generator preserves layout features and variable axes and
compares all retained decomposed outlines and advances at weights 250/400/700/900.
Pixel is a fixed 400 font; browser synthesized bold behavior is unchanged.

CSS aliases remain Abyss Text / Abyss Pixel. Each stack puts the matching
Full alias immediately after its core. Full unicode-range is the original
cmap minus core cmap, so normal core glyphs cannot trigger a complete font.
Characters outside the original cmap still use the existing system fallback;
arbitrary imported Unicode is not promised coverage. Preload targets only cores.
