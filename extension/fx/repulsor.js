// Iron Man: hold your open palm toward the camera and a repulsor charges in
// it (with an arc reactor glowing on your chest). Push the hand at the camera
// to fire — white-blue blast, flash, screen shake.
import { TAU, rand, radialFill, rgba, clamp, jagged, pathOf, strokeBolt, lerp, easeOutCubic } from './utils.js';

let charge = 0, pos = null, r = 24, blast = null, manualT = -1e9, flick = 1;

export const active = () => charge > 0.01 || !!blast;

export function key(E) {
  if (charge > 0.15 && pos) fire(E);
  else { manualT = E.now; pos = pos || { x: E.W * 0.68, y: E.H * 0.55 }; r = Math.max(r, E.H * 0.09); }
}

function fire(E) {
  blast = { t0: E.now, x: pos.x, y: pos.y };
  charge = 0; manualT = -1e9;
  for (let i = 0; i < 90; i++) {
    const a = rand(TAU), sp = rand(80, 420) * E.S;
    E.particles.emit({ x: pos.x, y: pos.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.3, 0.8), size: rand(1.5, 4) * E.S, sprite: Math.random() < 0.5 ? 'cyan' : 'white', drag: 2 });
  }
}

export function update(E, G) {
  const dt = E.dt, now = E.now;
  const on = E.settings.repulsor !== false;
  const h = on ? G.palmHand : null;
  const manual = on && now - manualT < 1000;
  if (h && h.held > 150) {
    const tx = h.center.x, ty = h.center.y;
    pos = pos ? { x: lerp(pos.x, tx, 0.5), y: lerp(pos.y, ty, 0.5) } : { x: tx, y: ty };
    r = lerp(r, h.sc * 0.55, 0.3);
    charge = Math.min(1, charge + dt / 0.75);
    if (G.thrust && charge > 0.4) fire(E);
  } else if (manual) {
    charge = Math.min(1, charge + dt / 0.8);
    if (charge >= 1) fire(E);
  } else charge = Math.max(0, charge - dt / 0.3);
  flick = 0.9 + 0.1 * Math.random();
  if (charge > 0.3 && pos) {
    for (let i = 0; i < 2; i++) {
      const a = rand(TAU), d = r * rand(1.6, 3.2);
      E.particles.emit({ x: pos.x + Math.cos(a) * d, y: pos.y + Math.sin(a) * d, vx: -Math.cos(a) * d * 2.4, vy: -Math.sin(a) * d * 2.4, life: 0.42, size: rand(1, 2.2) * E.S, sprite: 'cyan' });
    }
  }
  if (blast && now - blast.t0 > 700) blast = null;
}

export function draw(E) {
  const o = E.o;
  if (charge > 0.01 && pos) {
    const c = charge, k = c * flick, t = E.now / 1000;
    o.save();
    o.globalCompositeOperation = 'lighter';
    radialFill(o, pos.x, pos.y, E.H * 0.9, [[0, rgba(120, 190, 255, 0.2 * k)], [1, 'rgba(120,190,255,0)']]);
    radialFill(o, pos.x, pos.y, r * 2.4 * (0.5 + 0.5 * c), [[0, rgba(150, 210, 255, 0.55 * k)], [1, 'rgba(150,210,255,0)']]);
    radialFill(o, pos.x, pos.y, r * (0.45 + 0.4 * c), [[0, rgba(255, 255, 255, k)], [0.4, rgba(200, 235, 255, 0.9 * k)], [1, 'rgba(120,190,255,0)']]);
    o.lineWidth = Math.max(1, 1.5 * E.S);
    o.strokeStyle = rgba(170, 220, 255, 0.85 * k);
    for (let i = 0; i < 2; i++) {
      const rr = r * (1.25 + 0.35 * i) * (0.6 + 0.4 * c);
      o.setLineDash([rr * 0.3, rr * 0.18]);
      o.lineDashOffset = (i ? -1 : 1) * t * rr * 1.2;
      o.beginPath(); o.arc(pos.x, pos.y, rr, 0, TAU); o.stroke();
    }
    o.setLineDash([]);
    if (c > 0.35) {
      for (let i = 0; i < 3; i++) {
        const a = rand(TAU), len = r * rand(0.8, 1.6);
        strokeBolt(o, pathOf(jagged(pos.x, pos.y, pos.x + Math.cos(a) * len, pos.y + Math.sin(a) * len, 0.3, 3)), 1.2 * E.S, '#ffffff', '#7fc4ff', 0.6 * (c - 0.35));
      }
    }
    o.restore();
  }
  // arc reactor on the chest
  if (charge > 0.05 && E.pose && E.poseAge < 500) {
    const lm = E.pose, v = (i) => (lm[i].visibility === undefined ? 1 : lm[i].visibility);
    if (v(11) > 0.5 && v(12) > 0.5) {
      const sx = (lm[11].x + lm[12].x) / 2 * E.W, sy = (lm[11].y + lm[12].y) / 2 * E.H;
      const sw = Math.abs(lm[11].x - lm[12].x) * E.W;
      const cx = sx, cy = sy + sw * 0.32, rr = sw * 0.075 * (0.85 + 0.15 * Math.sin(E.now / 140));
      o.save(); o.globalCompositeOperation = 'lighter';
      radialFill(o, cx, cy, rr * 3.2, [[0, rgba(140, 200, 255, 0.5 * charge)], [1, 'rgba(140,200,255,0)']]);
      radialFill(o, cx, cy, rr, [[0, rgba(255, 255, 255, charge)], [0.5, rgba(180, 230, 255, 0.9 * charge)], [1, 'rgba(120,190,255,0)']]);
      o.restore();
    }
  }
  if (blast) {
    const p = clamp((E.now - blast.t0) / 600, 0, 1);
    E.flash(230, 245, 255, Math.pow(1 - p, 1.6) * 0.95);
    E.shake(16 * E.S * (1 - p));
    o.save(); o.globalCompositeOperation = 'lighter';
    const R = lerp(r, Math.hypot(E.W, E.H), easeOutCubic(p));
    radialFill(o, blast.x, blast.y, R, [[0, rgba(255, 255, 255, (1 - p) * 0.9)], [0.5, rgba(160, 215, 255, (1 - p) * 0.6)], [1, 'rgba(120,190,255,0)']]);
    o.globalAlpha = 1 - p;
    o.strokeStyle = 'rgba(200,235,255,1)';
    o.lineWidth = Math.max(2, 20 * E.S * (1 - p));
    o.beginPath(); o.arc(blast.x, blast.y, R * 0.9, 0, TAU); o.stroke();
    o.restore();
  }
}
