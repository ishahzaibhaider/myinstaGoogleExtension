# Architecture

Infinity FX swaps the camera track a call site receives for a processed one.
Everything happens in the browser, on-device.

## Three execution contexts

| Context | File | Why it exists |
|---|---|---|
| **Page world** (`world: "MAIN"`, `document_start`) | `inject.js` | Only code in the page's own JS world can wrap `navigator.mediaDevices.getUserMedia` before the site calls it. It cannot use `chrome.*` APIs. |
| **Isolated world** | `bridge.js` | Has `chrome.storage` and `chrome.runtime`. Creates the engine iframe on demand and mirrors a few settings into `data-infx-*` attributes on `<html>` for `inject.js` to read. |
| **Extension iframe** | `engine.html` + `engine.js` | Runs under the *extension's* CSP (`wasm-unsafe-eval`), so MediaPipe's WebAssembly works even on sites with strict CSPs such as Meet and Instagram. Holds all ML and rendering. |

## Frame path

```
camera track
  └─ MediaStreamTrackProcessor ─▶ VideoFrame
       └─ createImageBitmap ─▶ postMessage (transfer) ─▶ engine iframe
            processFrame():
              1. downscale to ≤512 px → HandLandmarker (2 hands) + PoseLandmarker (+ segmentation mask)
              2. Segment: person masks, background plate learning
              3. Gestures.analyze(): landmark geometry → events
              4. effect modules update(), then composite onto an OffscreenCanvas
            ◀─ ImageBitmap { processed: true|false }
  └─ new VideoFrame(bitmap) ─▶ MediaStreamTrackGenerator ─▶ the call
```

* `processed: false` means nothing is active, so the page sends the original camera frame untouched. Idle cost is just the tracking.
* Only one frame is in flight at a time. If a reply misses the 400 ms deadline, the page repeats the last effect frame for up to 3 s, so effects freeze instead of flashing, and otherwise sends the plain camera. The call never stalls.
* Until the engine reports `warm`, the page sends black frames for up to 12 s, so the portal entrance is the first thing the call sees.
* Browsers without insertable streams fall back to `<video>` → canvas → `captureStream()`.
* The processed track is "dressed" to look like the real camera: `getSettings`, `label`, `applyConstraints` and `stop` are all forwarded.

## Engine modules

| Module | Responsibility |
|---|---|
| `gestures.js` | Per-hand finger states from the 21 landmarks. Snap state machine: pinch, then release plus middle-finger curl or a mic click. Index-finger trail with loop detection (≥300° of turning at a near-constant radius). Palm hold and thrust (hand scale grows more than 32% in 180 ms). Fist above the head, using the pose wrist as a fallback. Peace (spread fingers) held for 450 ms. Crossed index and middle finger: the tips overlap or swap order along the knuckle axis. Both hands lifted more than 22% of the frame height within 1.3 s. |
| `fx/segment.js` | Turns the pose segmentation mask into several masks: tight, generous, grown and feathered. It keeps learning the **background plate** with you cut out, but only from frames that have had nobody in them for 1.2 s, so you are never painted into it while the tracker is still finding you. A saved photo of the empty room, auto-captured after 2.5 s with nobody in frame, fills every spot it has never seen live. The never-seen area is filled per row by interpolating between the nearest known pixels left and right, and rows with nothing known copy their nearest neighbours. |
| `fx/particles.js` | Pooled struct-of-arrays particle system drawn with pre-rendered additive glow sprites. |
| `fx/thanos.js` | Gauntlet glow and stones on the pinching hand. On the snap it builds a per-pixel dissolve-time map (fBm noise plus a wind sweep) and about 48k colour-sampled ash particles. While the effect runs, the base is the full empty-room plate, so no trace of you remains. |
| `fx/portal.js` | Sparking ring (dashed counter-rotating arcs plus tangential sparks). Portals pop open, glide behind you and grow. Destination rendering and the camera-on entrance live here too. |
| `fx/destinations.js` | Procedurally painted Shanghai skyline, with landmarks, windows, blinking aviation lights, an LED façade and a sliced shimmering reflection. Also the user's custom picture. |
| `fx/domain.js`, `fx/arise.js` | Anime effects. Infinite Void has a procedural nebula, warp streaks, the barrier expansion and the Japanese title slam. ARISE has pre-rendered shadow-soldier silhouettes rising in perspective, ground fog and the System window. Both are drawn behind you, with you cut back on top. |
| `fx/repulsor.js`, `fx/thor.js`, `fx/hologram.js` | Palm charge and blast with flash and shake. Lightning by midpoint displacement with branches, edge arcs and glowing eyes. Hologram tint, scanlines, glow, glitch bands and a projector base. |

### Compositing order

`base` is the live frame, or the empty room for Thanos, or the room plus hologram. Then portals go behind you, with you cut back on top using the feathered tight mask. Then the Thor grade, the gauntlet and flash, the repulsor, the lightning and the particles. Screen shake and flash are post-effects. The entrance mask goes last.

## Performance notes

* ML runs on a ≤512 px copy. With the GPU delegate, hands plus pose take a few milliseconds per frame on a modern laptop. The CPU delegate is the automatic fallback.
* Pose and segmentation run every other frame while nothing needs a fresh mask.
* The plate's inpainting runs at 160 px width every 3–8 frames.
* No `shadowBlur` in hot loops. Glows are additive gradient sprites.
