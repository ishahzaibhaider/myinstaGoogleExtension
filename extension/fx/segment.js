// Person segmentation products + the "background plate": a continuously
// learned picture of the room behind you, with never-seen areas filled in,
// so effects can remove you from the frame and the room stays.
export class Segment {
  constructor() {
    this.W = 0; this.H = 0; this.MW = 0; this.MH = 0;
    this.PW = 160; this.PH = 90;
    this.ok = false;          // a mask was produced this frame
    this.personFrac = 0;
    this.bbox = null;         // in mask px
    this.edge = new Int32Array(0); this.edgeN = 0; this.edgeDirty = true;
    this.bgFrames = 0;
    this.plateFrame = -1;
    this.frameNo = 0;
    this.emptySince = -1;
    this.room = null;
  }

  setup(W, H, MW, MH) {
    this.W = W; this.H = H; this.MW = MW; this.MH = MH;
    this.PH = Math.max(8, Math.round(this.PW * H / W));
    const mk = (w, h, o) => { const c = new OffscreenCanvas(w, h); return [c, c.getContext('2d', o || {})]; };
    [this.mask, this.maskCtx] = mk(MW, MH);
    [this.loose, this.looseCtx] = mk(MW, MH);
    [this.dmask, this.dmaskCtx] = mk(MW, MH);
    [this.gmask, this.gmaskCtx] = mk(MW, MH);
    [this.soft, this.softCtx] = mk(MW, MH);
    [this.bg, this.bgCtx] = mk(W, H);
    [this.tmp, this.tmpCtx] = mk(W, H);
    [this.plate, this.plateCtx] = mk(W, H);
    [this.pp, this.ppCtx] = mk(this.PW, this.PH, { willReadFrequently: true });
    [this.ppOut, this.ppOutCtx] = mk(this.PW, this.PH);
    this.ppImg = this.ppOutCtx.createImageData(this.PW, this.PH);
    this.maskImg = this.maskCtx.createImageData(MW, MH);
    this.looseImg = this.looseCtx.createImageData(MW, MH);
    for (const img of [this.maskImg, this.looseImg]) {
      img.data.fill(255);
      for (let i = 3; i < img.data.length; i += 4) img.data[i] = 0;
    }
    this.tight = new Uint8Array(MW * MH);
    this.edge = new Int32Array(MW * MH);
    this.bgFrames = 0; this.ok = false; this.plateFrame = -1; this.poseRuns = 0; this.emptySince = -1;
    if (this.room) this.applyRoom(this.room);
  }

  // m: MediaPipe MPMask (same size as the ML canvas)
  update(m) {
    const w = this.MW, h = this.MH;
    const f = m.getAsFloat32Array();
    if (f.length !== w * h) { this.clear(); return; }
    const d = this.maskImg.data, l = this.looseImg.data, t = this.tight;
    let count = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let i = 0, j = 3; i < f.length; i++, j += 4) {
      const v = f[i];
      const a = v <= 0.3 ? 0 : v >= 0.7 ? 255 : (v - 0.3) * 637.5;
      d[j] = a; t[i] = a;
      l[j] = v >= 0.12 ? 255 : v * 2125;
      if (a > 127) {
        count++;
        const x = i % w, y = (i - x) / w;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    this.personFrac = count / f.length;
    this.bbox = count > 20 ? { x0, y0, x1, y1 } : null;
    this.ok = count > 20;
    this.edgeDirty = true;
    this.maskCtx.putImageData(this.maskImg, 0, 0);
    this.looseCtx.putImageData(this.looseImg, 0, 0);
    // grown + softened copy: used to cut you out of the picture completely
    const dm = this.dmaskCtx;
    dm.clearRect(0, 0, w, h);
    dm.filter = `blur(${Math.max(3, w / 45)}px)`;
    for (let k = 0; k < 6; k++) dm.drawImage(this.loose, 0, 0);
    dm.filter = 'none';
    // grown even further: used when learning the room, so no hair / edge
    // pixels of you ever get baked into the background plate
    const gm = this.gmaskCtx;
    gm.clearRect(0, 0, w, h);
    gm.filter = `blur(${Math.max(5, w / 22)}px)`;
    for (let k = 0; k < 8; k++) gm.drawImage(this.dmask, 0, 0);
    gm.filter = 'none';
    // feathered tight mask: clean edges when you stand in front of something
    const sm = this.softCtx;
    sm.clearRect(0, 0, w, h);
    sm.filter = `blur(${Math.max(1, w / 260).toFixed(1)}px)`;
    sm.drawImage(this.mask, 0, 0);
    sm.filter = 'none';
  }

  clear() {
    this.ok = false; this.personFrac = 0; this.bbox = null; this.edgeN = 0; this.edgeDirty = false;
    this.tight && this.tight.fill(0);
    for (const img of [this.maskImg, this.looseImg]) for (let j = 3; j < img.data.length; j += 4) img.data[j] = 0;
    for (const c of [this.maskCtx, this.looseCtx, this.dmaskCtx, this.gmaskCtx, this.softCtx]) c.clearRect(0, 0, this.MW, this.MH);
  }

  // Indices (mask px) of pixels on the person's outline. Computed on demand.
  edges() {
    if (!this.edgeDirty) return this.edgeN;
    const w = this.MW, h = this.MH, t = this.tight, e = this.edge;
    let n = 0;
    for (let y = 1; y < h - 1; y += 2) {
      for (let x = 1; x < w - 1; x += 2) {
        const i = y * w + x;
        if (t[i] > 128 && (t[i - 1] < 100 || t[i + 1] < 100 || t[i - w] < 100 || t[i + w] < 100)) e[n++] = i;
      }
    }
    this.edgeN = n; this.edgeDirty = false;
    return n;
  }

  // Blend the current frame (minus you) into the remembered background.
  // While the detector is still warming up, "no person found" is ambiguous,
  // so for the first runs we only learn when you are actually detected —
  // otherwise you would get burned into the plate behind yourself.
  //
  // "Nobody detected" is also what the first frames look like when you walk
  // back into the picture, before the tracker has found you. So the room is
  // only learned from a person-free frame after it has been person-free for
  // 1.2 s — otherwise you would be painted into the empty room.
  learnBackground(frame, now) {
    this.poseRuns = (this.poseRuns || 0) + 1;
    if (this.ok) this.emptySince = -1;
    else if (this.emptySince < 0) this.emptySince = now;
    if (!this.ok && (this.poseRuns < 12 || now - this.emptySince < 1200)) return;
    const t = this.tmpCtx;
    t.globalCompositeOperation = 'copy';
    t.drawImage(frame, 0, 0, this.W, this.H);
    if (this.ok) {
      t.globalCompositeOperation = 'destination-out';
      t.drawImage(this.gmask, 0, 0, this.W, this.H);
      t.drawImage(this.gmask, 0, 0, this.W, this.H);
      t.drawImage(this.gmask, 0, 0, this.W, this.H);
    }
    t.globalCompositeOperation = 'source-over';
    this.bgCtx.globalAlpha = this.bgFrames < 15 ? 0.5 : 0.15;
    this.bgCtx.drawImage(this.tmp, 0, 0);
    this.bgCtx.globalAlpha = 1;
    this.bgFrames++;
  }

  // A saved photo of your empty room fills every spot never seen live
  // (the area right behind you) with the real thing instead of a guess.
  applyRoom(bmp) {
    this.room = bmp;
    if (!bmp || !this.bgCtx) return;
    if (Math.abs(bmp.width / bmp.height - this.W / this.H) > 0.03) return;   // different camera shape
    this.bgCtx.globalCompositeOperation = 'destination-over';
    this.bgCtx.drawImage(bmp, 0, 0, this.W, this.H);
    this.bgCtx.globalCompositeOperation = 'source-over';
    this.bgFrames = Math.max(this.bgFrames, 20);
    this.plateFrame = -1;
  }

  // Fills the never-seen region behind you. Each row is interpolated between
  // the nearest known room pixels on its left and right, which continues
  // walls, shelves and gradients across the gap instead of leaving a soft
  // person-shaped blob. Rows with nothing known copy the nearest known row.
  buildPlate(frameNo, every = 4) {
    if (this.plateFrame >= 0 && frameNo - this.plateFrame < every) return;
    this.plateFrame = frameNo;
    const PW = this.PW, PH = this.PH;
    const ctx = this.ppCtx;
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(this.bg, 0, 0, PW, PH);
    const src = ctx.getImageData(0, 0, PW, PH).data;
    const out = this.ppImg.data;
    const rowKnown = new Uint8Array(PH);
    const L = new Int32Array(PW), R = new Int32Array(PW);
    for (let y = 0; y < PH; y++) {
      const o = y * PW;
      let last = -1;
      for (let x = 0; x < PW; x++) { if (src[(o + x) * 4 + 3] > 200) last = x; L[x] = last; }
      last = -1;
      for (let x = PW - 1; x >= 0; x--) { if (src[(o + x) * 4 + 3] > 200) last = x; R[x] = last; }
      if (L[PW - 1] < 0) continue;
      rowKnown[y] = 1;
      for (let x = 0; x < PW; x++) {
        const i = (o + x) * 4;
        const a = src[i + 3] / 255;
        const l = L[x], r = R[x];
        let cr, cg, cb;
        if (l >= 0 && r >= 0 && l !== r) {
          const t = (x - l) / (r - l), il = (o + l) * 4, ir = (o + r) * 4;
          cr = src[il] + (src[ir] - src[il]) * t; cg = src[il + 1] + (src[ir + 1] - src[il + 1]) * t; cb = src[il + 2] + (src[ir + 2] - src[il + 2]) * t;
        } else {
          const k = (o + (l >= 0 ? l : r)) * 4;
          cr = src[k]; cg = src[k + 1]; cb = src[k + 2];
        }
        out[i] = src[i] * a + cr * (1 - a); out[i + 1] = src[i + 1] * a + cg * (1 - a); out[i + 2] = src[i + 2] * a + cb * (1 - a);
        out[i + 3] = 255;
      }
    }
    // rows with no known pixel at all: blend the nearest known rows above/below
    for (let y = 0; y < PH; y++) {
      if (rowKnown[y]) continue;
      let up = y - 1; while (up >= 0 && !rowKnown[up]) up--;
      let dn = y + 1; while (dn < PH && !rowKnown[dn]) dn++;
      for (let x = 0; x < PW; x++) {
        const i = (y * PW + x) * 4;
        if (up < 0 && dn >= PH) { out[i] = out[i + 1] = out[i + 2] = 90; }
        else if (up < 0) { const k = (dn * PW + x) * 4; out[i] = out[k]; out[i + 1] = out[k + 1]; out[i + 2] = out[k + 2]; }
        else if (dn >= PH) { const k = (up * PW + x) * 4; out[i] = out[k]; out[i + 1] = out[k + 1]; out[i + 2] = out[k + 2]; }
        else {
          const t = (y - up) / (dn - up), a = (up * PW + x) * 4, b = (dn * PW + x) * 4;
          out[i] = out[a] + (out[b] - out[a]) * t; out[i + 1] = out[a + 1] + (out[b + 1] - out[a + 1]) * t; out[i + 2] = out[a + 2] + (out[b + 2] - out[a + 2]) * t;
        }
        out[i + 3] = 255;
      }
      rowKnown[y] = 0;
    }
    this.ppOutCtx.putImageData(this.ppImg, 0, 0);

    const p = this.plateCtx;
    p.globalCompositeOperation = 'copy';
    p.filter = `blur(${Math.round(this.W / PW * 1.5)}px)`;
    p.drawImage(this.ppOut, -4, -4, this.W + 8, this.H + 8);
    p.filter = 'none';
    p.globalCompositeOperation = 'source-over';
    p.drawImage(this.bg, 0, 0);
  }

  // Full-frame "empty room": the plate plus moving camera grain, so the
  // picture still looks live while nobody is in it.
  drawEmptyRoom(dst) {
    dst.drawImage(this.plate, 0, 0);
    if (!this.grain) {
      const g = new OffscreenCanvas(128, 128), gc = g.getContext('2d');
      const im = gc.createImageData(128, 128);
      for (let i = 0; i < im.data.length; i += 4) { const v = 128 + (Math.random() - 0.5) * 120; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
      gc.putImageData(im, 0, 0);
      this.grain = dst.createPattern(g, 'repeat');
    }
    dst.save();
    dst.globalCompositeOperation = 'overlay';
    dst.globalAlpha = 0.07;
    dst.translate((Math.random() * 128) | 0, (Math.random() * 128) | 0);
    dst.fillStyle = this.grain;
    dst.fillRect(-128, -128, this.W + 256, this.H + 256);
    dst.restore();
  }

  // Paints the plate over the (grown) person area of dst → you are gone.
  drawPersonRemoved(dst) {
    const t = this.tmpCtx;
    t.globalCompositeOperation = 'copy';
    t.drawImage(this.plate, 0, 0);
    t.globalCompositeOperation = 'destination-in';
    t.drawImage(this.dmask, 0, 0, this.W, this.H);
    t.globalCompositeOperation = 'source-over';
    dst.drawImage(this.tmp, 0, 0);
    dst.drawImage(this.tmp, 0, 0);
  }

  // frame ∩ mask → into ctx (as a 'copy'). tight=true uses the feathered
  // tight mask (no room halo around you), else the generous one.
  personCutout(ctx, frame, tight = false) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(frame, 0, 0, this.W, this.H);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(tight ? this.soft : this.loose, 0, 0, this.W, this.H);
    ctx.globalCompositeOperation = 'source-over';
  }
}
