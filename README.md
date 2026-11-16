# MapartCraft Local Studio

[Russian version](README.ru.md)

**MapartCraft Local Studio is a community fork of [mike2b2t/mapartcraft](https://github.com/mike2b2t/mapartcraft)**, which is based on the original [MapartCraft by rebane2001](https://rebane2001.com/mapartcraft). It keeps the upstream NBT / map.dat workflow and adds a local-first studio, newer Minecraft palettes, extra image processing, a built-in pixel editor and project files. It is not a separate map-art format or a from-scratch replacement.

**Live site:** <https://axopupelbruh.github.io/mapartcraft/>

## What this fork adds

### Studio and interface

- Installable PWA with offline app-shell caching; all processing stays in the browser.
- Style presets: Clean Pixel, Retro Grid, Retro 1-bit, Soft Gradient and Low-Block. The Studio panel also has a global **Dither strength** slider: `0%` disables error propagation, `100%` matches the preset, `200%` makes the dither stronger.
- Pixel-perfect 2D preview: Pixel (nearest), Smooth and High quality (Lanczos), integer zoom, optional pixel grid and auto-scale for pixel mode. Every slider also reacts to the mouse wheel.
- A **hold-to-compare** button next to the preview: while it is held, the picture before the cleanup filters is shown, and the pixels of the last render come back when it is released.
- **Palette accuracy** under the preview: the share of pixels that hit a palette colour exactly. Useful to judge how much the palette repaints the picture.
- Mobile layout: one column, 40 px touch targets, a horizontally scrollable materials table and full-width export buttons.
- Studio and editor UI localized in English and Russian, with a language switcher in the header; other languages fall back to English.

### Palette and dithering

- Minecraft palette versions from 1.12.2 through 1.21.5, plus 1.21.11, 26.2 and 26.3. Newer blocks include copper shelves/chests/statues/lanterns/lightning rods, sulfur, cinnabar, poplar wood and leaves, wool/concrete stairs and slabs, and more.
- Compact palette modal with search by block/colour, tone toggles, "no block" entries and custom blocks. Built-in 56-block and `Piston clearable` (32-block) presets are included.
- **Smart palette**: sorting by brightness, a brightness/chroma diagram with click-to-select, and markers showing which colours are present in the uploaded picture.
- **Auto palette**: k-means clustering in Lab space picks a set of blocks for the picture; choose 8, 16 or 32 colours.
- Two new dithering methods: **blue noise** computed for the current palette, and **brightness and colour**, which dithers only the lightness and keeps the hue, so gradients stop turning into colour noise.
- **Pattern rotation** from 0° to 90° for every method that uses a matrix.
- Cleanup and improvement pass: median/bilateral/guided denoise, preserve edges, remove islands (size-only or Smart), simplify colours (RGB or perceptual Lab), adaptive dithering and edge-aware Floyd–Steinberg with serpentine order.
- Image preprocessing: gamma and auto levels.

### Pixel editor

- Brush, eraser, eyedropper, fill, line/rectangle/ellipse, magic wand, lasso, rectangular selection, copy/paste, move, flip/rotate, mask and protect tools, undo/redo, brush sizes, zoom/Fit and hotkeys.
- **Mask** does not paint a colour: it marks the pixel as "do not dither this pixel" and maps its source colour to the closest single palette tone. Masks end up in the exported files, survive palette cleanup and are cleared together with the other edits when the image or map size changes.
- Edited pixels and masks bypass dithering and keep their selected tone. They are included in the preview, the shared PNG and every `.litematic` file, and are restored with the session after a reload.

### Projects and export

- **Project files**: the picture, the settings, custom blocks and the manual pixel edits can be saved to a single `.mapartstudio.json` and opened again on another machine. It is ordinary JSON, so it can be opened in a text editor.
- One-slot recovery of the current image, settings and manual edits in IndexedDB.
- Direct `.litematic` export with a shared PNG preview in a regular ZIP. `.nbt`, split `.nbt` ZIP and `.map.dat` exports remain available.
- The share link points to the copy of the studio it was created on, and the palette can be shared as a URL or as a preset file.

Nothing is uploaded. Settings and custom palettes are stored in the browser. The current image, settings and manual edits are kept in a single IndexedDB recovery slot and restored after a reload; uploading another image replaces that slot.

## Run locally

Requires Node.js and npm.

```sh
npm install
CI=false npm run build
node server.js
```

Then open <http://127.0.0.1:4173>.

Alternatively, `./start.sh` installs dependencies and builds on first launch, then starts the same static server. `PORT` and `HOST` can be set as environment variables.

The production build is static and can be served from any subdirectory; `homepage` in `package.json` is already set to `"."`.

## Exports

Click **Download .litematic + PNG**. The browser downloads a ZIP archive to the normal Downloads folder. A 1x1 map produces:

```text
MyArt.litematic
MyArt.png
```

Split maps produce `MyArt_0_0.litematic`, `MyArt_1_0.litematic`, and so on, plus one shared `MyArt.png`. The files are placed at the ZIP root, so no art folder or folder picker is involved.

The default schematic support setting is **Add blocks under: No blocks** with **Block to add: air**. You can still select another support mode or material in Settings.

Firefox is supported as a normal website. The `.litematic + PNG` export always downloads a ZIP archive.

## Development

```sh
npm start
```

The app remains usable from the localhost development server. Service-worker registration is enabled for production builds; when testing install/offline behaviour, use the built app on `127.0.0.1` or HTTPS.

Tests run with `CI=true npx react-scripts test --watchAll=false`. `node src/tools/checkLocaleParity.js` reports which translation keys are missing in each language.

## Building for deployment

Run `npm run build`. The output in `build/` can be served by any static host. The build uses relative asset paths, and the router derives its basename from the current URL, so the same artifact works at the domain root and in a GitHub Pages project subdirectory.

The site is published from the `gh-pages` branch. The source stays on `main`; `deploy.sh` builds the app and force-pushes only the generated files to `gh-pages`. Route paths are restored on deep links by `public/404.html`. The generated files are not committed to `main`.

## Credits and license

MapartCraft Local Studio is a fork of [mike2b2t/mapartcraft](https://github.com/mike2b2t/mapartcraft), which is based on the original [MapartCraft by rebane2001](https://rebane2001.com/mapartcraft). The original project, the upstream fork and this fork are distributed under the [GNU General Public License v3.0](LICENSE).

- Minecraft for the block textures
- [KenPixel Mini Square](https://opengameart.org/content/kenney-fonts) font by [Kenney](https://www.kenney.nl/)
- [pako](https://www.npmjs.com/package/pako)'s zipping library
- [jszip](https://www.npmjs.com/package/jszip)'s zipping library
- [OpenMoji](https://github.com/hfg-gmuend/openmoji) for flags
- Translation credits can be seen on the translated pages
- [SelfAdjointOperator](https://github.com/SelfAdjointOperator) for some extra features
- jkascpkmc (Discord) for the improved Bayer/pattern dithering algorithm
- [OpenCode / DeepSeek V4.1 Flash](CONTRIBUTORS.md) and [OpenCode / MiniMax M3.1 Flash](CONTRIBUTORS.md) for implementation, debugging, testing and deployment
- [Upstream contributors](https://github.com/mike2b2t/mapartcraft/graphs/contributors)
- [Contributors to this fork](https://github.com/AxopupelBruh/mapartcraft/graphs/contributors)
