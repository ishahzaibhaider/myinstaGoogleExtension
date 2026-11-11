// Jujutsu Kaisen — Gojo's Domain Expansion: Infinite Void.
// Hold crossed index + middle fingers: a black barrier bursts out from your
// hand, the room is replaced by a blinding cosmic void rushing past you,
// your eyes burn blue and 領域展開 / 無量空処 slams onto the screen.
// Cross your fingers again (or wait) to collapse it.
import { TAU, rand, clamp, easeOutCubic, radialFill, rgba, fbm, lerp } from './utils.js';

const OPEN_MS = 650, CLOSE_MS = 450, MAX_MS = 15000;
const JP = '"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", "MS Mincho", serif';
let state = 'off', t0 = 0, onAt = 0, origin = null;
let nebula = null, nebW = 0, streaks = [], stars = [], eyes = null;

export const active = () => state !== 'off';
export const needsMask = active;

function toggle(E, pos) {
  if (state === 'off' || state === 'closing') {
    state = 'opening'; t0 = E.now; origin = pos || { x: E.W / 2, y: E.H * 0.45 };
    E.flash(255, 255, 255, 0.9);
  } else if (state === 'on' || state === 'opening') { state = 'closing'; t0 = E.now; }
}
export function key(E) { toggle(E, null); }

function build(E) {
  nebW = E.W;
  const w = 160, h = Math.round(160 * E.H / E.W);
  const c = new OffscreenCanvas(w, h), g = c.getContext('2d'), im = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = fbm(x / w * 3.2, y / w * 3.2, 77, 5), m = fbm(x / w * 6 + 9, y / w * 6, 13, 4);
    const i = (y * w + x) * 4, a = clamp((n - 0.35) * 2.2, 0, 1);
    im.data[i] = lerp(40, 190, m) * a; im.data[i + 1] = lerp(70, 140, n) * a; im.data[i + 2] = 255 * a; im.data[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  nebula = new OffscreenCanvas(E.W, E.H);
  const ng = nebula.getContext('2d');
  ng.filter = `blur(${Math.round(E.W / 120)}px)`;
  ng.drawImage(c, 0, 0, E.W, E.H);
  streaks = Array.from({ length: 260 }, () => ({ a: rand(TAU), d: rand(0, 1.2), v: rand(0.25, 0.9), w: rand(0.6, 2.2) }));
  stars = Array.from({ length: 140 }, () => ({ x: rand(E.W), y: rand(E.H), p: rand(TAU), s: rand(0.6, 1.8) }));
}

export function update(E, G) {
  const now = E.now;
  if (E.settings.domain === false) { if (state !== 'off') state = 'closing'; }
  else if (G.domainToggle) toggle(E, G.domainHand ? { x: G.domainHand.center.x, y: G.domainHand.center.y } : null);
  if (state === 'opening' && now - t0 > OPEN_MS) { state = 'on'; onAt = now; }
  if (state === 'on' && now - onAt > MAX_MS) { state = 'closing'; t0 = now; }
  if (state === 'closing' && now - t0 > CLOSE_MS) state = 'off';
  if (state === 'off') return;
  if (!nebula || nebW !== E.W) build(E);
  for (const s of streaks) { s.d += E.dt * s.v * (0.25 + s.d); if (s.d > 1.25) { s.d = rand(0, 0.08); s.a = rand(TAU); } }
  eyes = null;
  if (E.pose && E.poseAge < 500) {
    const lm = E.pose, v = (i) => (lm[i].visibility === undefined ? 1 : lm[i].visibility);
    if (v(2) > 0.5 && v(5) > 0.5) eyes = [{ x: lm[2].x * E.W, y: lm[2].y * E.H }, { x: lm[5].x * E.W, y: lm[5].y * E.H }];
  }
  // white-blue cursed energy rising off your outline
  if (E.seg.ok && state === 'on') {
    const n = E.seg.edges();
    for (let i = 0; i < 5 && n; i++) {
      const idx = E.seg.edge[(Math.random() * n) | 0];
      const x = (idx % E.MW) * E.W / E.MW, y = ((idx / E.MW) | 0) * E.H / E.MH;
      E.particles.emit({ x, y, vx: rand(-15, 15) * E.S, vy: rand(-90, -30) * E.S, life: rand(0.4, 0.9), size: rand(1.5, 3.5) * E.S, sprite: Math.random() < 0.6 ? 'cyan' : 'white', drag: 1 });
    }
  }
}

function drawVoid(E, ctx) {
  const W = E.W, H = E.H, cx = W / 2, cy = H * 0.45, t = E.now / 1000, R = Math.hypot(W, H) * 0.6;
  ctx.fillStyle = '#02030a'; ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const [rot, sc, al] of [[t * 0.05, 1.25, 0.75], [-t * 0.08, 1.6, 0.45]]) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(sc, sc); ctx.globalAlpha = al;
    ctx.drawImage(nebula, -W / 2, -H / 2); ctx.restore();
  }
  ctx.globalAlpha = 1;
  for (const s of stars) { ctx.fillStyle = `rgba(220,235,255,${0.35 + 0.35 * Math.sin(t * 3 + s.p)})`; ctx.fillRect(s.x, s.y, s.s, s.s); }
  ctx.lineCap = 'round';
  for (const s of streaks) {
    const d0 = s.d * R, d1 = d0 + (8 + s.d * s.d * 90) * E.S, ca = Math.cos(s.a), sa = Math.sin(s.a);
    ctx.strokeStyle = `rgba(200,230,255,${clamp(s.d * 0.9, 0, 0.9)})`;
    ctx.lineWidth = s.w * E.S * (0.4 + s.d);
    ctx.beginPath(); ctx.moveTo(cx + ca * d0, cy + sa * d0); ctx.lineTo(cx + ca * d1, cy + sa * d1); ctx.stroke();
  }
  for (let i = 0; i < 3; i++) {
    const k = ((t * 0.7 + i / 3) % 1);
    ctx.strokeStyle = `rgba(170,210,255,${0.35 * (1 - k)})`; ctx.lineWidth = 2 * E.S;
    ctx.beginPath(); ctx.arc(cx, cy, k * R, 0, TAU); ctx.stroke();
  }
  radialFill(ctx, cx, cy, H * 0.55, [[0, 'rgba(255,255,255,0.95)'], [0.15, 'rgba(200,225,255,0.6)'], [0.5, 'rgba(90,120,255,0.15)'], [1, 'rgba(60,80,255,0)']]);
  ctx.restore();
}

export function drawBack(E) {
  const o = E.o, now = E.now;
  let R = Infinity, alpha = 1;
  if (state === 'opening') R = Math.hypot(E.W, E.H) * 1.1 * easeOutCubic(clamp((now - t0) / OPEN_MS, 0, 1));
  if (state === 'closing') alpha = 1 - clamp((now - t0) / CLOSE_MS, 0, 1);
  const t2 = E.tmp2Ctx;
  t2.setTransform(1, 0, 0, 1, 0, 0); t2.globalAlpha = 1; t2.filter = 'none'; t2.globalCompositeOperation = 'source-over';
  drawVoid(E, t2);
  o.save();
  o.globalAlpha = alpha;
  if (R !== Infinity) { o.beginPath(); o.arc(origin.x, origin.y, R, 0, TAU); o.clip(); }
  o.drawImage(E.tmp2, 0, 0);
  o.restore();
  if (R !== Infinity) {   // the barrier's edge: black shell with a white rim
    o.save();
    o.strokeStyle = '#000'; o.lineWidth = 22 * E.S; o.beginPath(); o.arc(origin.x, origin.y, R, 0, TAU); o.stroke();
    o.globalCompositeOperation = 'lighter'; o.strokeStyle = 'rgba(210,235,255,0.9)'; o.lineWidth = 3 * E.S; o.stroke();
    o.restore();
  }
}

function slam(o, text, x, y, size, k, font, fill) {
  if (k <= 0) return;
  const s = 1 + 0.9 * Math.pow(1 - Math.min(1, k * 2.5), 3);
  o.save();
  o.translate(x, y); o.scale(s, s);
  o.globalAlpha = Math.min(1, k * 3);
  o.font = font.replace('{s}', Math.round(size));
  o.textAlign = 'center'; o.textBaseline = 'middle';
  o.lineJoin = 'round';
  o.lineWidth = size * 0.12; o.strokeStyle = 'rgba(0,0,10,0.85)'; o.strokeText(text, 0, 0);
  o.shadowColor = 'rgba(120,180,255,0.9)'; o.shadowBlur = size * 0.35;
  o.fillStyle = fill; o.fillText(text, 0, 0);
  o.restore();
}

export function drawFront(E) {
  if (state === 'off') return;
  const o = E.o, H = E.H, W = E.W;
  const fade = state === 'closing' ? 1 - clamp((E.now - t0) / CLOSE_MS, 0, 1) : 1;
  if (eyes) {
    const d = Math.hypot(eyes[0].x - eyes[1].x, eyes[0].y - eyes[1].y);
    o.save(); o.globalCompositeOperation = 'lighter';
    for (const e of eyes) radialFill(o, e.x, e.y, d * 0.6, [[0, rgba(255, 255, 255, fade)], [0.22, rgba(120, 210, 255, 0.95 * fade)], [1, 'rgba(60,140,255,0)']]);
    o.restore();
  }
  if (state === 'on' || state === 'closing') {
    const t = (E.now - onAt) / 1000;
    const out = clamp((5.5 - t) / 0.6, 0, 1) * fade;
    o.save(); o.globalAlpha = out;
    slam(o, '領域展開', W / 2, H * 0.17, H * 0.14, t / 1, `900 {s}px ${JP}`, '#ffffff');
    slam(o, '無量空処', W / 2, H * 0.83, H * 0.1, (t - 0.8) / 1, `700 {s}px ${JP}`, '#dbe9ff');
    if (t > 1.3) {
      o.globalAlpha = out * Math.min(1, (t - 1.3) * 2);
      o.font = `600 ${Math.round(H * 0.032)}px -apple-system, "Segoe UI", sans-serif`;
      o.textAlign = 'center'; o.fillStyle = 'rgba(230,240,255,0.9)';
      try { o.letterSpacing = `${Math.round(H * 0.012)}px`; } catch (e) {}
      o.fillText('DOMAIN EXPANSION · INFINITE VOID', W / 2, H * 0.93);
    }
    o.restore();
  }
}
