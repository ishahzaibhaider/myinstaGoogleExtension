// Portal destinations. "shanghai" is painted procedurally (no photos, works
// offline): the Pudong skyline at night seen across the Huangpu river, with
// twinkling aviation lights, cycling LED façades and a shimmering reflection.
// "custom" is a picture the user picked in the popup.
import { rand, TAU } from './utils.js';

let sky = null, skyW = 0, skyH = 0, lights = [], horizon = 0, refl = null;

function mulberry(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function windows(g, r, x, y, w, h, density, warm) {
  const cw = Math.max(2, w / 9), ch = Math.max(2, h / 40);
  for (let yy = y + ch; yy < y + h - ch; yy += ch * 1.6) {
    for (let xx = x + cw * 0.5; xx < x + w - cw * 0.5; xx += cw * 1.5) {
      if (r() > density) continue;
      const c = warm && r() < 0.7 ? `rgba(255,${200 + (r() * 40) | 0},${120 + (r() * 60) | 0},${0.5 + r() * 0.5})` : `rgba(${190 + (r() * 60) | 0},${215 + (r() * 40) | 0},255,${0.4 + r() * 0.5})`;
      g.fillStyle = c; g.fillRect(xx, yy, cw * 0.8, ch * 0.7);
    }
  }
}

function build(W, H) {
  skyW = W; skyH = H;
  const r = mulberry(2049);
  sky = new OffscreenCanvas(W, H);
  const g = sky.getContext('2d');
  horizon = H * 0.66;
  lights = [];

  // sky: night blue → violet → warm city haze at the horizon
  const sg = g.createLinearGradient(0, 0, 0, horizon);
  sg.addColorStop(0, '#060a1f'); sg.addColorStop(0.45, '#1a1446'); sg.addColorStop(0.8, '#5a2a63'); sg.addColorStop(1, '#d9785a');
  g.fillStyle = sg; g.fillRect(0, 0, W, horizon);
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.6})`; g.fillRect(r() * W, r() * horizon * 0.6, 1 + r(), 1 + r()); }
  const moon = g.createRadialGradient(W * 0.85, H * 0.14, 0, W * 0.85, H * 0.14, H * 0.07);
  moon.addColorStop(0, 'rgba(255,246,220,1)'); moon.addColorStop(0.35, 'rgba(255,240,210,0.9)'); moon.addColorStop(1, 'rgba(255,230,200,0)');
  g.fillStyle = moon; g.fillRect(W * 0.75, H * 0.04, H * 0.2, H * 0.2);

  const U = H / 100; // skyline unit
  // far layer: hazy low-rise
  g.fillStyle = '#2a1f45';
  for (let x = 0; x < W;) { const w = (3 + r() * 6) * U, h = (5 + r() * 12) * U; g.fillRect(x, horizon - h, w, h); x += w * 0.85; }
  // mid layer: generic towers with windows
  for (let x = -2 * U; x < W;) {
    const w = (4 + r() * 7) * U, h = (12 + r() * 22) * U;
    g.fillStyle = r() < 0.5 ? '#141433' : '#1b1838';
    g.fillRect(x, horizon - h, w, h);
    windows(g, r, x, horizon - h, w, h, 0.45, true);
    if (r() < 0.4) lights.push({ type: 'red', x: x + w / 2, y: horizon - h - U * 0.6, ph: r() * TAU });
    x += w + r() * 2 * U;
  }

  // --- landmarks
  const lx = (f) => W * f;
  // Jin Mao Tower (stepped pagoda)
  {
    const cx = lx(0.6), base = horizon, top = horizon - 47 * U, w0 = 7 * U;
    g.fillStyle = '#1d2140';
    g.beginPath(); g.moveTo(cx - w0 / 2, base);
    const steps = 9;
    for (let i = 0; i <= steps; i++) { const y = base - (base - top) * (i / steps), w = w0 * (1 - 0.55 * i / steps); g.lineTo(cx - w / 2, y); g.lineTo(cx - w / 2 * 0.92, y - U * 0.8); }
    g.lineTo(cx, top - 6 * U);
    for (let i = steps; i >= 0; i--) { const y = base - (base - top) * (i / steps), w = w0 * (1 - 0.55 * i / steps); g.lineTo(cx + w / 2 * 0.92, y - U * 0.8); g.lineTo(cx + w / 2, y); }
    g.closePath(); g.fill();
    windows(g, r, cx - w0 * 0.35, top, w0 * 0.7, base - top, 0.55, true);
    lights.push({ type: 'gold', x: cx, y: top - 6 * U, ph: 0 });
  }
  // Shanghai World Financial Center (the "bottle opener")
  {
    const cx = lx(0.7), base = horizon, top = horizon - 56 * U, wb = 7.5 * U, wt = 3.2 * U;
    g.fillStyle = '#1a2a4a';
    g.beginPath(); g.moveTo(cx - wb / 2, base); g.lineTo(cx - wt / 2, top); g.lineTo(cx + wt / 2, top); g.lineTo(cx + wb / 2, base); g.closePath(); g.fill();
    const hy = top + 3.2 * U, hh = 3.6 * U;
    g.save(); g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.moveTo(cx - wt * 0.32, hy); g.lineTo(cx + wt * 0.32, hy); g.lineTo(cx + wt * 0.2, hy + hh); g.lineTo(cx - wt * 0.2, hy + hh); g.closePath(); g.fill();
    g.restore();
    g.save(); g.globalCompositeOperation = 'destination-over'; g.fillStyle = sg; g.fillRect(cx - wb, top - U, wb * 2, 8 * U); g.restore();
    g.strokeStyle = 'rgba(120,200,255,0.8)'; g.lineWidth = Math.max(1, U * 0.25);
    g.beginPath(); g.moveTo(cx - wb / 2, base); g.lineTo(cx - wt / 2, top); g.lineTo(cx + wt / 2, top); g.lineTo(cx + wb / 2, base); g.stroke();
    windows(g, r, cx - wb * 0.35, top + 8 * U, wb * 0.7, base - top - 8 * U, 0.35, false);
    lights.push({ type: 'red', x: cx, y: top - U * 0.5, ph: 1.3 });
  }
  // Shanghai Tower (twisting, tallest) — LED façade animated later
  {
    const cx = lx(0.79), base = horizon, top = horizon - 64 * U, wb = 9 * U;
    const pts = [];
    for (let i = 0; i <= 20; i++) { const t = i / 20, y = base - (base - top) * t, w = wb * (1 - 0.62 * t) * (1 + 0.04 * Math.sin(t * 9)); pts.push([cx - w / 2 + Math.sin(t * 3) * U * 0.6 * t, y, cx + w / 2 + Math.sin(t * 3) * U * 0.6 * t]); }
    g.fillStyle = '#18223f';
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const p of pts) g.lineTo(p[0], p[1]);
    g.lineTo(cx + U * 0.8, top - 2.5 * U); for (let i = pts.length - 1; i >= 0; i--) g.lineTo(pts[i][2], pts[i][1]); g.closePath(); g.fill();
    windows(g, r, cx - wb * 0.3, top + 4 * U, wb * 0.6, base - top - 4 * U, 0.3, false);
    lights.push({ type: 'led', x: cx, top, base, wb });
    lights.push({ type: 'red', x: cx + U * 0.8, y: top - 2.5 * U, ph: 2.1 });
  }
  // Oriental Pearl Tower (legs, two pink spheres, spire)
  {
    const cx = lx(0.3), base = horizon, U2 = U * 1.05;
    g.strokeStyle = '#2a2547'; g.lineWidth = 1.6 * U2; g.lineCap = 'round';
    for (const dx of [-5, 0, 5]) { g.beginPath(); g.moveTo(cx + dx * U2, base); g.lineTo(cx + dx * 0.25 * U2, base - 18 * U2); g.stroke(); }
    g.lineWidth = 1.2 * U2;
    g.beginPath(); g.moveTo(cx, base - 18 * U2); g.lineTo(cx, base - 46 * U2); g.stroke();
    g.lineWidth = Math.max(1, 0.4 * U2);
    g.beginPath(); g.moveTo(cx, base - 46 * U2); g.lineTo(cx, base - 60 * U2); g.stroke();
    lights.push({ type: 'pearl', x: cx, y: base - 21 * U2, r: 5.2 * U2 });
    lights.push({ type: 'pearl', x: cx, y: base - 41 * U2, r: 3 * U2 });
    lights.push({ type: 'pearl', x: cx, y: base - 50 * U2, r: 1.2 * U2 });
    lights.push({ type: 'red', x: cx, y: base - 60 * U2, ph: 0.4 });
  }
  // near riverfront strip of low buildings with warm lights
  for (let x = 0; x < W;) { const w = (2 + r() * 5) * U, h = (2 + r() * 5) * U; g.fillStyle = '#0e0c22'; g.fillRect(x, horizon - h, w, h); windows(g, r, x, horizon - h, w, h, 0.7, true); x += w; }
  // promenade light line
  g.fillStyle = 'rgba(255,200,120,0.85)'; g.fillRect(0, horizon - U * 0.4, W, U * 0.4);

  // river
  const rg = g.createLinearGradient(0, horizon, 0, H);
  rg.addColorStop(0, '#2a1c3c'); rg.addColorStop(1, '#05060f');
  g.fillStyle = rg; g.fillRect(0, horizon, W, H - horizon);

  // reflection source (flipped skyline), drawn with shimmer each frame
  refl = new OffscreenCanvas(W, Math.ceil(H - horizon));
  const rc = refl.getContext('2d');
  rc.save(); rc.translate(0, 0); rc.scale(1, -0.75); rc.filter = `blur(${Math.max(1, U * 0.5)}px)`;
  rc.drawImage(sky, 0, 0, W, horizon, 0, -horizon, W, horizon);
  rc.restore();
  rc.globalCompositeOperation = 'destination-in';
  const fade = rc.createLinearGradient(0, 0, 0, refl.height);
  fade.addColorStop(0, 'rgba(0,0,0,0.75)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
  rc.fillStyle = fade; rc.fillRect(0, 0, W, refl.height);
}

function drawShanghai(ctx, W, H, t, dx) {
  if (!sky || skyW !== W || skyH !== H) build(W, H);
  ctx.save();
  ctx.translate(dx, 0);
  ctx.drawImage(sky, -Math.abs(dx) - 2, 0, W + 2 * Math.abs(dx) + 4, H);
  // shimmering reflection: thin horizontal slices with a wave offset
  const rh = refl.height, slice = Math.max(2, Math.round(H / 120));
  ctx.globalCompositeOperation = 'lighter';
  for (let y = 0; y < rh; y += slice) {
    const off = Math.sin(t * 2.2 + y * 0.35) * (1 + y / rh * 5) * (H / 360);
    ctx.drawImage(refl, 0, y, W, slice, off, horizon + y, W, slice);
  }
  // animated lights
  const U = H / 100;
  for (const L of lights) {
    if (L.type === 'red') {
      const on = Math.sin(t * 2.5 + L.ph) > 0.2;
      if (!on) continue;
      const gr = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, U * 1.6);
      gr.addColorStop(0, 'rgba(255,60,50,1)'); gr.addColorStop(1, 'rgba(255,60,50,0)');
      ctx.fillStyle = gr; ctx.fillRect(L.x - U * 1.6, L.y - U * 1.6, U * 3.2, U * 3.2);
    } else if (L.type === 'gold') {
      const gr = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, U * 3);
      gr.addColorStop(0, 'rgba(255,220,140,0.9)'); gr.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = gr; ctx.fillRect(L.x - U * 3, L.y - U * 3, U * 6, U * 6);
    } else if (L.type === 'pearl') {
      const k = 0.8 + 0.2 * Math.sin(t * 1.7 + L.y);
      const gr = ctx.createRadialGradient(L.x - L.r * 0.3, L.y - L.r * 0.3, 0, L.x, L.y, L.r * 1.8);
      gr.addColorStop(0, `rgba(255,220,240,${k})`); gr.addColorStop(0.45, `rgba(255,70,170,${0.95 * k})`); gr.addColorStop(0.55, `rgba(200,40,140,${0.6 * k})`); gr.addColorStop(1, 'rgba(255,60,160,0)');
      ctx.fillStyle = gr; ctx.fillRect(L.x - L.r * 1.8, L.y - L.r * 1.8, L.r * 3.6, L.r * 3.6);
    } else if (L.type === 'led') {
      const hue = (t * 40) % 360;
      ctx.globalAlpha = 0.55;
      for (let i = 0; i < 6; i++) {
        const y = L.base - (L.base - L.top) * ((i / 6 + t * 0.08) % 1);
        const w = L.wb * (1 - 0.62 * (L.base - y) / (L.base - L.top)) * 0.9;
        ctx.fillStyle = `hsl(${(hue + i * 25) % 360},90%,60%)`;
        ctx.fillRect(L.x - w / 2, y, w, Math.max(1, U * 0.45));
      }
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

let custom = null;
export async function setCustom(dataUrl) {
  custom = null;
  if (!dataUrl) return;
  try { const b = await (await fetch(dataUrl)).blob(); custom = await createImageBitmap(b); } catch (e) { custom = null; }
}

// Draws the destination covering the whole W×H frame. dx = small parallax shift.
export function drawDestination(ctx, kind, W, H, t, dx) {
  if (kind === 'custom' && custom) {
    const s = Math.max(W / custom.width, H / custom.height) * 1.06;
    const w = custom.width * s, h = custom.height * s;
    ctx.drawImage(custom, (W - w) / 2 + dx, (H - h) / 2, w, h);
    return true;
  }
  if (kind === 'shanghai' || kind === 'custom') { drawShanghai(ctx, W, H, t, dx); return true; }
  return false;
}
