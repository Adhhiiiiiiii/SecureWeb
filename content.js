// content.js - page-level protections & cloaker (runs document_start)

(function() {
  const SUSPICIOUS_PATTERNS = [
    /eval\s*\(/i,
    /new Function/i,
    /atob\(/i,
    /document\.write\(/i,
    /unescape\(/i,
    /window\.location\.href\s*=/i
  ];

  function sendLog(message, details = {}) {
    try { chrome.runtime.sendMessage({ type: "LOG", message, details }); } catch(e) {}
  }

  // scan inline script content
  function scanInlineScripts() {
    try {
      const scripts = document.querySelectorAll("script:not([src])");
      scripts.forEach(s => {
        const txt = s.textContent || "";
        for (const pat of SUSPICIOUS_PATTERNS) {
          if (pat.test(txt)) {
            sendLog("Suspicious inline script", { pattern: pat.toString(), url: location.href });
            // mark visually (for testing)
            s.style.outline = "2px dashed orange";
          }
        }
      });
    } catch(e) { sendLog("scanInlineScripts error", { e: e.toString() }); }
  }

  // detect fake login forms (basic heuristic)
  function detectFakeLoginForms() {
    try {
      const forms = document.querySelectorAll("form");
      forms.forEach(f => {
        const inputs = f.querySelectorAll("input[type=password], input[name*=pass], input[id*=pass]");
        if (inputs.length > 0) {
          const action = f.getAttribute("action") || location.href;
          let aOrigin = "";
          try { aOrigin = new URL(action, location.href).origin; } catch(e) { aOrigin = location.origin; }
          if (aOrigin !== location.origin) {
            sendLog("Potential phishing form", { action: aOrigin, page: location.href });
            f.style.border = "3px solid orange";
            const warn = document.createElement("div");
            warn.textContent = "Warning: form posts to a different origin.";
            warn.style.background = "#ffebcc";
            warn.style.padding = "6px";
            warn.style.marginBottom = "6px";
            f.prepend(warn);
          }
        }
      });
    } catch(e) { sendLog("detectFakeLoginForms error", { e: e.toString() }); }
  }

  // DOM mutation observer to detect runtime injection
  const observer = new MutationObserver(muts => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.nodeType === Node.ELEMENT_NODE) {
          if (n.tagName === "SCRIPT" || (n.querySelector && n.querySelector("script"))) {
            sendLog("Dynamic script injection detected", { url: location.href });
            // optionally remove suspicious script in prototype:
            // n.remove();
          }
          if (n.tagName === "IFRAME") {
            sendLog("Iframe added", { src: n.src || "inline", url: location.href });
          }
        }
      }
    }
  });
  try { observer.observe(document.documentElement || document, { childList: true, subtree: true }); } catch(e){}

  // fingerprint cloaker - canvas noise + simple WebRTC override
  function injectCloaker() {
    try {
      // Canvas cloaking: add tiny noise before toDataURL/toBlob
      const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function() {
        try {
          const ctx = this.getContext && this.getContext("2d");
          if (ctx) {
            const w = Math.max(1, this.width|0), h = Math.max(1, this.height|0);
            try {
              const imageData = ctx.getImageData(0,0,Math.min(64,w), Math.min(64,h));
              for (let i=0;i<imageData.data.length;i+=4) {
                imageData.data[i] = (imageData.data[i] + (Math.random()*2-1))|0;
              }
              ctx.putImageData(imageData,0,0);
            } catch(e) { /* ignore CORS */ }
          }
        } catch(e){}
        return origToDataURL.apply(this, arguments);
      };

      // WebRTC basic wrapper to prevent accidental IP leaks - stubbed for prototype
      if (window.RTCPeerConnection) {
        const Orig = window.RTCPeerConnection;
        window.RTCPeerConnection = function(...args) {
          const pc = new Orig(...args);
          // override createOffer to attach no-trickle or other controls if needed
          const origCreateOffer = pc.createOffer;
          pc.createOffer = function(...a) {
            sendLog("RTCPeerConnection.createOffer called", {});
            return origCreateOffer.apply(this, a);
          };
          return pc;
        };
        window.RTCPeerConnection.prototype = Orig.prototype;
      }

    } catch(e){ sendLog("injectCloaker failed", { e:e.toString() }); }
  }

  // clipboard listeners (log only)
  function protectClipboard() {
    document.addEventListener("copy", () => sendLog("copy event"), true);
    document.addEventListener("paste", () => sendLog("paste event"), true);
  }

  // initial run
  try {
    injectCloaker();
    scanInlineScripts();
    detectFakeLoginForms();
    protectClipboard();
    window.addEventListener("load", () => {
      scanInlineScripts();
      detectFakeLoginForms();
    });
  } catch(e) { sendLog("content init error", { e: e.toString() }); }

})();
