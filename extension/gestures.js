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
    this.debug = '';
  }

  audioSpike(now) { this.lastAudioSpike = now; }

  analyze(hr, poseLm, W, H, now, sensitivity) {
    const sens = SENS[sensitivity] || SENS.normal;
    const G = {
      hands: [], snap: false, snapHand: null, pinchHand: null, pointingHand: null, circle: null,
      palmHand: null, thrust: false, fistUp: null, peaceToggle: false,
    };
    const infos = [];

    // head height (for "above the head") from pose, else a fixed band
    let headY = H * 0.3, noseX = W / 2;
    let shoulderW = W * 0.25;
    if (poseLm) {
      const vis = (i) => (poseLm[i].visibility === undefined ? 1 : poseLm[i].visibility);
      if (vis(0) > 0.5) { headY = poseLm[0].y * H; noseX = poseLm[0].x * W; }
      if (vis(11) > 0.5 && vis(12) > 0.5) shoulderW = Math.max(10, Math.abs(poseLm[11].x - poseLm[12].x) * W);
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
        peace: f.index && f.middle && !f.ring && !f.pinky,
        high: center.y < headY - 0.05 * H,
      };
      G.hands.push(hand);

      // ---- snap state machine (per hand)
      let key = label; if (seen.has(key)) key = label + idx;
      seen.add(key);
      const hs = this.handState[key] || (this.handState[key] = { frames: 0, lastPinch: -1e9, d12: 0, lastSeen: now });
      hs.lastSeen = now;
      const d12w = d2(lm[12], lm[0]) / sc;
      if (hand.pinch) {
        hs.frames++; hs.lastPinch = now; hs.d12 = d12w;
        if (hs.frames >= 2) G.pinchHand = hand;
      } else {
        const recent = now - hs.lastPinch < 380;
        const released = pinchD > sens.pinch + 0.2;
        const curled = d12w < hs.d12 - sens.curl;
        const heard = now - this.lastAudioSpike < 350;
        if (hs.frames >= 2 && recent && released && (curled || heard)) {
          G.snap = true; G.snapHand = hand; hs.frames = 0;
        }
        if (!recent) hs.frames = 0;
      }
      infos.push(`${label[0]}:${hand.fist ? 'fist' : hand.open ? 'open' : hand.pointing ? 'point' : hand.peace ? 'peace' : hand.pinch ? 'pinch' : nExt} tm=${pinchD.toFixed(2)}`);
    });

    // A hand that vanished right after a pinch + a snap sound = snap too.
    for (const [key, hs] of Object.entries(this.handState)) {
      if (!seen.has(key) && hs.frames >= 2 && now - hs.lastPinch < 500 && now - this.lastAudioSpike < 350) {
        G.snap = true; hs.frames = 0;
      }
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
    const open = G.hands.filter((h) => h.open).sort((a, b) => b.sc - a.sc)[0];
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
