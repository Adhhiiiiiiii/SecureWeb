// content_protector.js
// Page-context wrapper for camera/mic (getUserMedia) and geolocation.
// Talks to SecureWeb via window.postMessage -> content.js -> background.js.

(function () {
  const ORIGIN = window.location.origin;

  // ---- Generic bridge: ask extension for permission ----
  function securePermissionCheck(kind) {
    return new Promise((resolve) => {
      // If postMessage unavailable (very unlikely), fail CLOSED (block)
      if (!window.postMessage) {
        resolve(false);
        return;
      }

      const requestId = "sw-perm-" + Date.now() + "-" + Math.random().toString(16).slice(2);

      function onMessage(event) {
        if (!event || !event.data) return;
        const data = event.data;
        if (
          data &&
          data.source === "SecureWebExtension" &&
          data.type === "permissionResponse" &&
          data.requestId === requestId
        ) {
          window.removeEventListener("message", onMessage);
          resolve(!!data.allowed);
        }
      }

      window.addEventListener("message", onMessage);

      // Ask content.js, which will talk to background.decidePermission
      window.postMessage(
        {
          source: "SecureWeb",
          type: "permissionCheck",
          requestId,
          kind,
          origin: ORIGIN
        },
        "*"
      );

      // Safety timeout: if extension doesn't respond in time, FAIL CLOSED (block)
      setTimeout(() => {
        window.removeEventListener("message", onMessage);
        resolve(false);
      }, 800); // 0.8s
    });
  }

  // ---- Wrap getUserMedia (camera/mic) ----
  try {
    if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function") {
      const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(
        navigator.mediaDevices
      );

      navigator.mediaDevices.getUserMedia = function (constraints) {
        const kind = "camera-mic";

        return securePermissionCheck(kind).then((allowed) => {
          if (!allowed) {
            // Denied by SecureWeb
            const err = new DOMException(
              "Camera/Microphone access blocked by SecureWeb",
              "NotAllowedError"
            );
            return Promise.reject(err);
          }
          // Allowed -> call original browser API
          return originalGetUserMedia(constraints);
        });
      };
    }
  } catch (e) {
    // fail silently
  }

  // ---- Wrap geolocation (getCurrentPosition / watchPosition) ----
  try {
    if (navigator.geolocation) {
      const originalGeo = navigator.geolocation;
      const originalGetCurrentPosition = originalGeo.getCurrentPosition.bind(originalGeo);
      const originalWatchPosition = originalGeo.watchPosition.bind(originalGeo);

      navigator.geolocation.getCurrentPosition = function (success, error, options) {
        const kind = "geolocation";
        securePermissionCheck(kind).then((allowed) => {
          if (!allowed) {
            if (typeof error === "function") {
              error(
                new DOMException(
                  "Location access blocked by SecureWeb",
                  "NotAllowedError"
                )
              );
            }
            return;
          }
          originalGetCurrentPosition(success, error, options);
        });
      };

      navigator.geolocation.watchPosition = function (success, error, options) {
        const kind = "geolocation";
        return securePermissionCheck(kind).then((allowed) => {
          if (!allowed) {
            if (typeof error === "function") {
              error(
                new DOMException(
                  "Location access blocked by SecureWeb",
                  "NotAllowedError"
                )
              );
            }
            // Return dummy id so app won't crash
            return -1;
          }
          return originalWatchPosition(success, error, options);
        });
      };
    }
  } catch (e) {
    // fail silently
  }
})();
