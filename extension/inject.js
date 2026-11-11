// Infinity FX — page-world camera patch.
// Runs at document_start inside the page's own JS world. It wraps
// navigator.mediaDevices.getUserMedia so that the camera track a call site
// (Instagram, Google Meet, ...) receives is routed through the effects engine
// living in a hidden extension iframe. Everybody on the call sees the result.
(() => {
  if (window.__infxInstalled) return;
  window.__infxInstalled = true;
  if (typeof MediaDevices === 'undefined' || !MediaDevices.prototype.getUserMedia) return;

  const TAG = '[Infinity FX]';
  const origGUM = MediaDevices.prototype.getUserMedia;

  // ------------------------------------------------------------ engine link
  let engineWin = null;
  let engineReady = false;
  let engineWarm = false;   // engine has started the entrance (or has none)
  let engineActive = true;
  let requested = false;
  const pending = new Map();
  let nextId = 1;

  const engineFrame = () => document.getElementById('infx-engine-frame');

  function requestEngine() {
    if (requested && engineFrame()) return;
    requested = true;
    document.dispatchEvent(new CustomEvent('infx:need-engine'));
  }

  window.addEventListener('message', (e) => {
    const f = engineFrame();
    if (!f || e.source !== f.contentWindow) return;
    const d = e.data;
    if (!d || d.__infx !== 1) return;
    engineWin = f.contentWindow;
    if (d.type === 'ready') {
      engineReady = true;
      console.info(TAG, 'engine ready');
    } else if (d.type === 'warm') {
      engineWarm = true;
    } else if (d.type === 'active') {
      engineActive = !!d.value;
    } else if (d.type === 'result') {
      const cb = pending.get(d.id);
      if (cb) { pending.delete(d.id); cb(d); }
      else {
        const late = lateIds.get(d.id);
        if (late !== undefined) { clearTimeout(late); lateIds.delete(d.id); inflight = Math.max(0, inflight - 1); }
        if (d.frame) { try { d.frame.close(); } catch (_) {} }
      }
    } else if (d.type === 'error') {
      console.warn(TAG, d.message);
    }
  });

  let postErrors = 0;
  function toEngine(msg, transfer) {
    if (!engineWin) return false;
    try { engineWin.postMessage(Object.assign({ __infx: 1 }, msg), '*', transfer || []); return true; }
    catch (e) { if (postErrors++ < 3) console.warn(TAG, 'could not send to engine', e); return false; }
  }

  // Sends one ImageBitmap to the engine (transferred). Resolves with
  // { processed, frame: ImageBitmap } or null on timeout / failure.
  // ImageBitmaps (not VideoFrames) cross the page ↔ extension-process boundary.
  // A late reply is closed when it arrives (see the 'result' handler above),
  // and no new frame is sent while one is still in flight, so a slow machine
  // degrades to "plain camera" instead of a frozen picture.
  let inflight = 0;
  const lateIds = new Map();   // id → recovery timer, for replies that missed the deadline
  function processBitmap(bmp) {
    return new Promise((resolve) => {
      const id = nextId++;
      inflight++;
      const timer = setTimeout(() => {
        pending.delete(id);
        // the reply may still come; keep the slot reserved for up to 5 s, then give up on it
        lateIds.set(id, setTimeout(() => { if (lateIds.delete(id)) inflight = Math.max(0, inflight - 1); }, 5000));
        resolve(null);
      }, 400);
      pending.set(id, (d) => { clearTimeout(timer); inflight = Math.max(0, inflight - 1); resolve(d); });
      if (!toEngine({ type: 'frame', id, frame: bmp }, [bmp])) {
        clearTimeout(timer); pending.delete(id); inflight = Math.max(0, inflight - 1);
        try { bmp.close(); } catch (_) {}
        resolve(null);
      }
    });
  }

  const canUseEngine = () => engineReady && engineActive && engineWin && inflight === 0;

  // Keyboard backups (focus the call tab first). Alt+Shift+<key>:
  //   S snap  P portal  R repulsor  T thor  H hologram  E entrance/exit  G domain expansion  A arise
  window.addEventListener('keydown', (e) => {
    if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return;
    const map = { KeyS: 'snap', KeyP: 'portal', KeyR: 'repulsor', KeyT: 'thor', KeyH: 'hologram', KeyE: 'entrance', KeyG: 'domain', KeyA: 'arise' };
    const action = map[e.code];
    if (!action) return;
    toEngine({ type: 'key', action });
    e.preventDefault();
    e.stopPropagation();
  }, true);

  // -------------------------------------------------------- track wrapping
  const ourTracks = new WeakSet();
  const origClone = MediaStreamTrack.prototype.clone;
  MediaStreamTrack.prototype.clone = function () {
    const c = origClone.call(this);
    if (ourTracks.has(this)) ourTracks.add(c);
    return c;
  };

  // Make the processed track look like the real camera to the site.
  function dressTrack(out, src, ctl) {
    for (const name of ['getSettings', 'getCapabilities', 'getConstraints']) {
      try { out[name] = () => src[name](); } catch (e) {}
    }
    try { out.applyConstraints = (c) => src.applyConstraints(c); } catch (e) {}
    try { Object.defineProperty(out, 'label', { get: () => src.label, configurable: true }); } catch (e) {}
    try {
      Object.defineProperty(out, 'contentHint', {
        get: () => src.contentHint, set: (v) => { src.contentHint = v; }, configurable: true,
      });
    } catch (e) {}
    // Camera-off in the call → also stop burning CPU on frames nobody sees.
    try {
      const proto = Object.getPrototypeOf(out);
      const desc = Object.getOwnPropertyDescriptor(proto, 'enabled') ||
        Object.getOwnPropertyDescriptor(MediaStreamTrack.prototype, 'enabled');
      if (desc && desc.set) {
        Object.defineProperty(out, 'enabled', {
          get: () => desc.get.call(out),
          set: (v) => { const was = ctl.enabled; desc.set.call(out, v); ctl.enabled = !!v; if (!was && v) toEngine({ type: 'camOn' }); },
          configurable: true,
        });
      }
    } catch (e) {}
    const realStop = out.stop.bind(out);
    out.stop = () => { ctl.stop(); try { realStop(); } catch (e) {} try { src.stop(); } catch (e) {} };
    src.addEventListener('ended', () => { ctl.stop(); try { realStop(); } catch (e) {} });
    return out;
  }

  function wrapWithInsertableStreams(src) {
    const processor = new MediaStreamTrackProcessor({ track: src, maxBufferSize: 1 });
    const generator = new MediaStreamTrackGenerator({ kind: 'video' });
    const reader = processor.readable.getReader();
    const writer = generator.writable.getWriter();
    const ctl = { stopped: false, enabled: true, stop() { this.stopped = true; } };
    // Until the engine has loaded, send black frames (for up to 10 s) so the
    // portal entrance is the first thing the call sees, not the plain camera.
    const wrapStart = performance.now();
    let black = null;
    let lastOut = null, lastOutAt = -1e9;   // last processed frame, repeated if the engine is late
    const holdBlack = () => !engineWarm && document.documentElement.getAttribute('data-infx-entrance') !== '0' &&
      performance.now() - wrapStart < 12000;
    const blackFrame = (frame) => {
      const w = frame.displayWidth, h = frame.displayHeight;
      if (!black || black.width !== w || black.height !== h) {
        black = new OffscreenCanvas(w, h);
        const g = black.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      }
      return new VideoFrame(black, { timestamp: frame.timestamp });
    };

    (async () => {
      while (!ctl.stopped) {
        let r;
        try { r = await reader.read(); } catch (e) { break; }
        if (r.done) break;
        const frame = r.value;
        let out = frame;
        if (ctl.enabled && !canUseEngine()) {
          // engine busy with a late frame → keep showing the effect; still
          // loading → black (entrance); otherwise the camera as is
          try {
            if (engineReady && lastOut && performance.now() - lastOutAt < 3000) { out = new VideoFrame(lastOut, { timestamp: frame.timestamp }); frame.close(); }
            else if (holdBlack()) { out = blackFrame(frame); frame.close(); }
          } catch (e) { out = frame; }
        } else if (ctl.enabled && canUseEngine()) {
          try {
            const bmp = await createImageBitmap(frame);
            const res = await processBitmap(bmp);
            if (res && res.frame && res.processed) {
              out = new VideoFrame(res.frame, { timestamp: frame.timestamp });
              res.frame.close();
              frame.close();
              if (lastOut) lastOut.close();
              lastOut = out.clone(); lastOutAt = performance.now();
            } else if (!res && lastOut && performance.now() - lastOutAt < 3000) {
              // engine replied too late in the middle of an effect → repeat the
              // last effect frame rather than flashing the plain camera
              out = new VideoFrame(lastOut, { timestamp: frame.timestamp });
              frame.close();
            } else {
              if (res && res.frame) res.frame.close();
              if (res && lastOut) { lastOut.close(); lastOut = null; }
              // nothing to draw → camera frame as is (black while waiting for the entrance)
              if (holdBlack()) { out = blackFrame(frame); frame.close(); }
            }
          } catch (e) { out = frame; }
        }
        try { await writer.write(out); } catch (e) { try { out.close(); } catch (_) {} break; }
      }
      try { reader.cancel(); } catch (e) {}
      try { writer.close(); } catch (e) {}
      if (lastOut) { try { lastOut.close(); } catch (e) {} lastOut = null; }
    })();

    return dressTrack(generator, src, ctl);
  }

  function wrapWithCanvas(src) {
    // Fallback for browsers without insertable streams.
    const video = document.createElement('video');
    video.muted = true; video.playsInline = true;
    video.srcObject = new MediaStream([src]);
    video.play().catch(() => {});
    const s = src.getSettings();
    const canvas = document.createElement('canvas');
    canvas.width = s.width || 640; canvas.height = s.height || 480;
    const ctx = canvas.getContext('2d');
    const outStream = canvas.captureStream(s.frameRate || 30);
    const out = outStream.getVideoTracks()[0];
    const ctl = { stopped: false, enabled: true, stop() { this.stopped = true; video.srcObject = null; } };
    let busy = false;

    const tick = async () => {
      if (ctl.stopped) return;
      if (!busy && video.videoWidth) {
        busy = true;
        if (canvas.width !== video.videoWidth) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }
        let drawn = false;
        if (ctl.enabled && canUseEngine()) {
          try {
            const res = await processBitmap(await createImageBitmap(video));
            if (res && res.frame) {
              if (res.processed) { ctx.drawImage(res.frame, 0, 0, canvas.width, canvas.height); drawn = true; }
              res.frame.close();
            }
          } catch (e) {}
        }
        if (!drawn) ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        busy = false;
      }
      if ('requestVideoFrameCallback' in video) video.requestVideoFrameCallback(tick);
      else setTimeout(tick, 33);
    };
    tick();
    return dressTrack(out, src, ctl);
  }

  function wrapVideoTrack(src) {
    requestEngine();
    const canInsert = typeof MediaStreamTrackProcessor !== 'undefined' &&
      typeof MediaStreamTrackGenerator !== 'undefined' && typeof VideoFrame !== 'undefined';
    const out = canInsert ? wrapWithInsertableStreams(src) : wrapWithCanvas(src);
    ourTracks.add(out);
    startMirrorFix();
    if (engineReady) toEngine({ type: 'camOn' });   // a new camera track on an already-running engine
    return out;
  }

  // ------------------------------------------ optional: un-mirror self-view
  // Call sites flip your own preview like a mirror. Off by default; when on,
  // your preview shows exactly what the other side sees.
  let mirrorTimer = 0;
  function isMirrored(el) {
    let sign = 1;
    for (; el && el !== document.documentElement; el = el.parentElement) {
      const cs = getComputedStyle(el);
      if (cs.transform && cs.transform !== 'none') {
        try { if (new DOMMatrixReadOnly(cs.transform).a < 0) sign = -sign; } catch (e) {}
      }
      if (cs.scale && cs.scale !== 'none' && cs.scale.trim().startsWith('-')) sign = -sign;
    }
    return sign < 0;
  }
  function fixMirrors() {
    const want = document.documentElement.getAttribute('data-infx-unmirror') === '1';
    for (const v of document.querySelectorAll('video')) {
      const so = v.srcObject;
      const ours = want && so && typeof so.getVideoTracks === 'function' && so.getVideoTracks().some((t) => ourTracks.has(t));
      const flipped = v.hasAttribute('data-infx-flip');
      if (!ours) {
        if (flipped) { v.style.removeProperty('scale'); v.removeAttribute('data-infx-flip'); }
        continue;
      }
      if (isMirrored(v)) {
        if (flipped) { v.style.removeProperty('scale'); v.removeAttribute('data-infx-flip'); }
        else { v.style.setProperty('scale', '-1 1', 'important'); v.setAttribute('data-infx-flip', ''); }
      }
    }
  }
  function startMirrorFix() {
    if (!mirrorTimer) mirrorTimer = setInterval(fixMirrors, 700);
  }

  // ----------------------------------------- snap sound (mic, local only)
  // A finger snap is a sharp high-frequency click. We only look for that
  // spike to confirm the hand gesture; nothing is recorded or sent anywhere.
  let audioCtx = null;
  let lastSpike = 0;
  function tapAudio(track) {
    try {
      audioCtx = audioCtx || new AudioContext();
      const clone = track.clone();
      const node = audioCtx.createMediaStreamSource(new MediaStream([clone]));
      const hp = audioCtx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 1800;
      const an = audioCtx.createAnalyser();
      an.fftSize = 512;
      node.connect(hp); hp.connect(an);
      const buf = new Float32Array(an.fftSize);
      let avg = 0.003;
      const iv = setInterval(() => {
        if (track.readyState === 'ended') { clearInterval(iv); clone.stop(); return; }
        if (audioCtx.state === 'suspended') { audioCtx.resume().catch(() => {}); return; }
        if (!track.enabled) return;
        an.getFloatTimeDomainData(buf);
        let peak = 0, sum = 0;
        for (let i = 0; i < buf.length; i++) { const v = Math.abs(buf[i]); if (v > peak) peak = v; sum += v * v; }
        const rms = Math.sqrt(sum / buf.length);
        const now = performance.now();
        if (peak > 0.07 && rms > avg * 5 && now - lastSpike > 300) {
          lastSpike = now;
          toEngine({ type: 'audioSpike' });
        }
        avg = avg * 0.94 + rms * 0.06;
      }, 12);
    } catch (e) { /* audio confirmation is optional */ }
  }

  // ------------------------------------------------------------- the patch
  const enabled = () => document.documentElement.getAttribute('data-infx-enabled') !== '0';

  async function patchedGetUserMedia(constraints) {
    const stream = await origGUM.call(this, constraints);
    try {
      if (!enabled()) return stream;
      const audio = stream.getAudioTracks();
      audio.forEach(tapAudio);
      const videos = stream.getVideoTracks();
      if (!videos.length) return stream;
      const out = wrapVideoTrack(videos[0]);
      return new MediaStream([out, ...audio]);
    } catch (e) {
      console.warn(TAG, 'could not apply effects, using the plain camera', e);
      return stream;
    }
  }

  Object.defineProperty(MediaDevices.prototype, 'getUserMedia', {
    value: patchedGetUserMedia, writable: true, configurable: true,
  });
})();
