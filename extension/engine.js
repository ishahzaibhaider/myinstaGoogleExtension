// Infinity FX — effects engine. Runs inside a hidden extension iframe so that
// MediaPipe's WebAssembly is never blocked by the call site's security policy.
// Receives camera frames from the page (inject.js), returns processed frames.
import { FilesetResolver, HandLandmarker, PoseLandmarker } from './lib/vision_bundle.mjs';
import { Gestures } from './gestures.js';
import { Segment } from './fx/segment.js';
import { Particles } from './fx/particles.js';
import { clamp, rgba } from './fx/utils.js';
import * as thanos from './fx/thanos.js';
import * as portal from './fx/portal.js';
import * as repulsor from './fx/repulsor.js';
import * as thor from './fx/thor.js';
import * as holo from './fx/hologram.js';
import { setCustom } from './fx/destinations.js';

const TAG = '[Infinity FX]';
const settings = {
  enabled: true, snap: true, portal: true, repulsor: true, thor: true, hologram: true,
  entrance: true, sensitivity: 'normal', debug: false,
  portalDest: 'shanghai', destImage: null,
  delegate: 'auto',   // auto | gpu | cpu (hidden; for testing)
};

function post(msg, transfer) {
  window.parent.postMessage(Object.assign({ __infx: 1 }, msg), '*', transfer || []);
}

// ------------------------------------------------------------------ models
let fileset = null, hand = null, pose = null, ready = false;

async function createTask(Cls, path, opts) {
  let lastErr;
  const order = settings.delegate === 'cpu' ? ['CPU'] : settings.delegate === 'gpu' ? ['GPU'] : ['GPU', 'CPU'];
  for (const delegate of order) {
    try {
      return await Cls.createFromOptions(fileset, Object.assign({
        baseOptions: { modelAssetPath: chrome.runtime.getURL(path), delegate },
        runningMode: 'VIDEO',
      }, opts));
    } catch (e) { lastErr = e; console.warn(TAG, `${path} failed on ${delegate}`, e); }
  }
  throw lastErr;
}

// ---- timing (printed to the engine console while debug is on)
const perf = { n: 0, hand: 0, pose: 0, draw: 0, total: 0, hands: 0, handFrames: 0 };
function perfAdd(k, ms) { perf[k] += ms; }
function perfTick() {
  perf.n++;
  if (settings.debug && perf.n % 60 === 0) {
    const n = 60;
    console.info(TAG, `frame ${perf.n}: hand ${(perf.hand / n).toFixed(1)}ms  pose ${(perf.pose / n).toFixed(1)}ms  draw ${(perf.draw / n).toFixed(1)}ms  total ${(perf.total / n).toFixed(1)}ms  fps ${fps.toFixed(0)}  hands seen in ${perf.handFrames}/${n} frames (${perf.hands} total)`);
    perf.hand = perf.pose = perf.draw = perf.total = 0; perf.hands = perf.handFrames = 0;
  }
}

async function loadSettings() {
  const s = await chrome.storage.local.get(settings);
  Object.assign(settings, s);
  chrome.storage.onChanged.addListener((ch) => {
    for (const k of Object.keys(ch)) if (k in settings) settings[k] = ch[k].newValue;
    if (ch.enabled) post({ type: 'active', value: settings.enabled !== false });
    if (ch.destImage) setCustom(settings.destImage);
  });
  setCustom(settings.destImage);
}

async function init() {
  try {
    await loadSettings();
    fileset = await FilesetResolver.forVisionTasks(chrome.runtime.getURL('lib/wasm'));
    hand = await createTask(HandLandmarker, 'models/hand_landmarker.task', {
      numHands: 2, minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
    });
    pose = await createTask(PoseLandmarker, 'models/pose_landmarker_lite.task', {
      numPoses: 1, outputSegmentationMasks: true,
    });
    ready = true;
    post({ type: 'ready' });
    post({ type: 'active', value: settings.enabled !== false });
  } catch (e) {
    console.error(TAG, e);
    post({ type: 'error', message: 'engine failed to start: ' + (e && e.message || e) });
  }
}

// ------------------------------------------------------------------ context
const E = {
  W: 0, H: 0, MW: 0, MH: 0, S: 1, now: 0, dt: 1 / 30, frameNo: 0, frame: null,
  out: null, o: null, tmp: null, tmpCtx: null, tmp2: null, tmp2Ctx: null, ml: null, mlCtx: null,
  seg: new Segment(), particles: new Particles(5000), settings,
  pose: null, poseAge: 1e9,
  post: { flashA: 0, flashR: 255, flashG: 255, flashB: 255, shake: 0 },
  flash(r, g, b, a) { if (a > this.post.flashA) { this.post.flashA = a; this.post.flashR = r; this.post.flashG = g; this.post.flashB = b; } },
  shake(px) { if (px > this.post.shake) this.post.shake = px; },
};
const gestures = new Gestures();
const keyQueue = [];
let lastTs = 0, lastT = performance.now(), fps = 30, lastPoseT = -1e9, lastHands = null;
// Entrance: wait until frames flow smoothly (models warmed up) so the people
// on the call actually see it, then play it. Re-armed when the camera is
// switched back on. While waiting, a black frame is sent (you haven't "arrived").
let entrancePending = true, entranceSince = -1, warmFrames = 0, warmSent = false;

function setup(w, h) {
  E.W = w; E.H = h; E.S = h / 360;
  const s = Math.min(1, 512 / w);
  E.MW = Math.max(16, Math.round(w * s)); E.MH = Math.max(16, Math.round(h * s));
  const mk = (cw, chh) => { const c = new OffscreenCanvas(cw, chh); return [c, c.getContext('2d')]; };
  [E.out, E.o] = mk(w, h);
  [E.tmp, E.tmpCtx] = mk(w, h);
  [E.tmp2, E.tmp2Ctx] = mk(w, h);
  [E.ml, E.mlCtx] = mk(E.MW, E.MH);
  E.seg.setup(w, h, E.MW, E.MH);
  E.particles.clear();
}

function frameSize(f) {
  if (typeof VideoFrame !== 'undefined' && f instanceof VideoFrame) return [f.displayWidth || f.codedWidth, f.displayHeight || f.codedHeight];
  return [f.width, f.height];
}

function reset(ctx) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;
}

// ------------------------------------------------------------------ frame loop
function processFrame(id, frame) {
  const now = performance.now();
  const dt = clamp((now - lastT) / 1000, 0.001, 0.1);
  lastT = now;
  fps = fps * 0.9 + (1 / dt) * 0.1;

  if (!ready || settings.enabled === false) { post({ type: 'result', id, frame, processed: false }, [frame]); return; }
  const [w, h] = frameSize(frame);
  if (!w || !h) { post({ type: 'result', id, frame, processed: false }, [frame]); return; }
  if (w !== E.W || h !== E.H) setup(w, h);

  E.now = now; E.dt = dt; E.frame = frame; E.frameNo++;
  E.post.flashA = 0; E.post.shake = 0;

  // ---- perception
  E.mlCtx.drawImage(frame, 0, 0, E.MW, E.MH);
  const ts = Math.max(now, lastTs + 1);
  lastTs = ts;
  const t0 = performance.now();
  const hr = hand.detectForVideo(E.ml, ts);
  lastHands = hr;
  const t1 = performance.now(); perfAdd('hand', t1 - t0);
  if (hr.landmarks && hr.landmarks.length) { perf.hands += hr.landmarks.length; perf.handFrames++; }
  const needMask = thanos.needsMask() || holo.needsMask() || thor.needsMask() || portal.hasOpen();
  if (needMask || E.frameNo % 2 === 0 || E.seg.bgFrames < 20) {
    const pr = pose.detectForVideo(E.ml, ts);
    const lm = pr.landmarks && pr.landmarks[0];
    if (lm) { E.pose = lm; lastPoseT = now; }
    const masks = pr.segmentationMasks || [];
    if (masks.length && lm) E.seg.update(masks[0]); else E.seg.clear();
    masks.forEach((m) => m.close && m.close());
    E.seg.learnBackground(frame);
  }
  perfAdd('pose', performance.now() - t1);
  E.poseAge = now - lastPoseT;
  const G = gestures.analyze(hr, E.poseAge < 600 ? E.pose : null, E.W, E.H, now, settings.sensitivity);

  // ---- events
  while (keyQueue.length) {
    const a = keyQueue.shift();
    if (a === 'snap') thanos.key(E);
    else if (a === 'portal' || a === 'entrance') portal.key(E, a);
    else if (a === 'repulsor') repulsor.key(E);
    else if (a === 'thor') thor.key(E);
    else if (a === 'hologram') holo.key(E);
  }
  warmFrames = dt < 0.12 ? warmFrames + 1 : 0;
  if (entrancePending && settings.entrance === false) entrancePending = false;
  if (entrancePending) {
    if (entranceSince < 0) entranceSince = now;
    if (warmFrames >= 6 || now - entranceSince > 6000) { entrancePending = false; entranceSince = -1; portal.startEntrance(E); }
  }
  if (!entrancePending && !warmSent) { warmSent = true; post({ type: 'warm' }); }

  thanos.update(E, G);
  portal.update(E, G);
  repulsor.update(E, G);
  thor.update(E, G);
  holo.update(E, G);
  E.particles.update(dt);

  if (entrancePending) {
    reset(E.o); E.o.fillStyle = '#000'; E.o.fillRect(0, 0, E.W, E.H);
    try { frame.close(); } catch (e) {}
    const bmp = E.out.transferToImageBitmap();
    post({ type: 'result', id, frame: bmp, processed: true }, [bmp]);
    return;
  }
  const active = thanos.active() || portal.active() || repulsor.active() || thor.active() || holo.active() ||
    E.particles.n > 0 || settings.debug;
  if (!active) { perfAdd('total', performance.now() - t0); perfTick(); post({ type: 'result', id, frame, processed: false }, [frame]); return; }

  // ---- compose
  const t2 = performance.now();
  const o = E.o;
  reset(o);
  const dusting = thanos.getState() !== 'idle';
  if (dusting) thanos.drawBase(E);
  else if (holo.active()) holo.drawBase(E);
  else o.drawImage(frame, 0, 0, E.W, E.H);
  reset(o);

  if (portal.hasOpen()) {
    portal.drawPortals(E);
    reset(o);
    if (!dusting && !holo.active() && E.seg.ok && E.poseAge < 300) {
      E.seg.personCutout(E.tmpCtx, frame, true);
      o.drawImage(E.tmp, 0, 0);
    }
  }
  thor.drawGrade(E); reset(o);
  thanos.drawFront(E); reset(o);
  repulsor.draw(E); reset(o);
  thor.drawFront(E); reset(o);
  const entr = portal.entranceActive();
  if (!entr) { E.particles.draw(o); reset(o); }

  if (E.post.shake > 0.5) {
    const k = E.post.shake;
    const dx = (Math.random() - 0.5) * 2 * k, dy = (Math.random() - 0.5) * 2 * k;
    reset(E.tmp2Ctx);
    E.tmp2Ctx.globalCompositeOperation = 'copy';
    E.tmp2Ctx.drawImage(E.out, 0, 0);
    o.drawImage(E.tmp2, dx - k, dy - k, E.W + 2 * k, E.H + 2 * k);
  }
  if (E.post.flashA > 0.003) {
    o.fillStyle = rgba(E.post.flashR, E.post.flashG, E.post.flashB, Math.min(1, E.post.flashA));
    o.fillRect(0, 0, E.W, E.H);
  }
  if (entr) { portal.drawEntrance(E); reset(o); E.particles.draw(o); reset(o); }
  if (settings.debug) drawDebug(hr, G);

  try { frame.close(); } catch (e) {}
  const bmp = E.out.transferToImageBitmap();
  perfAdd('draw', performance.now() - t2); perfAdd('total', performance.now() - t0); perfTick();
  post({ type: 'result', id, frame: bmp, processed: true }, [bmp]);
}

function drawDebug(hr, G) {
  const o = E.o;
  o.save();
  for (const lm of hr.landmarks || []) {
    o.fillStyle = '#00e5ff';
    for (const p of lm) o.fillRect(p.x * E.W - 2, p.y * E.H - 2, 4, 4);
    o.fillStyle = '#ff3d71';
    for (const k of [4, 8, 12]) o.fillRect(lm[k].x * E.W - 4, lm[k].y * E.H - 4, 8, 8);
  }
  if (E.pose && E.poseAge < 600) {
    o.fillStyle = '#ffd400';
    for (const p of E.pose) if ((p.visibility === undefined ? 1 : p.visibility) > 0.5) o.fillRect(p.x * E.W - 2, p.y * E.H - 2, 4, 4);
  }
  if (E.seg.ok) {
    o.globalAlpha = 0.25; o.drawImage(E.seg.mask, 0, 0, E.W, E.H); o.globalAlpha = 1;
  }
  const fs = Math.max(11, Math.round(E.H * 0.028));
  o.font = `600 ${fs}px monospace`;
  const lines = [
    `fps ${fps.toFixed(0)}  ${E.W}x${E.H}  mask ${E.seg.ok ? (E.seg.personFrac * 100).toFixed(0) + '%' : '-'}  bg ${Math.min(99, E.seg.bgFrames)}  pose ${E.poseAge < 600 ? 'ok' : '-'}  particles ${E.particles.n}`,
    `thanos ${thanos.getState()}  portal ${portal.hasOpen() ? 'open' : '-'}  repulsor ${repulsor.active() ? 'on' : '-'}  thor ${thor.active() ? 'on' : '-'}  holo ${holo.isOn() ? 'on' : '-'}`,
    gestures.debug,
    `${G.pinchHand ? 'PINCH ' : ''}${G.snap ? 'SNAP ' : ''}${G.pointingHand ? 'POINT ' : ''}${G.circle ? 'CIRCLE ' : ''}${G.palmHand ? 'PALM ' : ''}${G.thrust ? 'THRUST ' : ''}${G.fistUp ? 'FIST-UP ' : ''}${G.peaceToggle ? 'PEACE ' : ''}`,
  ];
  o.fillStyle = 'rgba(0,0,0,0.6)';
  o.fillRect(6, 6, E.W - 12, lines.length * fs * 1.35 + 10);
  o.fillStyle = '#fff';
  lines.forEach((l, i) => o.fillText(l, 12, 8 + fs * 1.25 * (i + 1)));
  o.restore();
}

// ------------------------------------------------------------------ messages
let errCount = 0;
window.addEventListener('message', (e) => {
  if (e.source !== window.parent) return;
  const d = e.data;
  if (!d || d.__infx !== 1) return;
  if (d.type === 'frame') {
    try {
      processFrame(d.id, d.frame);
    } catch (err) {
      if (errCount++ < 8) console.error(TAG, err);
      try { post({ type: 'result', id: d.id, frame: d.frame, processed: false }, [d.frame]); }
      catch (_) { post({ type: 'result', id: d.id }); }
    }
  } else if (d.type === 'key') {
    keyQueue.push(d.action);
  } else if (d.type === 'camOn') {
    if (settings.entrance !== false) { entrancePending = true; entranceSince = -1; }
  } else if (d.type === 'audioSpike') {
    gestures.audioSpike(performance.now());
  }
});

init();
