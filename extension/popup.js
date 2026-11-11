const DEFAULTS = {
  enabled: true, snap: true, portal: true, repulsor: true, thor: true, hologram: true,
  entrance: true, sensitivity: 'normal', unmirror: false, debug: false,
  portalDest: 'shanghai', destImage: null, domain: true, arise: true,
};
const $ = (id) => document.getElementById(id);
const TOGGLES = ['enabled', 'snap', 'portal', 'repulsor', 'thor', 'hologram', 'domain', 'arise', 'entrance', 'unmirror', 'debug'];

chrome.storage.local.get(DEFAULTS, (s) => {
  for (const k of TOGGLES) {
    $(k).checked = !!s[k];
    $(k).addEventListener('change', () => {
      chrome.storage.local.set({ [k]: $(k).checked });
      if (k === 'enabled') $('rejoin').style.display = 'block';
    });
  }
  $('sensitivity').value = s.sensitivity;
  $('sensitivity').addEventListener('change', () => chrome.storage.local.set({ sensitivity: $('sensitivity').value }));
});

// ---- portal destination
const NOTES = { shanghai: 'Shanghai skyline at night', custom: 'Your picture', mirror: 'Kaleidoscope of your own room' };
async function pickImage() {
  return new Promise((resolve) => {
    const input = $('destFile');
    input.onchange = async () => {
      const f = input.files[0];
      if (!f) return resolve(null);
      const bmp = await createImageBitmap(f);
      const k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.88));
    };
    input.click();
  });
}
chrome.storage.local.get(DEFAULTS, (s) => {
  const sel = $('portalDest');
  sel.value = s.portalDest === 'custom' && !s.destImage ? 'shanghai' : s.portalDest;
  $('destNote').textContent = NOTES[sel.value];
  sel.addEventListener('change', async () => {
    if (sel.value === 'custom') {
      const url = await pickImage();
      if (!url) { const cur = await chrome.storage.local.get(DEFAULTS); sel.value = cur.portalDest; return; }
      await chrome.storage.local.set({ destImage: url });
    }
    chrome.storage.local.set({ portalDest: sel.value });
    $('destNote').textContent = NOTES[sel.value];
  });
});

// ---- saved empty room
function showRoom(saved) {
  $('roomNote').textContent = saved ? 'Saved ✓ — the spot behind you is your real room' : 'Step out of frame for 3 s and it saves your room';
  $('forgetRoom').disabled = !saved;
}
chrome.storage.local.get({ roomPlate: null }, (s) => showRoom(!!s.roomPlate));
chrome.storage.onChanged.addListener((ch) => { if (ch.roomPlate) showRoom(!!ch.roomPlate.newValue); });
$('forgetRoom').addEventListener('click', () => chrome.storage.local.set({ roomPlate: null }));
