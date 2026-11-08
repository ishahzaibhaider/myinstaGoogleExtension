// Doctor Strange: draw a circle in the air with your index finger and a
// sparking portal opens there, then grows behind you into a huge window onto
// another place (Shanghai at night by default, your own picture, or the
// Mirror Dimension). Draw a circle again to close it. Also the portal
// entrance when your camera starts, and a leave/arrive portal on a hotkey.
import { TAU, rand, easeOutBack, easeInOutCubic, clamp, radialFill, lerp } from './utils.js';
import { drawDestination } from './destinations.js';

const GROW_DELAY = 450, GROW_MS = 1500, MAX_OPEN_MS = 120000;
const CHARGE_MS = 1000, OPEN_MS = 2200, CLOSE_MS = 800;
let portals = [];                 // { x0, y0, R0, t0, closing }
let spin = 0;
let lastTip = null;
const entrance = { mode: 'none', t0: 0 };   // none | charging | opening | closing | black

export const hasOpen = () => portals.length > 0;
export const entranceActive = () => entrance.mode !== 'none';
export const entranceBlack = () => entrance.mode === 'charging' || entrance.mode === 'black';
export const active = () => portals.length > 0 || entrance.mode !== 'none';

export function startEntrance(E) { entrance.mode = 'charging'; entrance.t0 = E.now; }

export function key(E, action) {
  if (action === 'portal') {
    if (portals.length) closeAll(E);
    else open(E, E.W / 2, E.H * 0.5, E.H * 0.32);
  } else if (action === 'entrance') {
    if (entrance.mode === 'none' || entrance.mode === 'opening') { entrance.mode = 'closing'; entrance.t0 = E.now; }
    else if (entrance.mode === 'black' || entrance.mode === 'closing') { entrance.mode = 'charging'; entrance.t0 = E.now; }
  }
}

function open(E, x, y, R) {
  R = clamp(R, E.H * 0.09, E.H * 0.4);
  portals.length = 0;
  portals.push({ x0: x, y0: y, R0: R, t0: E.now, closing: -1 });
  burst(E, x, y, 60);
}
function closeAll(E) { for (const p of portals) if (p.closing < 0) { p.closing = E.now; const g = geom(E, p); burst(E, g.x, g.y, 40); } }

function burst(E, x, y, n) {
  for (let i = 0; i < n; i++) {
    const a = rand(TAU), sp = rand(40, 260) * E.S;
    E.particles.emit({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ay: 140 * E.S, life: rand(0.3, 0.9), size: rand(1.5, 3.5) * E.S, sprite: Math.random() < 0.6 ? 'orange' : 'gold', drag: 1.5 });
  }
}

function ringSparks(E, x, y, r, n) {
  for (let i = 0; i < n; i++) {
    const a = rand(TAU), dir = Math.random() < 0.5 ? -1 : 1;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    const sp = rand(40, 170) * E.S * dir, out = rand(10, 80) * E.S;
    E.particles.emit({
      x: px, y: py, vx: -Math.sin(a) * sp + Math.cos(a) * out, vy: Math.cos(a) * sp + Math.sin(a) * out,
      ay: 120 * E.S, life: rand(0.3, 1.0), size: rand(1.2, 3) * E.S, sprite: Math.random() < 0.7 ? 'orange' : 'gold', drag: 1.5,
    });
  }
}

// Position + radius over time: pops open where you drew it, then glides
// behind you and grows big enough that the sides of the frame are the ring.
function geom(E, p) {
  const now = E.now;
  const pop = easeOutBack(clamp((now - p.t0) / 600, 0, 1));
  const g = easeInOutCubic(clamp((now - p.t0 - GROW_DELAY) / GROW_MS, 0, 1));
  const big = E.W * 0.5;
  let x = lerp(p.x0, E.W / 2, g), y = lerp(p.y0, E.H * 0.5, g);
  let r = lerp(p.R0 * pop, big, g);
  if (p.closing >= 0) { const c = clamp((now - p.closing) / 650, 0, 1); r *= 1 - c * c; }
  return { x, y, r: Math.max(0, r), g };
}

export function update(E, G) {
  const now = E.now, dt = E.dt;
  spin += dt * 0.55;
  if (E.settings.portal !== false) {
    if (G.pointingHand) {
      const tip = G.pointingHand.lm[8];
      const vx = lastTip ? (tip.x - lastTip.x) / dt : 0, vy = lastTip ? (tip.y - lastTip.y) / dt : 0;
      lastTip = { x: tip.x, y: tip.y };
      const n = 4 + Math.min(10, Math.hypot(vx, vy) / (100 * E.S));
      for (let i = 0; i < n; i++) {
        E.particles.emit({
          x: tip.x + rand(-3, 3) * E.S, y: tip.y + rand(-3, 3) * E.S,
          vx: vx * 0.12 + rand(-45, 45) * E.S, vy: vy * 0.12 + rand(-70, 10) * E.S, ay: 90 * E.S,
          life: rand(0.25, 0.75), size: rand(1.5, 3.5) * E.S, sprite: Math.random() < 0.7 ? 'orange' : 'gold', drag: 2,
        });
      }
    } else lastTip = null;
    if (G.circle) {
      if (portals.length) closeAll(E);
      else open(E, G.circle.x, G.circle.y, G.circle.r * 1.15);
    }
  }
  for (const p of portals) {
    if (p.closing < 0 && now - p.t0 > MAX_OPEN_MS) p.closing = now;
    const g = geom(E, p);
    if (g.r > 2) ringSparks(E, g.x, g.y, g.r, Math.round(5 + 10 * g.g));
  }
  portals = portals.filter((p) => p.closing < 0 || now - p.closing < 650);

  if (entrance.mode === 'charging' && now - entrance.t0 > CHARGE_MS) { entrance.mode = 'opening'; entrance.t0 = now; }
  if (entrance.mode === 'opening' && now - entrance.t0 > OPEN_MS) entrance.mode = 'none';
  if (entrance.mode === 'closing' && now - entrance.t0 > CLOSE_MS) { entrance.mode = 'black'; entrance.t0 = now; }
  if (entrance.mode !== 'none' && entrance.mode !== 'black') {
    const r = entranceRadius(E);
    if (r > 2 && r < Math.hypot(E.W, E.H) / 2) ringSparks(E, E.W / 2, E.H / 2, r, entrance.mode === 'charging' ? 14 : 12);
  }
}

// The sparking ring. `thick` is the size reference (so huge rings don't get absurdly fat).
export function drawRing(ctx, x, y, r, k, t, S, thick) {
  if (r < 1 || k <= 0) return;
  const w = thick === undefined ? r : thick;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.35 * k;
  ctx.strokeStyle = 'rgb(255,110,10)';
  ctx.lineWidth = w * 0.2;
  ctx.shadowBlur = Math.min(w * 0.35, 40 * S);
  ctx.shadowColor = 'rgba(255,120,0,1)';
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.8 * k;
  ctx.strokeStyle = 'rgb(255,170,40)';
  ctx.lineWidth = w * 0.07;
  ctx.stroke();
  ctx.globalAlpha = k;
  ctx.strokeStyle = '#fff3cf';
  ctx.lineWidth = Math.max(1, w * 0.022);
  ctx.stroke();
  for (let i = 0; i < 3; i++) {
    ctx.setLineDash([w * 0.06 * (1 + Math.random()), w * 0.12 * (1 + Math.random())]);
    ctx.lineDashOffset = -t * w * (2.5 + i * 1.3) * (i % 2 ? -1 : 1);
    ctx.lineWidth = Math.max(1, w * 0.035);
    ctx.strokeStyle = i ? '#ffb347' : '#ffffff';
    ctx.globalAlpha = 0.85 * k;
    ctx.beginPath(); ctx.arc(x, y, r * (0.965 + 0.03 * i), 0, TAU); ctx.stroke();
  }
  ctx.restore();
}

function drawInterior(E, x, y, r) {
  const o = E.o;
  o.save();
  o.beginPath(); o.arc(x, y, r, 0, TAU); o.clip();
  const kind = E.settings.portalDest || 'shanghai';
  // tiny parallax: the far place shifts against your head movement
  const head = E.pose && E.poseAge < 500 ? E.pose[0].x * E.W : E.W / 2;
  const dx = -(head - E.W / 2) * 0.05;
  if (!drawDestination(o, kind, E.W, E.H, E.now / 1000, dx)) drawMirror(E, x, y, r);
  // inner rim shadow so it reads as a hole in space
  radialFill(o, x, y, r, [[0.7, 'rgba(30,8,0,0)'], [1, 'rgba(50,14,0,0.7)']]);
  o.restore();
}

function drawMirror(E, x, y, r) {
  const o = E.o;
  o.fillStyle = '#1a0905';
  o.fillRect(x - r, y - r, r * 2, r * 2);
  const N = 6;
  const s = (2.6 * r) / Math.min(E.W, E.H);
  const drift = Math.sin(spin * 0.7) * r * 0.25;
  for (let k = 0; k < N; k++) {
    o.save();
    o.translate(x, y);
    o.rotate(spin + k * TAU / N);
    if (k % 2) o.scale(1, -1);
    o.beginPath(); o.moveTo(0, 0); o.arc(0, 0, r * 1.05, -TAU / (2 * N) - 0.03, TAU / (2 * N) + 0.03); o.closePath(); o.clip();
    o.rotate(-spin * 0.45);
    o.drawImage(E.frame, -E.W * s / 2 + drift, -E.H * s / 2 + drift * 0.6, E.W * s, E.H * s);
    o.restore();
  }
  o.globalCompositeOperation = 'multiply';
  o.fillStyle = 'rgb(255,200,150)';
  o.fillRect(x - r, y - r, r * 2, r * 2);
  o.globalCompositeOperation = 'source-over';
}

export function drawPortals(E) {
  for (const p of portals) {
    const g = geom(E, p);
    if (g.r < 1) continue;
    drawInterior(E, g.x, g.y, g.r);
    drawRing(E.o, g.x, g.y, g.r, 1, E.now / 1000, E.S, Math.min(g.r, E.H * 0.32));
  }
}

function entranceRadius(E) {
  const Rmax = Math.hypot(E.W, E.H) / 2 * 1.04, r0 = E.H * 0.07;
  const t = E.now - entrance.t0;
  if (entrance.mode === 'charging') return r0 * easeOutBack(clamp(t / 500, 0, 1));
  if (entrance.mode === 'opening') return lerp(r0, Rmax, easeInOutCubic(clamp(t / OPEN_MS, 0, 1)));
  if (entrance.mode === 'closing') return Rmax * (1 - easeInOutCubic(clamp(t / CLOSE_MS, 0, 1)));
  return 0;
}

// Called last: everything already drawn is revealed through the ring.
export function drawEntrance(E) {
  const o = E.o, cx = E.W / 2, cy = E.H / 2;
  if (entrance.mode === 'black') {
    o.fillStyle = '#000'; o.fillRect(0, 0, E.W, E.H);
    const k = 0.6 + 0.4 * Math.sin(E.now / 400);
    radialFill(o, cx, cy, E.H * 0.14, [[0, `rgba(255,120,30,${0.22 * k})`], [1, 'rgba(255,120,30,0)']]);
    return;
  }
  const r = entranceRadius(E);
  if (entrance.mode === 'charging') {
    // the sling ring spinning up in the dark
    o.fillStyle = '#000'; o.fillRect(0, 0, E.W, E.H);
    radialFill(o, cx, cy, r * 2.2, [[0, 'rgba(255,140,40,0.35)'], [1, 'rgba(255,120,30,0)']]);
    drawRing(o, cx, cy, r, 1, E.now / 1000, E.S, Math.max(r, E.H * 0.05));
    return;
  }
  const t2 = E.tmp2Ctx;
  t2.setTransform(1, 0, 0, 1, 0, 0); t2.filter = 'none'; t2.globalAlpha = 1;
  t2.globalCompositeOperation = 'copy';
  t2.drawImage(E.out, 0, 0);
  t2.globalCompositeOperation = 'source-over';
  o.fillStyle = '#000'; o.fillRect(0, 0, E.W, E.H);
  if (r > 0.5) {
    o.save(); o.beginPath(); o.arc(cx, cy, r, 0, TAU); o.clip(); o.drawImage(E.tmp2, 0, 0); o.restore();
    drawRing(o, cx, cy, r, 1, E.now / 1000, E.S, Math.min(r, E.H * 0.42));
  }
}
