# MapartCraft Local Studio

[Russian version](README.ru.md)

A Minecraft map art schematic and map.dat generator, designed to be feasible for both server admins and survival players on servers like 2b2t, running entirely in your browser.

**Live site:** <https://axopupelbruh.github.io/mapartcraft/>

This fork adds a local-first studio on top of the original MapartCraft interface:

- Installable PWA with offline app-shell caching.
- Pixel-perfect 2D preview with nearest-neighbour sampling, integer zoom and an optional pixel grid.
- Automatic 2x/3x/4x/5x source-pixel detection.
- Style presets: Clean Pixel, Retro Grid, Retro 1-bit, Soft Gradient and Low-Block.
- Palette presets including a built-in 56-block palette and `Piston clearable` (32 blocks).
- Manual pixel editor with brush, eraser, eyedropper, drag painting, undo/redo and a colour palette taken from the current preview.
- Dithering mask, flood fill, brush size, line/rectangle/ellipse tools, magic wand, lasso, rectangular selection, copy/paste, flip/rotate and editor hotkeys.
- Editor zoom controls (including Fit) plus Ctrl+wheel zoom.
- Cleanup/improvement pass: denoise, speckle removal, colour simplification and edge-aware dithering.
- One-slot recovery of the current image, settings and manual edits after a reload, with a session status indicator and reset action.
- New studio/editor UI localized in English and Russian (other languages fall back to English).
- Direct `.litematic` export with a shared PNG preview.
- Existing `.nbt` and `.map.dat` exports remain available.

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

`.nbt`, split `.nbt` ZIP and `.map.dat` exports are available in the existing download panel.

The default schematic support setting is **Add blocks under: No blocks** with **Block to add: air**. You can still select another support mode or material in Settings.

Firefox is supported as a normal website. The `.litematic + PNG` export always downloads a ZIP archive.

## Pixel editor

Enable **Pixel editor** above the preview to correct individual map pixels. The brush paints with a colour sampled from the current quantised preview, so the chosen block tone is guaranteed to be available in the active palette and style. The eyedropper picks a colour directly from the preview, the eraser restores the source image, and right-click erases while the brush is active. Drag to paint a stroke, then use **Undo**, **Redo** or **Reset edits** as needed.

The editor also has:

- **Mask** — does not paint a new colour: it marks the pixel as “do not dither this pixel” and maps its original source colour to the closest single palette tone. It is useful for clean text, eyes, outlines and areas where dithering creates speckles. Masks are included in the exported files, protected from palette cleanup and cleared together with the other edits when the image or map size changes. The brush, by contrast, stores an exact chosen colour.
- **Fill** — flood-fills the connected area under the cursor with the current colour.
- **Shapes** — line, rectangle and ellipse with an optional filled mode.
- **Magic wand** — selects a connected same-colour region with an adjustable tolerance.
- **Lasso** — freehand polygon selection with the same mask-based copy/paste, fill, erase, flip and rotate actions.
- **Selection** — drag a rectangle, then copy, paste, move, fill, erase, flip, rotate or clear the selection. The clipboard works across maps in the current split canvas.
- **Move** — drag a selected fragment; the vacated area is filled with the dominant surrounding colour.
- **Size** — 1×1, 2×2, 3×3 or 5×5 for brush, eraser, mask and shape outlines.
- **Shift** — constrains lines to axes/45° and rectangles/ellipses to squares/circles.
- **Zoom** — `−`, `+`, `1:1` and **Fit** in the editor, plus `Ctrl+wheel` zoom.
- Hotkeys: `B` brush, `E` eraser, `I` eyedropper, `M` mask, `F` fill, `L` line, `U` rectangle, `O` ellipse, `W` magic wand, `S` lasso, `R` selection, `V` move, `Ctrl+Z` undo, `Ctrl+Shift+Z` redo, `Ctrl+C`/`Ctrl+V` copy/paste, `Delete` erase selection, `Esc` clear selection.

Edited pixels and masks bypass dithering and keep their selected tone. Edits are included in the preview, the shared PNG and every `.litematic` file. They are restored with the current session after a reload. Changing the map size or uploading another image starts with a clean edit layer. Undo history is intentionally in-memory only.

Advanced dithering remains available in **Settings**: choose the dither method and tune the red, green and blue error propagation independently. The Studio panel also has a global **Dither strength** slider: `0%` disables error propagation, `100%` matches the style preset and `200%` makes the dither stronger. Style presets reset this slider to `100%`, after which it can be tuned freely.

### Cleanup and enhancement

Open **Cleanup & enhancement** in Studio. The source pass runs on a copy of the image inside the worker before palette quantization; island cleanup also runs on the final palette indices. The uploaded original and manual edits are never changed. It includes:

- **Denoise** — edge-preserving cleanup for grain and isolated colour noise. Methods: **Median**, **Bilateral** and **Guided**.
- **Preserve edges** — controls how strongly the denoise protects small details and line art.
- **Remove islands** — removes isolated 1–4 px colour islands before quantization. A separate checkbox controls the low-contrast island pass on final palette indices, protecting lines, manual edits and masks.
- **Simplify colours** — median-cut colour simplification to 16/24/32/48/64 source colours before Minecraft palette mapping.
- **Dither only in smooth areas** — skips dithering where the image has strong edges or high local variance, so outlines and textured areas stay crisp.

Preset buttons: **Clean art**, **Soft**, **Details** and **Off**. Cleanup settings are saved in the local settings snapshot.

Custom presets are stored in `localStorage` (with a cookie fallback for older installs), so deleted presets do not return on the next visit. Deleting the active custom preset also clears the active block selection.

## Development

```sh
npm start
```

The app remains usable from the localhost development server. Service-worker registration is enabled for production builds; when testing install/offline behaviour, use the built app on `127.0.0.1` or HTTPS.

## Building for deployment

Run `npm run build`. The output in `build/` can be served by any static host. The build uses relative asset paths, and the router derives its basename from the current URL, so the same artifact works at the domain root and in a GitHub Pages project subdirectory.

### GitHub Pages

The site is published from the `gh-pages` branch. The source stays on `main`; `deploy.sh` builds the app and force-pushes only the generated files to `gh-pages`. Route paths are restored on deep links by `public/404.html`.

1. In the repository, open **Settings → Pages** and set **Build and deployment → Source** to **Deploy from a branch**.
2. Choose the `gh-pages` branch and the `/ (root)` folder.
3. Run `./deploy.sh` after changes.
4. Open `https://<user>.github.io/<repository>/` after the deployment finishes.

The generated files are not committed to `main`; `npm run build` output is deployed to `gh-pages` by the script.

## Credits and license

MapartCraft is a fork of the original tool by [rebane2001](https://rebane2001.com/mapartcraft); the original project and this fork are distributed under the [GNU General Public License v3.0](LICENSE).

- Minecraft for the block textures
- [KenPixel Mini Square](https://opengameart.org/content/kenney-fonts) font by [Kenney](https://www.kenney.nl/)
- [pako](https://www.npmjs.com/package/pako)'s zipping library
- [jszip](https://www.npmjs.com/package/jszip)'s zipping library
- [OpenMoji](https://github.com/hfg-gmuend/openmoji) for flags
- Translation credits can be seen on the translated pages
- [SelfAdjointOperator](https://github.com/SelfAdjointOperator) for some extra features
- Code contributors can be seen on the [contributions page](https://github.com/mike2b2t/mapartcraft/graphs/contributors)
