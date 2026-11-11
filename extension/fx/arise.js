// Solo Leveling — ARISE. Lift both open hands upward together: the picture
// goes dark violet, a System window pops up, and an army of shadow soldiers
// with burning purple eyes rises out of the floor behind you while a shadow
// aura pours off your body.
import { rand, clamp, easeOutCubic, easeOutBack, radialFill, rgba, TAU } from './utils.js';

const DURATION = 11000, FADE = 900;
let on = false, t0 = 0, soldiers = [], sprites = null, puff = null, eyes = null;

export const active = () => on;
export const needsMask = active;

function trigger(E) {
  if (on && E.now - t0 < 1500) return;
  on = true; t0 = E.now;
  if (!sprites) makeSprites();
  const W = E.W, H = E.H;
  const slots = [
    [0.08, 0.80, 0.62], [0.92, 0.80, 0.62], [0.24, 0.74, 0.52], [0.76, 0.74, 0.52],
    [0.38, 0.70, 0.44], [0.62, 0.70, 0.44], [0.5, 0.68, 0.4], [0.02, 1.0, 0.95], [0.98, 1.0, 0.95],
  ];
  soldiers = slots.map(([fx, fy, sc], i) => ({
    x: fx * W + rand(-0.02, 0.02) * W, base: fy * H, h: H * 0.75 * sc, delay: 0.25 + i * 0.12 + rand(0, 0.1),
    sp: sprites[i % sprites.length], ph: rand(TAU), flip: fx > 0.5,
  })).sort((a, b) => a.h - b.h);   // far (small) ones first
  E.flash(150, 90, 255, 0.5);
}
export function key(E) { trigger(E); }

// Soldier silhouettes, pre-rendered with a violet rim glow. Eye positions are
// in sprite-fraction coordinates so they can be drawn live.
function makeSprites() {
  const W = 200, H = 320;
  const variant = (kind) => {
    const c = new OffscreenCanvas(W, H), g = c.getContext('2d');
    const p = new Path2D();
    p.ellipse(100, 62, 24, 30, 0, 0, TAU);                                    // helmet
    if (kind !== 1) { p.moveTo(82, 52); p.quadraticCurveTo(64, 40, 52, 8); p.quadraticCurveTo(76, 34, 90, 40); p.closePath();      // swept-back horns
      p.moveTo(118, 52); p.quadraticCurveTo(136, 40, 148, 8); p.quadraticCurveTo(124, 34, 110, 40); p.closePath(); }
    else { p.moveTo(96, 34); p.quadraticCurveTo(110, -4, 150, 10); p.quadraticCurveTo(122, 18, 106, 40); p.closePath(); } // plume
    p.ellipse(56, 118, 36, 22, -0.25, 0, TAU); p.ellipse(144, 118, 36, 22, 0.25, 0, TAU);   // pauldrons
    p.moveTo(62, 104); p.lineTo(138, 104); p.lineTo(128, 236); p.lineTo(72, 236); p.closePath();   // torso
    p.moveTo(70, 110); p.lineTo(130, 110); p.lineTo(176, H); p.lineTo(24, H); p.closePath();       // cape
    p.rect(24, 124, 22, 110); p.rect(154, 124, 22, 110);                       // arms
    if (kind === 0) { p.rect(182, 0, 7, H); p.moveTo(178, 10); p.lineTo(185.5, -20); p.lineTo(193, 10); p.closePath(); } // spear
    if (kind === 2) { p.moveTo(18, 236); p.lineTo(24, 40); p.lineTo(32, 236); p.closePath(); }   // greatsword
    g.shadowColor = 'rgba(150,70,255,0.95)'; g.shadowBlur = 16;
    g.fillStyle = '#07040f'; g.fill(p);
    g.shadowBlur = 0; g.fill(p);
    g.globalCompositeOperation = 'source-atop';
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, 'rgba(70,30,130,0.35)'); gr.addColorStop(0.5, 'rgba(10,5,25,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.6)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    return { c, eyes: [[89 / W, 64 / H], [111 / W, 64 / H]] };
  };
  sprites = [variant(0), variant(1), variant(2)];
  const pc = new OffscreenCanvas(128, 128), pg = pc.getContext('2d');
  const gr = pg.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(70,35,120,0.55)'); gr.addColorStop(0.6, 'rgba(35,15,70,0.25)'); gr.addColorStop(1, 'rgba(20,10,40,0)');
  pg.fillStyle = gr; pg.fillRect(0, 0, 128, 128);
  puff = pc;
}

export function update(E, G) {
  if (E.settings.arise === false) { on = false; return; }
  if (G.arise) trigger(E);
  if (on && E.now - t0 > DURATION) on = false;
  if (!on) return;
  eyes = null;
  if (E.pose && E.poseAge < 500) {
    const lm = E.pose, v = (i) => (lm[i].visibility === undefined ? 1 : lm[i].visibility);
    if (v(2) > 0.5 && v(5) > 0.5) eyes = [{ x: lm[2].x * E.W, y: lm[2].y * E.H }, { x: lm[5].x * E.W, y: lm[5].y * E.H }];
  }
  if (E.seg.ok) {   // shadow aura pouring upward off your outline
    const n = E.seg.edges();
    for (let i = 0; i < 9 && n; i++) {
      const idx = E.seg.edge[(Math.random() * n) | 0];
      const x = (idx % E.MW) * E.W / E.MW, y = ((idx / E.MW) | 0) * E.H / E.MH;
      E.particles.emit({ x, y, vx: rand(-20, 20) * E.S, vy: rand(-110, -40) * E.S, life: rand(0.5, 1.1), size: rand(2, 5) * E.S, sizeEnd: 0.5, sprite: 'purple', drag: 0.8, alpha: 0.8 });
    }
  }
}

const level = (E) => {
  const t = E.now - t0;
  return clamp(t / 400, 0, 1) * clamp((DURATION - t) / FADE, 0, 1);
};

export function drawBack(E) {
  const o = E.o, W = E.W, H = E.H, k = level(E), t = (E.now - t0) / 1000;
  o.save();
  o.globalCompositeOperation = 'multiply';
  o.fillStyle = rgba(255 - 160 * k, 255 - 185 * k, 255 - 110 * k, 1);
  o.fillRect(0, 0, W, H);
  o.restore();
  for (const s of soldiers) {
    const p = easeOutCubic(clamp((t - s.delay) / 1.3, 0, 1));
    if (p <= 0) continue;
    const h = s.h, w = h * 200 / 320, y = s.base - h + (1 - p) * h * 0.9 + Math.sin(t * 1.3 + s.ph) * h * 0.005;
    o.save();
    o.globalAlpha = k * clamp(p * 1.5, 0, 1);
    o.translate(s.x, 0);
    if (s.flip) o.scale(-1, 1);
    o.drawImage(s.sp.c, -w / 2, y, w, h);
    o.restore();
    const blink = p > 0.85 ? 0.75 + 0.25 * Math.sin(t * 5 + s.ph) : 0;
    if (blink > 0) {
      o.save(); o.globalCompositeOperation = 'lighter';
      for (const [ex, ey] of s.sp.eyes) {
        const xx = s.x + (s.flip ? -1 : 1) * (ex - 0.5) * w, yy = y + ey * h;
        radialFill(o, xx, yy, h * 0.03, [[0, rgba(255, 230, 255, k * blink)], [0.3, rgba(190, 90, 255, 0.9 * k * blink)], [1, 'rgba(150,60,255,0)']]);
      }
      o.restore();
    }
  }
  // ground fog hides the soldiers' feet
  o.save();
  for (let i = 0; i < 14; i++) {
    const x = ((i / 14) * W + Math.sin(t * 0.4 + i) * W * 0.04), y = H * (0.86 + 0.06 * Math.sin(i * 1.7)), r = H * (0.22 + 0.06 * Math.sin(i));
    o.globalAlpha = k * 0.9;
    o.drawImage(puff, x - r, y - r * 0.6, r * 2, r * 1.2);
  }
  o.restore();
}

export function drawFront(E) {
  if (!on) return;
  const o = E.o, W = E.W, H = E.H, k = level(E), t = (E.now - t0) / 1000;
  if (eyes) {
    const d = Math.hypot(eyes[0].x - eyes[1].x, eyes[0].y - eyes[1].y);
    o.save(); o.globalCompositeOperation = 'lighter';
    for (const e of eyes) radialFill(o, e.x, e.y, d * 0.45, [[0, rgba(240, 230, 255, k)], [0.25, rgba(120, 150, 255, 0.9 * k)], [1, 'rgba(110,80,255,0)']]);
    o.restore();
  }
  // System window
  const wp = clamp((t - 0.3) / 0.3, 0, 1) * clamp((6 - t) / 0.4, 0, 1);
  if (wp > 0) {
    const ww = Math.min(W * 0.56, H * 1.1), wh = H * 0.17 * easeOutCubic(wp), x = (W - ww) / 2, y = H * 0.07;
    o.save();
    o.globalAlpha = k;
    o.fillStyle = 'rgba(6,18,45,0.78)'; o.fillRect(x, y, ww, wh);
    o.strokeStyle = 'rgba(120,200,255,0.95)'; o.lineWidth = Math.max(1, 1.6 * E.S);
    o.shadowColor = 'rgba(90,180,255,1)'; o.shadowBlur = 12 * E.S;
    o.strokeRect(x, y, ww, wh);
    o.shadowBlur = 0;
    if (wp > 0.8) {
      const fs = H * 0.036;
      o.textAlign = 'center'; o.fillStyle = '#e4f3ff';
      o.font = `700 ${Math.round(fs)}px -apple-system, "Segoe UI", sans-serif`;
      try { o.letterSpacing = `${Math.round(fs * 0.25)}px`; } catch (e) {}
      o.fillText('[ NOTIFICATION ]', W / 2, y + wh * 0.36);
      o.font = `500 ${Math.round(fs * 0.9)}px -apple-system, "Segoe UI", sans-serif`;
      try { o.letterSpacing = `${Math.round(fs * 0.08)}px`; } catch (e) {}
      o.fillStyle = 'rgba(200,230,255,0.95)';
      o.fillText('Skill activated: Shadow Extraction', W / 2, y + wh * 0.72);
    }
    o.restore();
  }
  // ARISE
  const ap = clamp((t - 0.9) / 0.5, 0, 1) * clamp((5 - t) / 0.6, 0, 1);
  if (ap > 0) {
    const fs = H * 0.17, s = 1 + 0.6 * Math.pow(1 - clamp((t - 0.9) / 0.35, 0, 1), 3);
    o.save();
    o.globalAlpha = ap * k;
    o.translate(W / 2, H * 0.84); o.scale(s, s);
    o.font = `900 ${Math.round(fs)}px "Avenir Next Condensed", "Arial Narrow", Impact, sans-serif`;
    try { o.letterSpacing = `${Math.round(fs * 0.12)}px`; } catch (e) {}
    o.textAlign = 'center'; o.textBaseline = 'middle';
    o.lineWidth = fs * 0.08; o.strokeStyle = 'rgba(10,0,25,0.9)'; o.strokeText('ARISE', 0, 0);
    o.shadowColor = 'rgba(170,80,255,1)'; o.shadowBlur = fs * 0.4;
    o.fillStyle = '#f3e9ff'; o.fillText('ARISE', 0, 0);
    o.restore();
  }
}
