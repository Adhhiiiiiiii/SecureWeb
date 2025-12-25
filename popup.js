// popup.js - roles, MFA, site risk, stats, downloads, whitelist, export logs, self-destruct, sensors unlock, toasts

document.addEventListener("DOMContentLoaded", () => {
  const protectionToggle = document.getElementById("protectionToggle"); // switch button
  const roleSelect = document.getElementById("roleSelect");
  const modeSelect = document.getElementById("modeSelect");
  const clipboardToggle = document.getElementById("clipboardToggle"); // switch button

  const logsContainer = document.getElementById("logs");
  const blockedDownloadsContainer = document.getElementById("blockedDownloads");
  const adminStatus = document.getElementById("adminStatus");
  const riskBadge = document.getElementById("riskBadge");
  const statsEl = document.getElementById("stats");
  const whitelistContainer = document.getElementById("whitelistContainer");

  const siteOriginEl = document.getElementById("siteOrigin");
  const siteStatusEl = document.getElementById("siteStatus");
  const btnWhitelist = document.getElementById("btnWhitelist");
  const btnTempAllow = document.getElementById("btnTempAllow");
  const btnSelfDestruct = document.getElementById("btnSelfDestruct");
  const btnExportLogs = document.getElementById("btnExportLogs");

  const sensorsStatus = document.getElementById("sensorsStatus");
  const btnUnlockSensors = document.getElementById("btnUnlockSensors");

  const toastContainer = document.getElementById("toastContainer");

  let currentOrigin = null;
  let cachedSettings = null;
  let currentTabId = null;

  // ---------- Toast helper ----------
  function showToast(message, type = "info", durationMs = 2500) {
    if (!toastContainer) return;
    const div = document.createElement("div");
    div.className = `toast toast-${type}`;
    div.textContent = message;
    toastContainer.appendChild(div);

    requestAnimationFrame(() => {
      div.classList.add("toast-show");
    });

    setTimeout(() => {
      div.classList.remove("toast-show");
      setTimeout(() => {
        div.remove();
      }, 160);
    }, durationMs);
  }

  // Helpers for Apple-style switches
  function setSwitch(el, on) {
    if (!el) return;
    if (on) el.classList.add("switch-on");
    else el.classList.remove("switch-on");
  }

  function isSwitchOn(el) {
    return el && el.classList.contains("switch-on");
  }

  function setAdminStatusText(settings) {
    if (settings.role !== "admin") {
      adminStatus.innerHTML = '<span class="pill pill-red">Admin mode OFF</span>';
      return;
    }
    if (settings.adminMfaVerified && Date.now() < (settings.adminMfaExpiry || 0)) {
      adminStatus.innerHTML = '<span class="pill pill-green">Admin mode: MFA VERIFIED</span>';
    } else {
      adminStatus.innerHTML =
        '<span class="pill pill-red">Admin mode: MFA REQUIRED (PIN: 1234 demo)</span>';
    }
  }

  function setRiskBadge(level) {
    riskBadge.className = "risk-badge";
    if (level === "Low") {
      riskBadge.classList.add("risk-low");
    } else if (level === "Medium") {
      riskBadge.classList.add("risk-medium");
    } else if (level === "High") {
      riskBadge.classList.add("risk-high");
    }
    let dot = riskBadge.querySelector(".risk-dot");
    if (!dot) {
      dot = document.createElement("span");
      dot.className = "risk-dot";
      riskBadge.prepend(dot);
    }
    const textSpan = riskBadge.querySelector("span:last-child");
    if (textSpan) textSpan.textContent = `Risk: ${level}`;
  }

  function refreshLogs() {
    chrome.runtime.sendMessage({ type: "getLogs" }, (res) => {
      if (!res || !res.logs) return;
      const logs = res.logs.slice(-50).reverse();
      logsContainer.innerHTML = logs
        .map((log) => {
          const t = new Date(log.time);
          return `
          <div class="log-entry">
            <span class="time">${t.toLocaleTimeString()}</span>
            <span class="type">${log.type.toUpperCase()}</span>
            <span class="msg">${log.message}</span>
          </div>`;
        })
        .join("");
    });
  }

  function refreshBlockedDownloads() {
    chrome.runtime.sendMessage({ type: "getBlockedDownloads" }, (res) => {
      if (!res || !res.blockedDownloads) return;
      const list = res.blockedDownloads.slice().reverse();
      if (list.length === 0) {
        blockedDownloadsContainer.innerHTML =
          `<span style="color:#6b7280;font-size:11px;">None</span>`;
        return;
      }

      blockedDownloadsContainer.innerHTML = list
        .map(
          (d) => `
        <div class="dl-entry">
          <div>${d.filename}</div>
          <div style="color:#6b7280;">${(d.origin || "").slice(0, 40)}</div>
          <button data-dlid="${d.id}">Allow</button>
        </div>`
        )
        .join("");

      blockedDownloadsContainer
        .querySelectorAll("button[data-dlid]")
        .forEach((btn) => {
          btn.addEventListener("click", () => {
            const id = btn.getAttribute("data-dlid");
            chrome.runtime.sendMessage(
              { type: "allowBlockedDownload", id },
              (res2) => {
                if (!res2 || !res2.ok) {
                  showToast(
                    "Failed to allow download: " + (res2 && res2.error),
                    "error"
                  );
                } else {
                  showToast("Download allowed.", "success");
                }
                refreshBlockedDownloads();
              }
            );
          });
        });
    });
  }

  function refreshStats() {
    chrome.runtime.sendMessage({ type: "getStats" }, (res) => {
      if (!res || !res.stats) return;
      const s = res.stats;
      statsEl.innerHTML = `
        <div><span class="stats-label">Date:</span> <span class="stats-value">${s.date}</span></div>
        <div><span class="stats-label">Threats blocked:</span> <span class="stats-value">${s.threatsBlocked}</span></div>
        <div><span class="stats-label">Downloads blocked:</span> <span class="stats-value">${s.downloadsBlocked}</span></div>
        <div><span class="stats-label">Permissions blocked:</span> <span class="stats-value">${s.permissionsBlocked}</span></div>
        <div><span class="stats-label">Permissions allowed:</span> <span class="stats-value">${s.permissionsAllowed}</span></div>
      `;
    });
  }

  function updateSiteStatus() {
    if (!currentOrigin || !cachedSettings) {
      siteStatusEl.textContent = "";
      return;
    }
    const wl = cachedSettings.whitelist || [];
    const isWhitelisted = wl.includes(currentOrigin);

    chrome.runtime.sendMessage(
      { type: "queryTempAllow", origin: currentOrigin },
      (res) => {
        const tempAllowed = res && res.allowed;
        let parts = [];
        if (isWhitelisted) parts.push("Whitelisted");
        if (tempAllowed) parts.push("Temporary allow active");
        if (!isWhitelisted && !tempAllowed) parts.push("Restricted by default");

        siteStatusEl.textContent = parts.join(" | ");
      }
    );
  }

  function refreshSiteRisk() {
    if (!currentOrigin) return;
    chrome.runtime.sendMessage({ type: "getSiteRisk", origin: currentOrigin }, (res) => {
      if (!res) return;
      const { level } = res;
      setRiskBadge(level);
      if (currentTabId != null) {
        chrome.action.setBadgeText({
          tabId: currentTabId,
          text: level === "High" ? "H" : level === "Medium" ? "M" : ""
        });
        chrome.action.setBadgeBackgroundColor({
          tabId: currentTabId,
          color: level === "High" ? "#b91c1c" : "#92400e"
        });
      }
    });
  }

  function updateSensorsStatus() {
    if (!cachedSettings) {
      sensorsStatus.textContent = "Locked by default.";
      sensorsStatus.classList.remove("sensors-ok");
      sensorsStatus.classList.add("sensors-locked");
      return;
    }
    const until = cachedSettings.sensorsUnlockedUntil || 0;
    const now = Date.now();
    if (until && now < until) {
      const minutesLeft = Math.max(1, Math.round((until - now) / 60000));
      sensorsStatus.textContent = `Sensors UNLOCKED for ~${minutesLeft} more minute(s).`;
      sensorsStatus.classList.remove("sensors-locked");
      sensorsStatus.classList.add("sensors-ok");
    } else {
      sensorsStatus.textContent = "Sensors LOCKED. Access requires Admin + MFA.";
      sensorsStatus.classList.remove("sensors-ok");
      sensorsStatus.classList.add("sensors-locked");
    }
  }

  function renderWhitelist() {
    if (!whitelistContainer || !cachedSettings) return;
    const wl = cachedSettings.whitelist || [];
    if (!wl.length) {
      whitelistContainer.innerHTML =
        '<span style="font-size:11px;color:#9ca3af;">No trusted sites added yet.</span>';
      return;
    }
    whitelistContainer.innerHTML = wl
      .map(
        (origin) => `
      <div class="wl-row">
        <span class="wl-origin">${origin}</span>
        <button class="wl-remove" data-origin="${origin}">Remove</button>
      </div>`
      )
      .join("");

    whitelistContainer.querySelectorAll(".wl-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        const origin = btn.getAttribute("data-origin");
        const currentList = cachedSettings.whitelist || [];
        const newList = currentList.filter((o) => o !== origin);
        chrome.runtime.sendMessage(
          {
            type: "updateSettings",
            payload: { whitelist: newList }
          },
          (res) => {
            if (res && res.ok && res.settings) {
              cachedSettings = res.settings;
              renderWhitelist();
              updateSiteStatus();
              showToast("Removed from whitelist.", "info");
            }
          }
        );
      });
    });
  }

  // Get current tab origin
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || !tab.url) {
      siteOriginEl.textContent = "Unable to detect current site.";
      return;
    }
    currentTabId = tab.id;
    try {
      const u = new URL(tab.url);
      currentOrigin = u.origin;
      siteOriginEl.textContent = currentOrigin;
      updateSiteStatus();
      refreshSiteRisk();
    } catch (e) {
      siteOriginEl.textContent = "Invalid URL";
    }
  });

  // Load settings
  chrome.runtime.sendMessage({ type: "getSettings" }, (res) => {
    if (!res || !res.settings) return;
    const { settings } = res;
    cachedSettings = settings;

    setSwitch(protectionToggle, !!settings.protectionEnabled);
    if (settings.role) {
      roleSelect.value = settings.role;
    }
    if (settings.mode) {
      modeSelect.value = settings.mode;
    }
    setSwitch(clipboardToggle, !!settings.clipboardProtectionEnabled);

    setAdminStatusText(settings);
    updateSiteStatus();
    updateSensorsStatus();
    renderWhitelist();
  });

  refreshLogs();
  refreshBlockedDownloads();
  refreshStats();

  // Protection toggle
  protectionToggle.addEventListener("click", () => {
    const newState = !isSwitchOn(protectionToggle);
    setSwitch(protectionToggle, newState);
    chrome.runtime.sendMessage(
      {
        type: "updateSettings",
        payload: { protectionEnabled: newState }
      },
      (res) => {
        if (res && res.settings) cachedSettings = res.settings;
        showToast(
          `Protection ${newState ? "enabled" : "disabled"}.`,
          newState ? "success" : "info"
        );
      }
    );
  });

  // Clipboard toggle
  clipboardToggle.addEventListener("click", () => {
    const newState = !isSwitchOn(clipboardToggle);
    setSwitch(clipboardToggle, newState);
    chrome.runtime.sendMessage(
      {
        type: "updateSettings",
        payload: { clipboardProtectionEnabled: newState }
      },
      (res) => {
        if (res && res.settings) cachedSettings = res.settings;
        showToast(
          `Clipboard protection ${newState ? "enabled" : "disabled"}.`,
          newState ? "success" : "info"
        );
      }
    );
  });

  // Role change & MFA
  roleSelect.addEventListener("change", () => {
    const newRole = roleSelect.value;

    if (newRole === "admin") {
      const pin = prompt("Enter Admin MFA PIN (demo: 1234):");
      if (!pin) {
        roleSelect.value = "user";
        chrome.runtime.sendMessage({
          type: "updateSettings",
          payload: { role: "user", adminMfaVerified: false, adminMfaExpiry: 0 }
        });
        return;
      }

      chrome.runtime.sendMessage(
        {
          type: "mfaVerify",
          pin
        },
        (res) => {
          if (!res || !res.ok) {
            showToast("MFA failed: " + (res && res.error ? res.error : ""), "error");
            roleSelect.value = "user";
            chrome.runtime.sendMessage({
              type: "updateSettings",
              payload: { role: "user", adminMfaVerified: false, adminMfaExpiry: 0 }
            });
          } else {
            showToast("Admin MFA verified.", "success");
            chrome.runtime.sendMessage(
              {
                type: "updateSettings",
                payload: { role: "admin" }
              },
              () => {
                chrome.runtime.sendMessage({ type: "getSettings" }, (res3) => {
                  if (res3 && res3.settings) {
                    cachedSettings = res3.settings;
                    setAdminStatusText(res3.settings);
                  }
                });
              }
            );
          }
        }
      );
    } else {
      chrome.runtime.sendMessage(
        {
          type: "updateSettings",
          payload: {
            role: newRole,
            adminMfaVerified: false,
            adminMfaExpiry: 0
          }
        },
        () => {
          chrome.runtime.sendMessage({ type: "getSettings" }, (res3) => {
            if (res3 && res3.settings) {
              cachedSettings = res3.settings;
              setAdminStatusText(res3.settings);
            }
          });
        }
      );
    }
  });

  // Mode change
  modeSelect.addEventListener("change", () => {
    const mode = modeSelect.value;
    chrome.runtime.sendMessage(
      {
        type: "updateSettings",
        payload: { mode }
      },
      (res) => {
        if (res && res.settings) cachedSettings = res.settings;
        showToast(`Mode set to "${mode}".`, "info");
      }
    );
  });

  // Site Allow Buttons
  btnWhitelist.addEventListener("click", () => {
    if (!currentOrigin) {
      showToast("No valid site detected.", "error");
      return;
    }
    if (!cachedSettings) cachedSettings = {};
    const wl = cachedSettings.whitelist || [];
    if (wl.includes(currentOrigin)) {
      showToast("This site is already whitelisted.", "info");
      return;
    }
    const newWhitelist = wl.concat([currentOrigin]);

    chrome.runtime.sendMessage(
      {
        type: "updateSettings",
        payload: { whitelist: newWhitelist }
      },
      (res) => {
        if (res && res.ok && res.settings) {
          cachedSettings = res.settings;
          updateSiteStatus();
          renderWhitelist();
          showToast("Site added to whitelist.", "success");
        }
      }
    );
  });

  btnTempAllow.addEventListener("click", () => {
    if (!currentOrigin) {
      showToast("No valid site detected.", "error");
      return;
    }
    chrome.runtime.sendMessage(
      {
        type: "setTempAllow",
        origin: currentOrigin,
        minutes: 10
      },
      (res) => {
        if (res && res.ok) {
          updateSiteStatus();
          showToast("Site temporarily allowed for 10 minutes.", "success");
        }
      }
    );
  });

  // Self-Destruct
  btnSelfDestruct.addEventListener("click", () => {
    if (
      !confirm(
        "Self-Destruct will clear temporary permissions, sensors unlock and admin MFA. Logs and whitelist are preserved. Continue?"
      )
    ) {
      return;
    }
    chrome.runtime.sendMessage({ type: "selfDestruct" }, (res) => {
      if (res && res.ok) {
        showToast("Self-Destruct executed.", "info");
        chrome.runtime.sendMessage({ type: "getSettings" }, (res3) => {
          if (res3 && res3.settings) {
            cachedSettings = res3.settings;
            setAdminStatusText(res3.settings);
            updateSiteStatus();
            updateSensorsStatus();
            setSwitch(protectionToggle, !!res3.settings.protectionEnabled);
            setSwitch(clipboardToggle, !!res3.settings.clipboardProtectionEnabled);
            // whitelist remains intact
            renderWhitelist();
          }
        });
      }
    });
  });

  // Export Logs (JSON)
  btnExportLogs.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "getLogs" }, (res) => {
      if (!res || !res.logs || res.logs.length === 0) {
        showToast("No logs to export.", "info");
        return;
      }
      const dataStr = JSON.stringify(res.logs, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      chrome.downloads.download(
        {
          url,
          filename: "secureweb-logs.json",
          saveAs: true
        },
        () => {
          URL.revokeObjectURL(url);
          showToast("Logs exported.", "success");
        }
      );
    });
  });

  // Unlock Sensors button logic
  btnUnlockSensors.addEventListener("click", () => {
    if (!cachedSettings) {
      showToast("Settings not loaded yet. Please try again.", "error");
      return;
    }

    if (cachedSettings.role !== "admin") {
      showToast("Only Admin can unlock sensors. Switch role to Admin.", "error");
      return;
    }

    const now = Date.now();
    const mfaActive =
      cachedSettings.adminMfaVerified && now < (cachedSettings.adminMfaExpiry || 0);

    function doUnlock() {
      chrome.runtime.sendMessage(
        { type: "unlockSensors", minutes: 15 },
        (res) => {
          if (!res || !res.ok) {
            showToast("Failed to unlock sensors: " + (res && res.error), "error");
            return;
          }
          chrome.runtime.sendMessage({ type: "getSettings" }, (res2) => {
            if (res2 && res2.settings) {
              cachedSettings = res2.settings;
              updateSensorsStatus();
              showToast("Sensors unlocked for 15 minutes.", "success");
            }
          });
        }
      );
    }

    if (!mfaActive) {
      const pin = prompt("Confirm Admin MFA (Windows Hello / PIN demo: 1234):");
      if (!pin) return;

      chrome.runtime.sendMessage({ type: "mfaVerify", pin }, (res) => {
        if (!res || !res.ok) {
          showToast("MFA verification failed: " + (res && res.error), "error");
          return;
        }
        chrome.runtime.sendMessage({ type: "getSettings" }, (res2) => {
          if (res2 && res2.settings) {
            cachedSettings = res2.settings;
            setAdminStatusText(cachedSettings);
          }
          doUnlock();
        });
      });
    } else {
      doUnlock();
    }
  });
});
