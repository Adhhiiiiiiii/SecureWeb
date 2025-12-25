// content_protector.js
(function() {
  function toSafeJson(o) { return JSON.stringify(o || {}); }

  function injectProtector(config) {
    const script = document.createElement('script');
    script.setAttribute('data-secureweb', 'protector');
    script.textContent = `// SecureWeb injected protector (page context)
(function(){
  window.__SECUREWEB_CONFIG = ${toSafeJson(config)};

  // allow dynamic updates from content-script
  window.addEventListener('message', function(ev){
    if (ev && ev.data && ev.data.__SECUREWEB_UPDATE) {
      try { window.__SECUREWEB_CONFIG = Object.assign({}, window.__SECUREWEB_CONFIG, ev.data.config || {}); } catch(e) {}
    }
  }, false);

  function isOriginAllowedFor(kind) {
    try {
      const cfg = window.__SECUREWEB_CONFIG || {};
      if (!cfg.globalProtect) return true;
      const origin = location.origin;
      if ((cfg.whitelist || []).includes(origin)) return true;
      const tmap = cfg.temp_allow || {};
      if (tmap[origin] && tmap[origin] > Date.now()) return true;
      // optionally: check roles etc.
      return false;
    } catch(e) { return false; }
  }

  // Media overrides
  try {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = function(constraints) {
        const allowed = isOriginAllowedFor('media');
        if (!allowed) {
          const err = new DOMException('Permission denied by SecureWeb', 'NotAllowedError');
          return Promise.reject(err);
        }
        return origGetUserMedia(constraints);
      };

      const origEnum = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
      navigator.mediaDevices.enumerateDevices = function() {
        const allowed = isOriginAllowedFor('media');
        if (!allowed) return Promise.resolve([]);
        return origEnum();
      };
    }
  } catch(e) { console.error('SecureWeb media override error', e); }

  // Geolocation overrides
  try {
    if (navigator.geolocation) {
      const origGet = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
      const origWatch = navigator.geolocation.watchPosition.bind(navigator.geolocation);
      navigator.geolocation.getCurrentPosition = function(success, error, opts) {
        if (!isOriginAllowedFor('geolocation')) {
          if (typeof error === 'function') {
            try { error({ code: 1, message: 'Permission denied by SecureWeb' }); } catch(e) {}
          }
          return;
        }
        return origGet(success, error, opts);
      };
      navigator.geolocation.watchPosition = function(success, error, opts) {
        if (!isOriginAllowedFor('geolocation')) {
          if (typeof error === 'function') {
            try { error({ code: 1, message: 'Permission denied by SecureWeb' }); } catch(e) {}
          }
          return -1;
        }
        return origWatch(success, error, opts);
      };
    }
  } catch(e) { console.error('SecureWeb geolocation override error', e); }

  window.__SECUREWEB_PROTECTOR = true;
})();`;
    const parent = document.documentElement || document.head || document.body || document;
    parent.insertBefore(script, parent.firstChild);
    setTimeout(()=>{ try{ script.remove(); } catch(e){} }, 60);
  }

  // read extension storage and inject initial config
  chrome.storage.local.get(['privacy_prefs','whitelist','temp_allow','globalProtect','secureweb_roles'], (data) => {
    const cfg = {
      privacy_prefs: data.privacy_prefs || {},
      whitelist: data.whitelist || [],
      temp_allow: data.temp_allow || {},
      globalProtect: (data.globalProtect !== false),
      roles: data.secureweb_roles || {}
    };
    injectProtector(cfg);
  });

  // listen for storage changes and forward to page script via postMessage
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const relevant = {};
    let changed = false;
    ['privacy_prefs','whitelist','temp_allow','globalProtect','secureweb_roles'].forEach(k => {
      if (changes[k]) { relevant[k] = changes[k].newValue; changed = true; }
    });
    if (!changed) return;
    window.postMessage({ __SECUREWEB_UPDATE: true, config: relevant }, '*');
  });

})();
