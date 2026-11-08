// Shared math + drawing helpers for the effects.
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t) => t * t * t;
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
export const easeOutElastic = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1);
export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
export const rgba = (r, g, b, a) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;

// ---- value noise / fbm (deterministic per seed)
export function hash(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
export function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, s, oct = 4) {
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  for (let o = 0; o < oct; o++) { sum += amp * vnoise(x * f, y * f, s + o * 17); norm += amp; f *= 2.1; amp *= 0.5; }
  return sum / norm;
}

// ---- sprites
export function glowSprite(r, g, b, size = 64, hot = 0.18) {
  const c = new OffscreenCanvas(size, size);
  const ctx = c.getContext('2d');
  const grd = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(hot, rgba(r, g, b, 0.95));
  grd.addColorStop(0.5, rgba(r, g, b, 0.35));
  grd.addColorStop(1, rgba(r, g, b, 0));
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, size, size);
  return c;
}

export function radialFill(ctx, x, y, r, stops) {
  if (r <= 0.5) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

// ---- lightning
// Midpoint-displacement polyline from (x0,y0) to (x1,y1). Returns [[x,y],...].
export function jagged(x0, y0, x1, y1, rough = 0.22, depth = 5) {
  let pts = [[x0, y0], [x1, y1]];
  let off = Math.hypot(x1 - x0, y1 - y0) * rough;
  for (let d = 0; d < depth; d++) {
    const next = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      const dx = bx - ax, dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const o = (Math.random() - 0.5) * 2 * off;
      next.push([(ax + bx) / 2 + nx * o, (ay + by) / 2 + ny * o], [bx, by]);
    }
    pts = next;
    off *= 0.5;
  }
  return pts;
}

export function pathOf(pts) {
  const p = new Path2D();
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  return p;
}

// Three-pass glowing stroke (no shadowBlur → cheap).
export function strokeBolt(ctx, path, w, core, glow, alpha = 1) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalAlpha = 0.22 * alpha; ctx.strokeStyle = glow; ctx.lineWidth = w * 7; ctx.stroke(path);
  ctx.globalAlpha = 0.5 * alpha; ctx.lineWidth = w * 2.6; ctx.stroke(path);
  ctx.globalAlpha = alpha; ctx.strokeStyle = core; ctx.lineWidth = w; ctx.stroke(path);
  ctx.restore();
}

// ---- geometry
export function convexHull(points) {
  const p = points.slice().sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

// Expands a polygon away from its centroid and returns a smooth closed Path2D.
export function blobPath(pts, expand) {
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p.x; cy += p.y; }
  cx /= pts.length; cy /= pts.length;
  const q = pts.map((p) => {
    const dx = p.x - cx, dy = p.y - cy, l = Math.hypot(dx, dy) || 1;
    return { x: p.x + dx / l * expand, y: p.y + dy / l * expand };
  });
  const path = new Path2D();
  const n = q.length;
  for (let i = 0; i < n; i++) {
    const a = q[i], b = q[(i + 1) % n];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    if (i === 0) path.moveTo(mx, my); else path.quadraticCurveTo(a.x, a.y, mx, my);
  }
  const a = q[0], b = q[1 % n];
  path.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
  path.closePath();
  return path;
}
