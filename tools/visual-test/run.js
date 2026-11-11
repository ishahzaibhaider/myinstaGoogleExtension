// Drives headless Chrome (for Testing) with the extension loaded and a fake
// camera fed from clip.y4m. Takes screenshots of the harness video at the
// requested moments, optionally firing hotkeys first.
//
//   node run.js out/ "2000" "4000:snap" "6500" ...
// Each step: "<ms to wait>[:<action>]" where action ∈ snap|portal|repulsor|thor|hologram|entrance|debug
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), http = require('http');

const CHROME = process.env.CHROME || path.join(process.env.HOME,
  'Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const EXT = path.resolve(__dirname, '..', '..', 'extension');
const CLIP = path.resolve(__dirname, 'clip.y4m');
const outDir = process.argv[2] || path.join(__dirname, 'out');
const steps = process.argv.slice(3).filter((a) => !a.startsWith('--'));
const CPU = process.argv.includes('--cpu');
const flagVal = (name, dflt) => { const a = process.argv.find((x) => x.startsWith(name + '=')); return a ? a.slice(name.length + 1) : dflt; };
const PRESET = JSON.parse(flagVal('--set', '{}'));            // extra chrome.storage.local settings, e.g. --set={"debug":true,"snap":false}
fs.mkdirSync(outDir, { recursive: true });
const PORT = Number(flagVal('--port', 8765)), DBG = Number(flagVal('--dbg', 9333));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJSON = (url) => new Promise((res, rej) => http.get(url, (r) => { let b = ''; r.on('data', (d) => b += d); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } }); }).on('error', rej));

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.cbs = new Map(); this.events = []; ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && this.cbs.has(d.id)) { this.cbs.get(d.id)(d); this.cbs.delete(d.id); } else if (d.method) this.events.push(d); }; }
  send(method, params = {}) { return new Promise((res) => { const id = ++this.id; this.cbs.set(id, res); this.ws.send(JSON.stringify({ id, method, params })); }); }
}
const connect = (url) => new Promise((res, rej) => { const ws = new WebSocket(url); ws.onopen = () => res(new CDP(ws)); ws.onerror = rej; });

const WATCHDOG = setTimeout(() => { console.error('WATCHDOG: giving up'); try { require('child_process').execSync('pkill -f "Google Chrome for Testing"'); } catch (e) {} process.exit(2); }, 120000);
const stage = (m) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s] ${m}`);
const T0 = Date.now();
(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, 'serve.js'), String(PORT)], { stdio: 'inherit' });
  const profile = fs.mkdtempSync('/tmp/infx-profile-' + PORT + '-');
  const chrome = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--no-first-run', '--disable-gpu-sandbox',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    `--remote-debugging-port=${DBG}`, `--user-data-dir=${profile}`,
    `--load-extension=${EXT}`, `--disable-extensions-except=${EXT}`,
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
    `--use-file-for-fake-video-capture=${CLIP}`,
    '--autoplay-policy=no-user-gesture-required', '--window-size=700,500',
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  let chromeLog = '';
  chrome.stderr.on('data', (d) => { chromeLog += d; });
  chrome.stdout.on('data', (d) => { chromeLog += d; });

  stage('chrome spawned pid ' + chrome.pid);
  let targets;
  for (let i = 0; i < 60; i++) { try { targets = await getJSON(`http://127.0.0.1:${DBG}/json`); break; } catch (e) { await sleep(250); } }
  if (!targets) { console.error('chrome did not start\n' + chromeLog); process.exit(1); }
  stage('targets: ' + targets.map((t) => t.type + ' ' + t.url).join(' | '));
  const page = targets.find((t) => t.type === 'page');
  const cdp = await connect(page.webSocketDebuggerUrl);
  stage('connected to page');
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Log.enable');
  await cdp.send('Page.navigate', { url: `http://localhost:${PORT}/harness.html` });
  stage('navigated');

  // find the extension's engine frame target to read its console
  let engineCdp = null;
  for (let i = 0; i < 80 && !engineCdp; i++) {
    await sleep(250);
    const ts = await getJSON(`http://127.0.0.1:${DBG}/json`);
    const eng = ts.find((t) => t.url.includes('engine.html'));
    if (eng) { engineCdp = await connect(eng.webSocketDebuggerUrl); await engineCdp.send('Runtime.enable'); await engineCdp.send('Log.enable'); }
  }
  stage(engineCdp ? 'engine frame found' : 'engine frame NOT found');
  if (CPU && engineCdp) {
    // settings are read when the engine starts → set them, then reload so a fresh engine picks them up
    await engineCdp.send('Runtime.evaluate', { expression: `chrome.storage.local.set(${JSON.stringify(Object.assign({ delegate: 'cpu' }, PRESET))})`, awaitPromise: true });
    engineCdp.ws.close(); engineCdp = null;
    await cdp.send('Page.reload');
    for (let i = 0; i < 80 && !engineCdp; i++) {
      await sleep(250);
      const ts = await getJSON(`http://127.0.0.1:${DBG}/json`);
      const eng = ts.find((t) => t.url.includes('engine.html'));
      if (eng) { engineCdp = await connect(eng.webSocketDebuggerUrl); await engineCdp.send('Runtime.enable'); await engineCdp.send('Log.enable'); }
    }
    stage('reloaded with CPU delegate; engine ' + (engineCdp ? 'found' : 'NOT found'));
  }
  let lastFrames = 0;

  const shot = async (name) => {
    const r = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 640, height: 360, scale: 1 } });
    fs.writeFileSync(path.join(outDir, name), Buffer.from(r.result.data, 'base64'));
  };
  const key = async (action) => {
    const code = { snap: 'KeyS', portal: 'KeyP', repulsor: 'KeyR', thor: 'KeyT', hologram: 'KeyH', entrance: 'KeyE', domain: 'KeyG', arise: 'KeyA' }[action];
    await cdp.send('Runtime.evaluate', { expression: `window.dispatchEvent(new KeyboardEvent('keydown', { code: '${code}', altKey: true, shiftKey: true, bubbles: true }))` });
  };
  const setStorage = async (obj) => {
    const ts = await getJSON(`http://127.0.0.1:${DBG}/json`);
    const engs = ts.filter((t) => t.url.includes('engine.html'));
    const eng = engs[engs.length - 1];
    if (!eng) { stage('setStorage: no engine target'); return; }
    const c = await connect(eng.webSocketDebuggerUrl);
    const r = await c.send('Runtime.evaluate', { expression: `chrome.storage.local.set(${JSON.stringify(obj)}).then(() => chrome.storage.local.get(null))`, awaitPromise: true, returnByValue: true });
    stage('storage now: ' + JSON.stringify(r.result && r.result.result && r.result.result.value));
    c.ws.close();
  };

  let n = 0;
  for (const step of steps) {
    const [ms, action] = step.split(':');
    if (action === 'debug') await setStorage({ debug: true });
    else if (action === 'nodebug') await setStorage({ debug: false });
    else if (action) await key(action);
    await sleep(Number(ms));
    const name = `${String(n++).padStart(2, '0')}_${action || 'idle'}_${ms}.png`;
    stage('shooting ' + name);
    await shot(name);
    const fr = await cdp.send('Runtime.evaluate', { expression: 'window.__frames', returnByValue: true });
    const fv = fr.result && fr.result.result && fr.result.result.value;
    console.log(name, 'frames so far:', fv, ' (+' + (fv - lastFrames) + ')');
    lastFrames = fv;
  }

  const dump = (c, label) => { for (const e of c.events) { if (e.method === 'Runtime.consoleAPICalled') console.log(`[${label}]`, e.params.type, e.params.args.map((a) => a.value !== undefined ? a.value : a.description).join(' ')); if (e.method === 'Runtime.exceptionThrown') console.log(`[${label}] EXCEPTION`, JSON.stringify(e.params.exceptionDetails).slice(0, 600)); if (e.method === 'Log.entryAdded') console.log(`[${label}] log`, e.params.entry.level, e.params.entry.text.slice(0, 300)); } };
  dump(cdp, 'page');
  if (engineCdp) dump(engineCdp, 'engine');
  chrome.kill(); server.kill();
  fs.rmSync(profile, { recursive: true, force: true });
  process.exit(0);
})().catch((e) => { console.error(e); try { require('child_process').execSync('pkill -f "Google Chrome for Testing"; pkill -f test/serve.js'); } catch (_) {} process.exit(1); });
