// Thanos: the six Infinity Stones light up on your hand while you hold the
// snap pose; on the snap, a flash + shockwave, and you crumble into drifting ash
// (with glowing embers) while the room behind you stays. Snap again to return.
import { fbm, rand, radialFill, TAU, clamp, rgba } from './utils.js';

const D_SWEEP = 2.5;                 // s for the dissolve front to cross you
const P_LIFE_MAX = 1.9;              // s a single ash flake drifts
const D_TOTAL = D_SWEEP + P_LIFE_MAX;
const RETURN_SPEED = 1.7;
const MAXP = 48000;

let state = 'idle';                  // idle | dissolving | gone | returning
let tStart = 0, lastSnap = -1e9;
let T = null;                        // per-pixel time (s) at which that bit of you turns to ash
let P = null, np = 0, wind = 1;
let dims = { MW: 0, MH: 0 };
let aliveC, aliveCtx, aliveImg, partC, partCtx, partImg, part32, snapC, snapCtx, comboC, comboCtx;

let charge = 0, chargeHand = null;   // gauntlet forming
let flashT = -1e9, flashPos = null;  // snap flash + shockwave

export const STONES = [
  { at: 'palm', color: [168, 60, 255], s: 0.19 },   // power
  { at: 2,      color: [60, 220, 120], s: 0.12 },   // time
  { at: 5,      color: [40, 140, 255], s: 0.12 },   // space
  { at: 9,      color: [255, 40, 40],  s: 0.12 },   // reality
  { at: 13,     color: [255, 130, 20], s: 0.12 },   // soul
  { at: 17,     color: [255, 215, 0],  s: 0.12 },   // mind
];

function ensure(E) {
  if (dims.MW === E.MW && dims.MH === E.MH) return;
  dims = { MW: E.MW, MH: E.MH };
  aliveC = new OffscreenCanvas(E.MW, E.MH); aliveCtx = aliveC.getContext('2d');
  aliveImg = aliveCtx.createImageData(E.MW, E.MH); aliveImg.data.fill(255);
  partC = new OffscreenCanvas(E.MW, E.MH); partCtx = partC.getContext('2d');
  partImg = partCtx.createImageData(E.MW, E.MH); part32 = new Uint32Array(partImg.data.buffer);
  snapC = new OffscreenCanvas(E.MW, E.MH); snapCtx = snapC.getContext('2d', { willReadFrequently: true });
  comboC = new OffscreenCanvas(E.MW, E.MH); comboCtx = comboC.getContext('2d');
  if (state !== 'idle') { state = 'idle'; T = null; }
  P = null;
}

export const getState = () => state;
export const isGone = () => state === 'gone';
export const needsMask = () => state !== 'idle';
export const active = () => state !== 'idle' || charge > 0.01 || performance.now() - flashT < 950;

function build(E) {
  const { MW, MH } = E;
  wind = Math.random() < 0.5 ? -1 : 1;
  const seed = (Math.random() * 1e6) | 0;
  T = new Float32Array(MW * MH);
  const asp = MH / MW;
  const GW = 64, GH = Math.max(8, Math.round(64 * asp));
  const N = new Float32Array(GW * GH);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) N[y * GW + x] = fbm(x / GW * 4.5, y / GH * 4.5 * asp, seed);
  for (let y = 0; y < MH; y++) {
    const gy = y / MH * (GH - 1), y0 = gy | 0, y1 = Math.min(GH - 1, y0 + 1), fy = gy - y0;
    for (let x = 0; x < MW; x++) {
      const gx = x / MW * (GW - 1), x0 = gx | 0, x1 = Math.min(GW - 1, x0 + 1), fx = gx - x0;
      const n = (N[y0 * GW + x0] * (1 - fx) + N[y0 * GW + x1] * fx) * (1 - fy) + (N[y1 * GW + x0] * (1 - fx) + N[y1 * GW + x1] * fx) * fy;
      const sweep = wind > 0 ? x / MW : 1 - x / MW;
      T[y * MW + x] = 0.1 + D_SWEEP * clamp(0.6 * n + 0.5 * sweep - 0.08, 0, 1);
    }
  }
  snapCtx.drawImage(E.frame, 0, 0, MW, MH);
  const px = snapCtx.getImageData(0, 0, MW, MH).data;
  const tight = E.seg.tight;
  let candidates = 0;
  for (let i = 0; i < tight.length; i++) if (tight[i] > 140) candidates++;
  const keep = Math.min(1, MAXP / Math.max(1, candidates));
  if (!P) {
    const F = () => new Float32Array(MAXP), U = () => new Uint8Array(MAXP);
    P = { x: F(), y: F(), vx: F(), vy: F(), act: F(), life: F(), ph: F(), r: U(), g: U(), b: U(), kind: U() };
  }
  const sc = MW / 512;
  np = 0;
  for (let i = 0; i < tight.length && np < MAXP; i++) {
    if (tight[i] <= 140 || Math.random() > keep) continue;
    const x = i % MW, y = (i - x) / MW;
    P.x[np] = x; P.y[np] = y;
    P.r[np] = px[i * 4]; P.g[np] = px[i * 4 + 1]; P.b[np] = px[i * 4 + 2];
    P.act[np] = T[i] + (Math.random() - 0.5) * 0.08;
    P.vx[np] = wind * (18 + 80 * Math.random()) * sc;
    P.vy[np] = -(5 + 40 * Math.random()) * sc;
    P.life[np] = 1.0 + 0.9 * Math.random();
    P.ph[np] = Math.random() * TAU;
    const r = Math.random();
    P.kind[np] = r < 0.10 ? 1 : r < 0.16 ? 2 : 0;   // 1 big flake, 2 ember
    np++;
  }
}

export function snap(E, G) {
  const now = E.now;
  if (now - lastSnap < 1600) return false;
  if (state === 'dissolving' || state === 'returning') return false;
  if (!E.seg.ok) return false;
  ensure(E);
  build(E);
  state = state === 'idle' ? 'dissolving' : 'returning';
  tStart = now; lastSnap = now; flashT = now;
  const h = (G && G.snapHand) || chargeHand;
  flashPos = h ? { x: h.center.x, y: h.center.y } : { x: E.W / 2, y: E.H / 2 };
  const colors = ['gold', 'purple', 'blue', 'red', 'orange', 'green', 'white'];
  for (let i = 0; i < 110; i++) {
    const a = Math.random() * TAU, sp = (60 + Math.random() * 280) * E.S;
    E.particles.emit({
      x: flashPos.x, y: flashPos.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40 * E.S, ay: 120 * E.S,
      life: rand(0.4, 1.1), size: rand(1.5, 4) * E.S, sprite: colors[i % colors.length], drag: 1.2,
    });
  }
  return true;
}

function effectTime(now) {
  const el = (now - tStart) / 1000;
  if (state === 'dissolving') return el;
  if (state === 'returning') return D_TOTAL - el * RETURN_SPEED;
  return D_TOTAL;
}

export function update(E, G) {
  ensure(E);
  const el = (E.now - tStart) / 1000;
  if (state === 'dissolving' && el >= D_TOTAL) state = 'gone';
  if (state === 'returning' && el * RETURN_SPEED >= D_TOTAL) { state = 'idle'; T = null; }
  const on = E.settings.snap !== false;
  const h = on ? G.pinchHand : null;
  if (h) { chargeHand = h; charge = Math.min(1, charge + E.dt / 0.45); }
  else charge = Math.max(0, charge - E.dt / 0.3);
  if (charge <= 0) chargeHand = null;
  if (on && G.snap) snap(E, G);
}

export function key(E) { snap(E, null); }

// --- base layer: room + whatever is left of you + ash ---------------------
export function drawBase(E) {
  const o = E.o;
  if (state === 'idle') { o.drawImage(E.frame, 0, 0, E.W, E.H); return; }
  // While the effect runs, the base is the remembered EMPTY room for the whole
  // frame — not the live picture — so no outline, shadow or blur of you is
  // left anywhere, even if you move. Only the not-yet-dusted parts of you
  // (drawn next) come from the live camera.
  E.seg.buildPlate(E.frameNo, state === 'gone' ? 8 : 3);
  E.seg.drawEmptyRoom(o);
  if (state === 'dissolving' || state === 'returning') {
    const f = effectTime(E.now);
    drawAlive(E, f);
    drawDust(E, f);
  }
}

function drawAlive(E, f) {
  const d = aliveImg.data;
  for (let i = 0, j = 3; i < T.length; i++, j += 4) {
    const a = (T[i] - f) * 12 + 0.5;
    d[j] = a <= 0 ? 0 : a >= 1 ? 255 : a * 255;
  }
  aliveCtx.putImageData(aliveImg, 0, 0);
  const c = comboCtx;
  c.globalCompositeOperation = 'copy';
  c.drawImage(E.seg.loose, 0, 0);
  c.globalCompositeOperation = 'destination-in';
  c.drawImage(aliveC, 0, 0);
  c.globalCompositeOperation = 'source-over';
  const t = E.tmpCtx;
  t.setTransform(1, 0, 0, 1, 0, 0); t.filter = 'none'; t.globalAlpha = 1;
  t.globalCompositeOperation = 'copy';
  t.drawImage(E.frame, 0, 0, E.W, E.H);
  t.globalCompositeOperation = 'destination-in';
  t.drawImage(comboC, 0, 0, E.W, E.H);
  t.globalCompositeOperation = 'source-over';
  E.o.drawImage(E.tmp, 0, 0);
}

function drawDust(E, f) {
  if (!P) return;
  const { MW, MH } = E;
  part32.fill(0);
  const sc = MW / 512;
  const ax = wind * 60 * sc, ay = -25 * sc, turb = 10 * sc;
  for (let i = 0; i < np; i++) {
    const g = f - P.act[i], life = P.life[i];
    if (g <= 0 || g >= life) continue;
    const g2 = g * g, ph = P.ph[i];
    const x = P.x[i] + P.vx[i] * g + 0.5 * ax * g2 + Math.sin(ph + g * 4.2) * turb * g;
    const y = P.y[i] + P.vy[i] * g + 0.5 * ay * g2 + Math.cos(ph * 1.7 + g * 3.1) * turb * 0.7 * g;
    const xi = x | 0, yi = y | 0;
    if (xi < 0 || yi < 0 || xi >= MW - 1 || yi >= MH - 1) continue;
    const t = g / life;
    const alpha = (255 * Math.pow(1 - t, 1.2)) | 0;
    let r, gg, b;
    if (P.kind[i] === 2) {
      const k = Math.min(1, t * 1.6);
      r = (255 + (70 - 255) * k) | 0; gg = (150 + (50 - 150) * k) | 0; b = 40;
    } else {
      const k = Math.min(1, t * 2.2);
      r = (P.r[i] + (72 - P.r[i]) * k) | 0; gg = (P.g[i] + (62 - P.g[i]) * k) | 0; b = (P.b[i] + (55 - P.b[i]) * k) | 0;
    }
    const col = ((alpha << 24) | (b << 16) | (gg << 8) | r) >>> 0;
    const o = yi * MW + xi;
    part32[o] = col;
    if (P.kind[i] === 1) { part32[o + 1] = col; part32[o + MW] = col; part32[o + MW + 1] = col; }
  }
  partCtx.putImageData(partImg, 0, 0);
  E.o.imageSmoothingEnabled = true;
  E.o.drawImage(partC, 0, 0, E.W, E.H);
}

// --- front layer: the gauntlet on your hand, the snap flash + shockwave ----
export function drawFront(E) {
  const o = E.o;
  if (charge > 0.01 && chargeHand) {
    const h = chargeHand, c = charge, sc = h.sc;
    const pulse = 0.92 + 0.08 * Math.sin(E.now / 140);
    o.save();
    o.globalCompositeOperation = 'lighter';
    for (const s of STONES) {
      const p = s.at === 'palm' ? { x: (h.lm[0].x + h.lm[9].x) / 2, y: (h.lm[0].y + h.lm[9].y) / 2 } : h.lm[s.at];
      const r = sc * s.s * (0.5 + 0.5 * c) * pulse;
      const [cr, cg, cb] = s.color;
      radialFill(o, p.x, p.y, r * 1.9, [[0, rgba(cr, cg, cb, 0.28 * c)], [1, rgba(cr, cg, cb, 0)]]);
      radialFill(o, p.x, p.y, r * 0.8, [[0, rgba(255, 255, 255, 0.8 * c)], [0.4, rgba(cr, cg, cb, 0.9 * c)], [1, rgba(cr, cg, cb, 0)]]);
    }
    o.restore();
  }
  const since = (E.now - flashT) / 1000;
  if (since < 0.9 && flashPos) {
    const k = 1 - since / 0.9;
    E.flash(255, 240, 200, Math.pow(k, 2.2) * 0.85);
    const diag = Math.hypot(E.W, E.H);
    const r = diag * (1 - Math.pow(1 - Math.min(1, since / 0.8), 3)) * 0.9 + 4;
    o.save();
    o.globalCompositeOperation = 'lighter';
    o.globalAlpha = k * 0.9;
    o.strokeStyle = 'rgba(255,220,150,1)';
    o.lineWidth = Math.max(2, 26 * E.S * k);
    o.beginPath(); o.arc(flashPos.x, flashPos.y, r, 0, TAU); o.stroke();
    o.globalAlpha = k * 0.35; o.lineWidth = Math.max(2, 70 * E.S * k);
    o.strokeStyle = 'rgba(255,160,60,1)'; o.stroke();
    o.restore();
  }
}
