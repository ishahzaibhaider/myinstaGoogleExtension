// Tony Stark hologram: hold ✌️ for a moment and you become a flickering
// blue hologram projected into your (real) room. ✌️ again to come back.
import { rand, rgba, radialFill } from './utils.js';

let on = false, c = 0, scan = null, glitchUntil = -1e9, glitchBands = [];

export const active = () => c > 0.01;
export const needsMask = () => on || c > 0.01;
export const isOn = () => on;
export function toggle() { on = !on; }
export function key() { toggle(); }

export function update(E, G) {
  if (E.settings.hologram === false) on = false;
  else if (G.peaceToggle) toggle();
  const target = on ? 1 : 0;
  c += Math.sign(target - c) * Math.min(Math.abs(target - c), E.dt / (target ? 0.6 : 0.4));
  if (c > 0.01 && E.now > glitchUntil && Math.random() < 0.05) {
    glitchUntil = E.now + rand(60, 160);
    glitchBands = [];
    const n = 1 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) glitchBands.push({ y: Math.random() * E.H, h: rand(4, 30) * E.S, dx: rand(-18, 18) * E.S });
  }
}

function ensureScan(E) {
  if (scan) return;
  const p = new OffscreenCanvas(1, 3);
  const g = p.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, 0, 1, 1);
  scan = E.o.createPattern(p, 'repeat');
}

export function drawBase(E) {
  const o = E.o;
  ensureScan(E);
  o.drawImage(E.frame, 0, 0, E.W, E.H);
  if (!E.seg.ok) return;
  E.seg.buildPlate(E.frameNo, 3);
  E.seg.drawPersonRemoved(o);
  E.seg.personCutout(E.tmpCtx, E.frame);
  const t2 = E.tmp2Ctx;
  t2.setTransform(1, 0, 0, 1, 0, 0); t2.globalAlpha = 1;
  t2.globalCompositeOperation = 'copy';
  t2.filter = 'grayscale(1) brightness(1.2) contrast(1.15)';
  t2.drawImage(E.tmp, 0, 0);
  t2.filter = 'none';
  t2.globalCompositeOperation = 'multiply'; t2.fillStyle = 'rgb(120,205,255)'; t2.fillRect(0, 0, E.W, E.H);
  t2.globalCompositeOperation = 'destination-in'; t2.drawImage(E.tmp, 0, 0);
  t2.globalCompositeOperation = 'multiply'; t2.fillStyle = scan; t2.fillRect(0, 0, E.W, E.H);
  t2.globalCompositeOperation = 'destination-in'; t2.drawImage(E.tmp, 0, 0);
  t2.globalCompositeOperation = 'source-over';

  const bb = E.seg.bbox, sx = E.W / E.MW, sy = E.H / E.MH;
  if (bb) {
    const fx = (bb.x0 + bb.x1) / 2 * sx, fy = Math.min(E.H - 2, (bb.y1 + 1) * sy), fw = Math.max(10, (bb.x1 - bb.x0) * sx * 0.7);
    o.save(); o.globalCompositeOperation = 'lighter';
    o.translate(fx, fy); o.scale(1, 0.18);
    radialFill(o, 0, 0, fw, [[0, rgba(120, 210, 255, 0.7 * c)], [1, 'rgba(120,210,255,0)']]);
    o.restore();
  }
  o.save();
  o.globalCompositeOperation = 'lighter';
  o.globalAlpha = 0.55 * c;
  o.filter = `blur(${Math.round(8 * E.S)}px)`;
  o.drawImage(E.tmp2, 0, 0);
  o.restore();

  const flick = 0.78 + 0.14 * Math.random() + 0.08 * Math.sin(E.now / 60);
  o.save();
  o.globalAlpha = c * flick;
  if (E.now < glitchUntil) {
    let y = 0;
    for (const b of glitchBands.slice().sort((a, b2) => a.y - b2.y)) {
      const y0 = Math.max(y, b.y | 0), h = Math.max(1, b.h | 0);
      if (y0 >= E.H) break;
      if (y0 > y) o.drawImage(E.tmp2, 0, y, E.W, y0 - y, 0, y, E.W, y0 - y);
      o.drawImage(E.tmp2, 0, y0, E.W, h, b.dx, y0, E.W, h);
      y = y0 + h;
    }
    if (y < E.H) o.drawImage(E.tmp2, 0, y, E.W, E.H - y, 0, y, E.W, E.H - y);
  } else o.drawImage(E.tmp2, 0, 0);
  o.restore();
  if (c < 0.99) { o.save(); o.globalAlpha = 1 - c; o.drawImage(E.tmp, 0, 0); o.restore(); }
}
