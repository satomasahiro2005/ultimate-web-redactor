/* 拡張の外で popup.html を動かすための最低限の chrome スタブ。
   本物と同じく storage のコールバックは非同期にする。 */
(() => {
  const KEY = 'uwr-shim-store';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (_) { return {}; } };
  const write = (o) => localStorage.setItem(KEY, JSON.stringify(o));

  window.chrome = {
    runtime: {
      lastError: null,
      id: 'shim',
      sendMessage: (msg, cb) => { console.log('[shim] sendMessage', msg); if (cb) setTimeout(() => cb({ ok: true }), 0); },
      onMessage: { addListener: () => {} }
    },
    storage: {
      local: {
        get: (defaults, cb) => {
          const stored = read();
          const out = {};
          for (const [k, v] of Object.entries(defaults)) out[k] = k in stored ? stored[k] : v;
          setTimeout(() => cb(out), 0);
        },
        set: (patch, cb) => { write({ ...read(), ...patch }); if (cb) setTimeout(cb, 0); }
      },
      onChanged: { addListener: () => {} }
    },
    i18n: {
      getMessage: (k) => (window.__shimMessages && window.__shimMessages[k] &&
                          window.__shimMessages[k].message) || ''
    }
  };
})();
