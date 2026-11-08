# Development

No build step and no dependencies. You need Chrome 116 or newer, plus Node 20 or newer for the scripts.

## Edit, then reload

1. Load `extension/` unpacked from `chrome://extensions`.
2. After changing a file, click **reload** on the extension card, then reload the call tab.
3. Logs: the page console shows `[Infinity FX]` lines from `inject.js`. For the engine, open `chrome://extensions`, then **Inspect views**, or pick the `engine.html` frame in DevTools' context dropdown.
4. Turn on **Show tracking** in the popup for a HUD with fps, mask coverage, gesture states and landmarks. With it on, the engine console also prints per-stage timings every 60 frames.

```sh
npm run check     # node --check on every file + manifest validation
npm run package   # dist/infinity-fx-<version>.zip
```

## Headless visual test

`tools/visual-test/` drives headless Chrome with the extension loaded and a **fake camera fed from a video file**. It takes screenshots at chosen moments, and can fire the keyboard backups first.

1. Record a short clip of **yourself**, or of someone who agreed to it, and convert it:
   ```sh
   ffmpeg -i my-clip.mp4 -vf "scale=640:360,fps=15" -pix_fmt yuv420p tools/visual-test/clip.y4m
   ```
   `*.y4m` is git-ignored. Never commit footage of people.
2. Point `CHROME` at a Chrome binary if it isn't the Playwright "Chrome for Testing" build, then run:
   ```sh
   node tools/visual-test/run.js tools/visual-test/out --cpu 3000 2000:portal 2500 600:snap 4000
   ```
   Each step is `<ms to wait>[:action]`, where the action is `snap`, `portal`, `repulsor`, `thor`, `hologram`, `entrance` or `debug`. `--cpu` forces the CPU delegate, which is needed with SwiftShader. `--set='{"portalDest":"mirror"}'` presets settings.

## Adding an effect

1. Create `extension/fx/<name>.js` exporting `update(E, G)`, `active()`, a draw function, and optionally `key(E)` and `needsMask()`.
   * `E` is the frame context: `W`, `H`, `S` (scale, where 1 means 360p), `now`, `dt`, `frame`, the output context `o`, scratch canvases, `seg`, `particles`, `pose`, `settings`, `flash()` and `shake()`.
   * `G` holds this frame's gestures from `gestures.js`.
2. Add a gesture to `Gestures.analyze()` if you need a new one.
3. Wire it into `engine.js`: import it, call `update`, add it to `active`, and draw it in the compositing order.
4. Add a toggle to `popup.html` and `popup.js`, plus a default in `engine.js`, and optionally a hotkey in `inject.js`.
5. Document the gesture in the README table.
