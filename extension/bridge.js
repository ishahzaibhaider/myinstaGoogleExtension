// Infinity FX — bridge (extension isolated world).
// The page script (inject.js) cannot touch chrome.* APIs, so this script:
//   1. creates the hidden effects-engine iframe when the page asks for it,
//   2. mirrors a few settings into attributes on <html> that inject.js reads.
(() => {
  const root = document.documentElement;
  const setAttr = (name, v) => { try { root.setAttribute(name, v); } catch (e) {} };

  const apply = (s) => {
    if ('enabled' in s) setAttr('data-infx-enabled', s.enabled === false ? '0' : '1');
    if ('unmirror' in s) setAttr('data-infx-unmirror', s.unmirror ? '1' : '0');
    if ('entrance' in s) setAttr('data-infx-entrance', s.entrance === false ? '0' : '1');
  };

  try {
    chrome.storage.local.get({ enabled: true, unmirror: false, entrance: true }, apply);
    chrome.storage.onChanged.addListener((ch) => {
      const s = {};
      for (const k of Object.keys(ch)) s[k] = ch[k].newValue;
      apply(s);
    });
  } catch (e) { /* extension context gone (reloaded) — nothing to do */ }

  document.addEventListener('infx:need-engine', () => {
    if (document.getElementById('infx-engine-frame')) return;
    let url;
    try { url = chrome.runtime.getURL('engine.html'); } catch (e) { return; }
    const f = document.createElement('iframe');
    f.id = 'infx-engine-frame';
    f.src = url;
    f.setAttribute('aria-hidden', 'true');
    f.tabIndex = -1;
    f.style.cssText =
      'position:fixed!important;width:2px!important;height:2px!important;left:-30px!important;top:-30px!important;' +
      'border:0!important;opacity:0!important;pointer-events:none!important;z-index:-1!important;';
    (document.body || document.documentElement).appendChild(f);
  });
})();
