// Gesture recognition on MediaPipe hand (21 points) + pose (33 points) landmarks.
// All positions are returned in output-pixel space.
//
//  snap        thumb+middle pinch, then release with the middle finger curling (or a snap sound)
//  pinchHand   hand currently in the "about to snap" pose → Infinity Gauntlet charge
//  pointing    index finger only → spark trail; drawing a loop → circle (portal)
//  palmHand    open hand held still → repulsor charge; thrust toward camera → blast
//  fistUp      closed fist raised above the head → Thor
//  peaceToggle ✌️ held for a moment → hologram on/off
const SENS = {
  low:    { pinch: 0.38, curl: 0.16 },
  normal: { pinch: 0.46, curl: 0.10 },
  high:   { pinch: 0.56, curl: 0.05 },
};

const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export class Gestures {
  constructor() {
    this.handState = {};
    this.trail = [];            // index fingertip positions while pointing
    this.lastPointing = -1e9;
    this.lastCircle = -1e9;
    this.lastAudioSpike = -1e9;
    this.palm = { since: 0, hist: [] };
    this.peace = { since: 0, lastFire: -1e9 };
    this.fist = { since: 0 };
    this.cross = { since: 0, lastFire: -1e9 };
    this.rise = { hist: [], lastFire: -1e9 };
    this.debug = '';
  }

  audioSpike(now) { this.lastAudioSpike = now; }

  analyze(hr, poseLm, W, H, now, sensitivity) {
    const sens = SENS[sensitivity] || SENS.normal;
    const G = {
      hands: [], snap: false, snapHand: null, pinchHand: null, pointingHand: null, circle: null,
      palmHand: null, thrust: false, fistUp: null, peaceToggle: false,
      domainToggle: false, domainHand: null, arise: false,
    };
    const infos = [];

    // head height (for "above the head") from pose, else a fixed band
    let headY = H * 0.3, noseX = W / 2;
    let shoulderW = W * 0.25;
    let face = null;   // { x, y, r } — hands touching your face never count as a snap
    if (poseLm) {
      const vis = (i) => (poseLm[i].visibility === undefined ? 1 : poseLm[i].visibility);
      if (vis(0) > 0.5) { headY = poseLm[0].y * H; noseX = poseLm[0].x * W; }
      if (vis(11) > 0.5 && vis(12) > 0.5) shoulderW = Math.max(10, Math.abs(poseLm[11].x - poseLm[12].x) * W);
      if (vis(0) > 0.5) {
        const ear = Math.hypot((poseLm[7].x - poseLm[8].x) * W, (poseLm[7].y - poseLm[8].y) * H);
        const eye = Math.hypot((poseLm[2].x - poseLm[5].x) * W, (poseLm[2].y - poseLm[5].y) * H);
        face = { x: noseX, y: headY, r: Math.max(ear * 0.6, eye * 2, shoulderW * 0.25) };
      }
    }

    const seen = new Set();
    (hr.landmarks || []).forEach((raw, idx) => {
      const lm = raw.map((p) => ({ x: p.x * W, y: p.y * H }));
      const label = (hr.handedness && hr.handedness[idx] && hr.handedness[idx][0] && hr.handedness[idx][0].categoryName) || String(idx);
      const sc = d2(lm[0], lm[9]);
      if (sc < 4) return;
      const rel = (a, b) => d2(lm[a], lm[0]) > d2(lm[b], lm[0]) * 1.1; // tip further from wrist than pip → extended
      const f = { index: rel(8, 6), middle: rel(12, 10), ring: rel(16, 14), pinky: rel(20, 18) };
      const thumbOut = d2(lm[4], lm[9]) / sc > 0.72;
      const nExt = (f.index | 0) + (f.middle | 0) + (f.ring | 0) + (f.pinky | 0);
      const pinchD = d2(lm[4], lm[12]) / sc;
      const center = { x: 0, y: 0 };
      for (const i of [0, 5, 9, 13, 17]) { center.x += lm[i].x / 5; center.y += lm[i].y / 5; }
      const up = (lm[9].y - lm[0].y) < -0.35 * sc; // fingers roughly pointing up
      const hand = {
        lm, label, sc, center, fingers: f, thumbOut, nExt,
        fist: nExt === 0 && pinchD > 0.55,
        open: nExt === 4 && thumbOut && up,
        pinch: pinchD < sens.pinch,
        pointing: f.index && !f.middle && !f.ring && !f.pinky && pinchD > 0.6,
        peace: f.index && f.middle && !f.ring && !f.pinky && d2(lm[8], lm[12]) / sc > 0.32,
        crossed: crossedFingers(lm, f, sc),
        high: center.y < headY - 0.05 * H,
        nearFace: !!face && [4, 8, 12, 16, 20].filter((t) => Math.hypot(lm[t].x - face.x, lm[t].y - face.y) < face.r).length >= 3,
        conf: (hr.handedness && hr.handedness[idx] && hr.handedness[idx][0] && hr.handedness[idx][0].score) || 1,
      };
      G.hands.push(hand);

      // ---- snap state machine (per hand)
      // A snap only counts if it is deliberate:
      //   1. the snap pose (thumb on middle finger) is held ≥ 120 ms, not covering your face,
      //      with a confidently tracked hand  → "armed" (the stones appear)
      //   2. then, within 420 ms, the fingers spring apart AND the middle finger
      //      clearly snaps down toward the palm. The click sound only makes a
      //      slightly smaller curl enough — it never fires a snap on its own.
      let key = label; if (seen.has(key)) key = label + idx;
      seen.add(key);
      const hs = this.handState[key] || (this.handState[key] = { frames: 0, since: 0, lastPinch: -1e9, d12: 0, lastSeen: now });
      hs.lastSeen = now;
      const d12w = d2(lm[12], lm[0]) / sc;
      const ok = !hand.nearFace && hand.conf > 0.6;
      if (hand.pinch && ok) {
        if (!hs.frames) hs.since = now;
        hs.frames++; hs.lastPinch = now; hs.d12 = d12w;
        if (hs.frames >= 2 && now - hs.since >= 120) G.pinchHand = hand;
      } else {
        const armed = hs.frames >= 2 && hs.lastPinch - hs.since >= 120;
        const recent = now - hs.lastPinch < 420;
        const released = pinchD > sens.pinch + 0.2;
        const heard = now - this.lastAudioSpike < 350;
        const curl = hs.d12 - d12w;
        const curled = curl > sens.curl || (heard && curl > sens.curl * 0.4);
        if (ok && armed && recent && released && curled) {
          G.snap = true; G.snapHand = hand; hs.frames = 0;
        }
        if (!recent || !ok) hs.frames = 0;
      }
      infos.push(`${label[0]}:${hand.fist ? 'fist' : hand.open ? 'open' : hand.pointing ? 'point' : hand.peace ? 'peace' : hand.crossed ? 'cross' : hand.pinch ? 'pinch' : nExt} tm=${pinchD.toFixed(2)}`);
    });

    for (const [key, hs] of Object.entries(this.handState)) {
      if (now - hs.lastSeen > 2000) delete this.handState[key];
    }

    // ---- pointing → trail → circle
    const pointing = G.hands.find((h) => h.pointing);
    if (pointing) {
      G.pointingHand = pointing;
      const tip = pointing.lm[8];
      this.trail.push({ x: tip.x, y: tip.y, t: now });
      this.lastPointing = now;
      while (this.trail.length && now - this.trail[0].t > 1600) this.trail.shift();
      if (now - this.lastCircle > 1500) {
        const c = this._circle(this.trail, W, H);
        if (c) { G.circle = c; this.trail.length = 0; this.lastCircle = now; }
      }
    } else if (now - this.lastPointing > 300) {
      this.trail.length = 0;
    }

    // ---- open palm → repulsor
    const opens = G.hands.filter((h) => h.open);
    const open = opens.length === 1 ? opens[0] : null;   // two open hands = ARISE, not a repulsor
    if (open) {
      if (!this.palm.since) { this.palm.since = now; this.palm.hist.length = 0; }
      this.palm.hist.push({ t: now, sc: open.sc });
      while (this.palm.hist.length && now - this.palm.hist[0].t > 400) this.palm.hist.shift();
      const held = now - this.palm.since;
      let growth = 1;
      const old = this.palm.hist.find((h) => now - h.t >= 180);
      if (old) growth = open.sc / old.sc;
      G.palmHand = Object.assign({ held, growth }, open);
      if (held > 250 && growth > 1.32) { G.thrust = true; this.palm.since = 0; this.palm.hist.length = 0; }
    } else {
      this.palm.since = 0;
    }

    // ---- fist above head → Thor (hand model first, pose wrist as fallback)
    let fistUp = G.hands.find((h) => h.fist && h.high);
    let fistPos = fistUp ? { x: fistUp.center.x, y: fistUp.center.y, r: fistUp.sc * 0.5 } : null;
    if (!fistPos && poseLm) {
      const vis = (i) => (poseLm[i].visibility === undefined ? 1 : poseLm[i].visibility);
      for (const w of [15, 16]) {
        if (vis(w) < 0.5 || vis(0) < 0.5) continue;
        const wy = poseLm[w].y * H, wx = poseLm[w].x * W;
        if (wy < headY - 0.35 * shoulderW) {
          // an open hand up there is a wave, not a hammer
          const openNear = G.hands.some((h) => h.open && Math.hypot(h.center.x - wx, h.center.y - wy) < h.sc * 2);
          if (!openNear) { fistPos = { x: wx, y: wy - shoulderW * 0.12, r: shoulderW * 0.14 }; break; }
        }
      }
    }
    if (fistPos) {
      if (!this.fist.since) this.fist.since = now;
      if (now - this.fist.since > 150) G.fistUp = fistPos;
    } else this.fist.since = 0;

    // ---- ✌️ held → toggle hologram
    const peace = G.hands.find((h) => h.peace && !h.pointing);
    if (peace) {
      if (!this.peace.since) this.peace.since = now;
      if (now - this.peace.since > 450 && now - this.peace.lastFire > 2500) {
        G.peaceToggle = true; this.peace.lastFire = now; this.peace.since = 0;
      }
    } else this.peace.since = 0;

    // ---- crossed index + middle finger held → Gojo's Domain Expansion
    const cross = G.hands.find((h) => h.crossed);
    if (cross) {
      if (!this.cross.since) this.cross.since = now;
      if (now - this.cross.since > 450 && now - this.cross.lastFire > 2500) {
        G.domainToggle = true; G.domainHand = cross; this.cross.lastFire = now; this.cross.since = 0;
      }
    } else this.cross.since = 0;

    // ---- both hands open, lifted upward together → ARISE
    const lifted = G.hands.filter((h) => h.nExt >= 3);
    if (lifted.length === 2) {
      const y = (lifted[0].center.y + lifted[1].center.y) / 2;
      this.rise.hist.push({ t: now, y });
      while (this.rise.hist.length && now - this.rise.hist[0].t > 1300) this.rise.hist.shift();
      const lowest = this.rise.hist.reduce((m, h) => Math.max(m, h.y), 0);
      if (lowest - y > H * 0.22 && now - this.rise.lastFire > 3000) {
        G.arise = true; this.rise.lastFire = now; this.rise.hist.length = 0;
      }
    } else this.rise.hist.length = 0;

    this.debug = infos.join(' | ') || 'no hands';
    return G;
  }

  // Detects a drawn loop in the fingertip trail.
  _circle(trail, W, H) {
    if (trail.length < 12) return null;
    const span = trail[trail.length - 1].t - trail[0].t;
    if (span < 350) return null;
    let cx = 0, cy = 0;
    for (const p of trail) { cx += p.x; cy += p.y; }
    cx /= trail.length; cy /= trail.length;
    let rSum = 0;
    const rs = trail.map((p) => { const r = Math.hypot(p.x - cx, p.y - cy); rSum += r; return r; });
    const rMean = rSum / trail.length;
    if (rMean < Math.min(W, H) * 0.06) return null;
    let v = 0;
    for (const r of rs) v += (r - rMean) * (r - rMean);
    if (Math.sqrt(v / rs.length) / rMean > 0.33) return null;
    let total = 0, prev = Math.atan2(trail[0].y - cy, trail[0].x - cx);
    for (let i = 1; i < trail.length; i++) {
      const a = Math.atan2(trail[i].y - cy, trail[i].x - cx);
      let d = a - prev;
      if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI;
      total += d; prev = a;
    }
    if (Math.abs(total) < 5.2) return null;
    return { x: cx, y: cy, r: rMean };
  }
}

// Index and middle finger up and crossed (Gojo's sign), ring + pinky folded.
// MediaPipe either puts the two tips on top of each other or swaps their order
// across the hand, so both count.
function crossedFingers(lm, f, sc) {
  if (!f.index || f.ring || f.pinky) return false;
  if (d2(lm[8], lm[6]) / sc < 0.35) return false;       // index really extended
  const ax = lm[17].x - lm[5].x, ay = lm[17].y - lm[5].y, al = Math.hypot(ax, ay) || 1;
  const proj = (p) => ((p.x - lm[5].x) * ax + (p.y - lm[5].y) * ay) / al;
  const tips = d2(lm[8], lm[12]) / sc;
  const swapped = proj(lm[8]) > proj(lm[12]);
  const midUp = d2(lm[12], lm[0]) > d2(lm[10], lm[0]) * 1.02;
  return midUp && (tips < 0.22 || (swapped && tips < 0.5)) && d2(lm[4], lm[12]) / sc > 0.5;
}
