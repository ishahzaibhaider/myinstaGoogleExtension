// Thor: raise a fist above your head and lightning strikes it from above;
// arcs crawl over your body, your eyes glow, the picture goes stormy.
import { TAU, rand, radialFill, rgba, jagged, pathOf, strokeBolt, lerp } from './utils.js';

let s = 0, fist = null, bolts = [], nextBolt = 0, manualUntil = -1e9, eyes = null;

export const active = () => s > 0.01;
export const needsMask = () => s > 0.05;

export function key(E) { manualUntil = E.now < manualUntil ? -1e9 : E.now + 6000; }

function spawnBolt(E) {
  const x1 = fist.x + rand(-fist.r * 0.5, fist.r * 0.5), y1 = fist.y;
  const x0 = x1 + rand(-0.45, 0.45) * E.W, y0 = -10;
  const pts = jagged(x0, y0, x1, y1, 0.2, 6);
  const branches = [];
  const nb = 1 + ((Math.random() * 3) | 0);
  for (let i = 0; i < nb; i++) {
    const k = 3 + ((Math.random() * (pts.length - 6)) | 0);
    const [bx, by] = pts[k];
    const len = rand(0.08, 0.25) * E.H;
    const a = Math.atan2(y1 - y0, x1 - x0) + rand(-1.1, 1.1);
    branches.push(pathOf(jagged(bx, by, bx + Math.cos(a) * len, by + Math.sin(a) * len, 0.3, 4)));
  }
  bolts.push({ main: pathOf(pts), branches, t0: E.now, life: rand(90, 220), w: rand(1.6, 3.2) * E.S });
  E.flash(200, 225, 255, rand(0.18, 0.4) * s);
}

export function update(E, G) {
  const now = E.now, dt = E.dt, on = E.settings.thor !== false;
  let target = null;
  if (on && G.fistUp) target = G.fistUp;
  else if (on && now < manualUntil) target = { x: E.W * 0.5, y: E.H * 0.12, r: E.H * 0.06 };
  if (target) {
    fist = fist ? { x: lerp(fist.x, target.x, 0.4), y: lerp(fist.y, target.y, 0.4), r: target.r } : target;
    s = Math.min(1, s + dt / 0.4);
  } else s = Math.max(0, s - dt / 0.5);
  if (s > 0.2 && fist) {
    if (now >= nextBolt) { nextBolt = now + rand(70, 200) / (0.5 + s); spawnBolt(E); }
    const n = Math.round(6 * s);
    for (let i = 0; i < n; i++) {
      E.particles.emit({ x: fist.x + rand(-fist.r, fist.r), y: fist.y + rand(-fist.r, fist.r), vx: rand(-120, 120) * E.S, vy: rand(-160, 40) * E.S, ay: 300 * E.S, life: rand(0.2, 0.6), size: rand(1, 2.5) * E.S, sprite: Math.random() < 0.5 ? 'white' : 'blue' });
    }
  }
  bolts = bolts.filter((b) => now - b.t0 < b.life);
  eyes = null;
  if (E.pose && E.poseAge < 500) {
    const lm = E.pose, v = (i) => (lm[i].visibility === undefined ? 1 : lm[i].visibility);
    if (v(2) > 0.5 && v(5) > 0.5) eyes = [{ x: lm[2].x * E.W, y: lm[2].y * E.H }, { x: lm[5].x * E.W, y: lm[5].y * E.H }];
  }
}

export function drawGrade(E) {
  if (s < 0.01) return;
  const o = E.o, k = s * 0.55;
  o.save();
  o.globalCompositeOperation = 'multiply';
  o.fillStyle = rgba(255 - 135 * k, 255 - 105 * k, 255 - 50 * k, 1);
  o.fillRect(0, 0, E.W, E.H);
  o.restore();
}

export function drawFront(E) {
  if (s < 0.01) return;
  const o = E.o;
  for (const b of bolts) {
    const a = s * (0.6 + 0.4 * Math.random()) * (1 - (E.now - b.t0) / b.life * 0.6);
    strokeBolt(o, b.main, b.w, '#ffffff', '#6fb6ff', a);
    for (const br of b.branches) strokeBolt(o, br, b.w * 0.55, '#e8f4ff', '#6fb6ff', a * 0.8);
  }
  if (E.seg.ok && s > 0.1) {
    const n = E.seg.edges();
    if (n) {
      const sx = E.W / E.MW, sy = E.H / E.MH, cnt = Math.round(10 * s);
      for (let i = 0; i < cnt; i++) {
        const idx = E.seg.edge[(Math.random() * n) | 0];
        const x = (idx % E.MW) * sx, y = ((idx - (idx % E.MW)) / E.MW) * sy;
        const a = rand(TAU), len = rand(0.03, 0.09) * E.H;
        strokeBolt(o, pathOf(jagged(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, 0.35, 3)), 1.1 * E.S, '#ffffff', '#7fc4ff', 0.75 * s);
      }
    }
  }
  o.save();
  o.globalCompositeOperation = 'lighter';
  if (fist) radialFill(o, fist.x, fist.y, fist.r * 3.5, [[0, rgba(200, 230, 255, 0.75 * s)], [0.3, rgba(120, 180, 255, 0.4 * s)], [1, 'rgba(120,180,255,0)']]);
  if (eyes) {
    const d = Math.hypot(eyes[0].x - eyes[1].x, eyes[0].y - eyes[1].y);
    for (const e of eyes) radialFill(o, e.x, e.y, d * 0.55, [[0, rgba(255, 255, 255, 0.95 * s)], [0.25, rgba(170, 220, 255, 0.85 * s)], [1, 'rgba(120,190,255,0)']]);
  }
  o.restore();
}
