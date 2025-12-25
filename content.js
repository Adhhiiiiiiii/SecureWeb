// content.js - page-level toasts, permission bridge, download & sensor UI

(function () {
  // ---------- Toast UI ----------
  let toastRoot = null;

  function ensureToastRoot() {
    if (toastRoot && document.body.contains(toastRoot)) return toastRoot;
    toastRoot = document.createElement("div");
    toastRoot.id = "secureweb-toast-root";
    toastRoot.style.position = "fixed";
    toastRoot.style.right = "12px";
    toastRoot.style.bottom = "16px";
    toastRoot.style.zIndex = "2147483647";
    toastRoot.style.display = "flex";
    toastRoot.style.flexDirection = "column";
    toastRoot.style.gap = "6px";
    toastRoot.style.pointerEvents = "none";
    (document.documentElement || document.body).appendChild(toastRoot);
    injectToastStyle();
    return toastRoot;
  }

  function injectToastStyle() {
    if (document.getElementById("secureweb-toast-style")) return;
    const style = document.createElement("style");
    style.id = "secureweb-toast-style";
    style.textContent = `
      .sw-toast {
        min-width: 220px;
        max-width: 320px;
        padding: 8px 10px;
        border-radius: 12px;
        background: rgba(17, 24, 39, 0.96);
        color: #f9fafb;
        font-family: -apple-system, BlinkMacSystemFont, system-ui, "SF Pro Text", sans-serif;
        font-size: 11px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        box-shadow: 0 8px 20px rgba(15, 23, 42, 0.5);
        opacity: 0;
        transform: translateY(6px);
        transition: opacity 160ms ease, transform 160ms ease;
        pointer-events: auto;
      }
      .sw-toast-show {
        opacity: 1;
        transform: translateY(0);
      }
      .sw-toast-title {
        font-weight: 600;
        font-size: 11px;
      }
      .sw-toast-sub {
        font-size: 10px;
        color: #e5e7eb;
      }
      .sw-toast-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-top: 2px;
      }
      .sw-toast-btn {
        border-radius: 999px;
        border: 1px solid rgba(249,250,251,0.4);
        background: transparent;
        color: #e5e7eb;
        font-size: 10px;
        padding: 3px 8px;
        cursor: pointer;
      }
      .sw-toast-btn-primary {
        border-color: #bfdbfe;
        background: #1d4ed8;
        color: #eff6ff;
      }
      .sw-toast-btn:hover {
        background: rgba(31,41,55,0.85);
      }
      .sw-toast-btn-primary:hover {
        background: #1e40af;
      }
    `;
    (document.documentElement || document.head || document.body).appendChild(style);
  }

  function showPageToast(toast) {
    const root = ensureToastRoot();
    const div = document.createElement("div");
    div.className = "sw-toast";

    const title = document.createElement("div");
    title.className = "sw-toast-title";

    const sub = document.createElement("div");
    sub.className = "sw-toast-sub";

    const actionsEl = document.createElement("div");
    actionsEl.className = "sw-toast-actions";

    if (toast.kind === "downloadBlocked") {
      title.textContent = "Download blocked by SecureWeb";
      sub.textContent = `${toast.filename || "File"} from ${toast.origin}`;
      const allowBtn = document.createElement("button");
      allowBtn.className = "sw-toast-btn sw-toast-btn-primary";
      allowBtn.textContent = "Allow once";
      allowBtn.addEventListener("click", () => {
        chrome.runtime.sendMessage(
          { type: "allowBlockedDownload", id: toast.downloadId },
          () => {}
        );
        dismiss();
      });
      actionsEl.appendChild(allowBtn);
    } else if (toast.kind === "permissionBlocked") {
      const permLabel =
        toast.permissionKind === "camera-mic"
          ? "Camera / Microphone"
          : toast.permissionKind === "geolocation"
          ? "Location"
          : toast.permissionKind;

      title.textContent = `${permLabel} access blocked`;
      sub.textContent = `${toast.origin} was prevented from using sensitive sensors.`;

      const tempBtn = document.createElement("button");
      tempBtn.className = "sw-toast-btn sw-toast-btn-primary";
      tempBtn.textContent = "Allow 10 min";
      tempBtn.addEventListener("click", () => {
        chrome.runtime.sendMessage(
          { type: "setTempAllow", origin: toast.origin, minutes: 10 },
          () => {}
        );
        dismiss();
      });

      const wlBtn = document.createElement("button");
      wlBtn.className = "sw-toast-btn";
      wlBtn.textContent = "Whitelist site";
      wlBtn.addEventListener("click", () => {
        chrome.runtime.sendMessage(
          {
            type: "updateSettings",
            payload: { addWhitelistOrigin: toast.origin }
          },
          () => {}
        );
        dismiss();
      });

      actionsEl.appendChild(tempBtn);
      actionsEl.appendChild(wlBtn);
    } else {
      title.textContent = toast.title || "SecureWeb";
      sub.textContent = toast.message || "";
    }

    div.appendChild(title);
    if (sub.textContent) div.appendChild(sub);
    if (actionsEl.children.length > 0) div.appendChild(actionsEl);
    root.appendChild(div);

    function dismiss() {
      div.classList.remove("sw-toast-show");
      setTimeout(() => {
        div.remove();
      }, 180);
    }

    requestAnimationFrame(() => {
      div.classList.add("sw-toast-show");
    });

    setTimeout(
      dismiss,
      toast.kind === "downloadBlocked" ? 7000 : 5000
    );
  }

  // ---------- Listen for messages from background (toasts) ----------
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "showToast" && msg.toast) {
      showPageToast(msg.toast);
    }
  });

  // ---------- Bridge page <-> background for permissions ----------
  window.addEventListener("message", (event) => {
    if (!event || !event.data) return;
    const data = event.data;

    // From page script (content_protector): permissionCheck
    if (data.source === "SecureWeb" && data.type === "permissionCheck") {
      const { kind, origin, requestId } = data;
      chrome.runtime.sendMessage(
        { type: "permissionCheck", kind, origin },
        (res) => {
          const allowed = res && res.allowed;
          window.postMessage(
            {
              source: "SecureWebExtension",
              type: "permissionResponse",
              requestId,
              allowed
            },
            "*"
          );
        }
      );
      return;
    }

    // From page script: direct toast (optional future use)
    if (data.source === "SecureWeb" && data.type === "toast") {
      showPageToast(data.toast || {});
      return;
    }
  });

  // ---------- Inject page-level wrapper (content_protector.js) ----------
  try {
    const s = document.createElement("script");
    s.src = chrome.runtime.getURL("content_protector.js");
    s.type = "text/javascript";
    (document.documentElement || document.head || document.body).appendChild(s);
  } catch (e) {
    // ignore
  }
})();
