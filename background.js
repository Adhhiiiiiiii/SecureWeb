// background.js - SecureWeb Privacy Access Management
// Roles, MFA, Risk, Stats, Sensors Unlock, Toasts, Dynamic Badge

let logs = [];
let blockedDownloads = [];
let siteStats = {}; // siteStats[origin] = { suspiciousScripts, phishingForms, blockedDownloads }

let stats = {
  date: null,
  threatsBlocked: 0,
  downloadsBlocked: 0,
  permissionsBlocked: 0,
  permissionsAllowed: 0
};

let settings = {
  protectionEnabled: true,
  role: "user", // guest | user | admin
  mode: "normal", // normal | work | safe
  whitelist: [],
  tempAllow: {}, // { origin: expiryTimestamp }
  adminMfaVerified: false,
  adminMfaExpiry: 0,
  clipboardProtectionEnabled: false,
  sensorsUnlockedUntil: 0
};

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function ensureTodayStats() {
  const t = todayString();
  if (stats.date !== t) {
    stats = {
      date: t,
      threatsBlocked: 0,
      downloadsBlocked: 0,
      permissionsBlocked: 0,
      permissionsAllowed: 0
    };
  }
}

function getSiteStats(origin) {
  if (!siteStats[origin]) {
    siteStats[origin] = {
      suspiciousScripts: 0,
      phishingForms: 0,
      blockedDownloads: 0
    };
  }
  return siteStats[origin];
}

function computeRiskLevel(origin) {
  const s = getSiteStats(origin);
  let score = 0;
  score += Math.min(s.suspiciousScripts * 2, 6);
  if (s.phishingForms > 0) score += 5;
  score += Math.min(s.blockedDownloads * 3, 9);

  let level = "Low";
  if (score >= 4 && score <= 7) level = "Medium";
  if (score >= 8) level = "High";
  return { score, level, s };
}

function setBadgeForOriginOnTabs(origin) {
  if (!origin) return;
  const { level } = computeRiskLevel(origin);
  const text =
    level === "High" ? "H" : level === "Medium" ? "M" : "";
  const color =
    level === "High" ? "#b91c1c" : level === "Medium" ? "#92400e" : [0, 0, 0, 0];

  const pattern = origin + "/*";
  chrome.tabs.query({ url: pattern }, (tabs) => {
    if (!tabs) return;
    tabs.forEach((tab) => {
      chrome.action.setBadgeText({ tabId: tab.id, text });
      if (text) {
        chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color });
      }
    });
  });
}

function updateBadgeForTab(tabId, url) {
  if (!url) return;
  let origin;
  try {
    origin = new URL(url).origin;
  } catch {
    return;
  }
  const { level } = computeRiskLevel(origin);
  const text =
    level === "High" ? "H" : level === "Medium" ? "M" : "";
  const color =
    level === "High" ? "#b91c1c" : level === "Medium" ? "#92400e" : [0, 0, 0, 0];

  chrome.action.setBadgeText({ tabId, text });
  if (text) chrome.action.setBadgeBackgroundColor({ tabId, color });
}

// Dynamic badge on navigation / tab switch
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    updateBadgeForTab(tabId, tab.url);
  }
});

chrome.tabs.onActivated.addListener((info) => {
  chrome.tabs.get(info.tabId, (tab) => {
    if (tab && tab.url) {
      updateBadgeForTab(info.tabId, tab.url);
    }
  });
});

function logEvent(type, message, details = {}) {
  ensureTodayStats();

  const entry = {
    id: Date.now() + Math.random().toString(16).slice(2),
    time: new Date().toISOString(),
    type,
    message,
    details
  };
  logs.push(entry);

  if (type === "threat") {
    stats.threatsBlocked++;
  }

  if (logs.length > 500) logs = logs.slice(-500);

  chrome.storage.local.set({ logs, stats });

  if (type === "alert" || type === "threat") {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon48.png",
      title: "SecureWeb Alert",
      message
    });
  }
}

function loadState() {
  chrome.storage.local.get(
    ["settings", "logs", "blockedDownloads", "siteStats", "stats"],
    (data) => {
      if (data.settings) settings = data.settings;
      if (data.logs) logs = data.logs;
      if (data.blockedDownloads) blockedDownloads = data.blockedDownloads;
      if (data.siteStats) siteStats = data.siteStats;
      if (data.stats) stats = data.stats;
      ensureTodayStats();
    }
  );
}

chrome.runtime.onInstalled.addListener(loadState);
chrome.runtime.onStartup.addListener(loadState);

// Helpers
function isTempAllowed(origin) {
  const now = Date.now();
  const expiry = settings.tempAllow[origin];
  return !!expiry && expiry > now;
}

function isAdminMfaActive() {
  if (!settings.adminMfaVerified) return false;
  const now = Date.now();
  return now < settings.adminMfaExpiry;
}

function areSensorsUnlocked() {
  const now = Date.now();
  return !!settings.sensorsUnlockedUntil && now < settings.sensorsUnlockedUntil;
}

// ---------- TOAST BROADCAST ----------
function broadcastToastForOrigin(origin, toastData) {
  if (!origin) return;
  const pattern = origin + "/*";
  chrome.tabs.query({ url: pattern }, (tabs) => {
    if (!tabs || !tabs.length) return;
    tabs.forEach((tab) => {
      chrome.tabs.sendMessage(tab.id, {
        type: "showToast",
        toast: toastData
      });
    });
  });
}

// ---------- PERMISSION DECISION LOGIC (FULLY LOGGED) ----------
function decidePermission(kind, origin) {
  ensureTodayStats();

  // Protection off → allow but log as info
  if (!settings.protectionEnabled) {
    stats.permissionsAllowed++;
    chrome.storage.local.set({ stats });
    logEvent("info", `Protection OFF: allowed ${kind}`, { origin });
    return true;
  }

  // Whitelist / temp allow override
  if (settings.whitelist.includes(origin) || isTempAllowed(origin)) {
    stats.permissionsAllowed++;
    chrome.storage.local.set({ stats });
    logEvent("info", `Allowed ${kind} for whitelisted/temp-allowed site`, { origin });
    return true;
  }

  // Global sensors unlock window
  if (
    areSensorsUnlocked() &&
    (kind === "camera-mic" || kind === "geolocation")
  ) {
    stats.permissionsAllowed++;
    chrome.storage.local.set({ stats });
    logEvent("info", `Sensors unlock: auto-allow ${kind}`, {
      origin,
      until: new Date(settings.sensorsUnlockedUntil).toISOString()
    });
    return true;
  }

  // Admin mode + MFA → more permissive
  if (settings.role === "admin" && isAdminMfaActive()) {
    stats.permissionsAllowed++;
    chrome.storage.local.set({ stats });
    logEvent("info", `Admin MFA active: allowed ${kind}`, { origin });
    return true;
  }

  // Guest strict → always block sensors
  if (settings.role === "guest") {
    stats.permissionsBlocked++;
    chrome.storage.local.set({ stats });
    logEvent(
      "threat",
      `Guest mode: blocked ${kind} for ${origin}`,
      { origin }
    );

    if (kind === "camera-mic" || kind === "geolocation") {
      broadcastToastForOrigin(origin, {
        kind: "permissionBlocked",
        origin,
        permissionKind: kind,
        reason: "guest"
      });
    }
    return false;
  }

  // User default: block unless trusted
  stats.permissionsBlocked++;
  chrome.storage.local.set({ stats });
  logEvent(
    "threat",
    `Blocked ${kind} for ${origin}. User can whitelist or temp-allow.`,
    { origin }
  );

  if (kind === "camera-mic" || kind === "geolocation") {
    broadcastToastForOrigin(origin, {
      kind: "permissionBlocked",
      origin,
      permissionKind: kind,
      reason: "default"
    });
  }

  return false;
}

// ---------- MESSAGE HANDLER ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // From content/behavior: log event
  if (msg.type === "log") {
    logEvent(msg.level || "info", msg.message, msg.details);
    sendResponse({ ok: true });
    return;
  }

  // Update per-site stats
  if (msg.type === "siteStatUpdate") {
    const { origin, deltaSuspicious, deltaPhishing } = msg;
    const s = getSiteStats(origin);
    if (deltaSuspicious) s.suspiciousScripts += deltaSuspicious;
    if (deltaPhishing) s.phishingForms += deltaPhishing;
    chrome.storage.local.set({ siteStats });
    logEvent("info", "Site stats updated", {
      origin,
      suspiciousScripts: s.suspiciousScripts,
      phishingForms: s.phishingForms
    });
    setBadgeForOriginOnTabs(origin);
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === "getSettings") {
    sendResponse({ settings });
    return;
  }

  if (msg.type === "updateSettings") {
    const payload = msg.payload || {};

    // Support addWhitelistOrigin from page toast
    if (payload.addWhitelistOrigin) {
      const origin = payload.addWhitelistOrigin;
      if (!settings.whitelist.includes(origin)) {
        settings.whitelist.push(origin);
        logEvent("info", "Origin added to whitelist", { origin });
      }
      delete payload.addWhitelistOrigin;
    }

    if (payload.role && payload.role !== settings.role) {
      if (payload.role !== "admin") {
        settings.adminMfaVerified = false;
        settings.adminMfaExpiry = 0;
      }
      logEvent("info", `Role changed to ${payload.role}`, {});
    }

    if (payload.mode && payload.mode !== settings.mode) {
      logEvent("info", `Mode changed to ${payload.mode}`, {});
    }

    settings = { ...settings, ...payload };
    chrome.storage.local.set({ settings });
    sendResponse({ ok: true, settings });
    return;
  }

  if (msg.type === "getLogs") {
    sendResponse({ logs });
    return;
  }

  if (msg.type === "queryTempAllow") {
    const { origin } = msg;
    sendResponse({ allowed: isTempAllowed(origin) });
    return;
  }

  if (msg.type === "setTempAllow") {
    const { origin, minutes } = msg;
    const expireAt = Date.now() + minutes * 60 * 1000;
    settings.tempAllow[origin] = expireAt;
    chrome.storage.local.set({ settings });
    logEvent("info", `Temporary allow granted`, { origin, minutes });
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === "mfaVerify") {
    const { pin } = msg;
    const correctPin = "1234"; // demo only

    if (pin === correctPin) {
      settings.adminMfaVerified = true;
      settings.adminMfaExpiry = Date.now() + 30 * 60 * 1000;
      chrome.storage.local.set({ settings });
      logEvent("info", "Admin MFA verified", {});
      sendResponse({ ok: true });
    } else {
      settings.adminMfaVerified = false;
      settings.adminMfaExpiry = 0;
      chrome.storage.local.set({ settings });
      logEvent("alert", "Admin MFA failed", {});
      sendResponse({ ok: false, error: "Invalid PIN" });
    }
    return;
  }

  if (msg.type === "unlockSensors") {
    const { minutes } = msg;

    if (settings.role !== "admin" || !isAdminMfaActive()) {
      sendResponse({ ok: false, error: "Admin MFA not active" });
      return;
    }

    const durationMs = (minutes || 15) * 60 * 1000;
    settings.sensorsUnlockedUntil = Date.now() + durationMs;
    chrome.storage.local.set({ settings });
    logEvent("info", "Sensors unlocked for limited time", {
      minutes: minutes || 15,
      until: new Date(settings.sensorsUnlockedUntil).toISOString()
    });
    sendResponse({ ok: true, until: settings.sensorsUnlockedUntil });
    return;
  }

  if (msg.type === "permissionCheck") {
    const { kind, origin } = msg;
    const allowed = decidePermission(kind, origin);
    sendResponse({ allowed });
    return;
  }

  if (msg.type === "getBlockedDownloads") {
    sendResponse({ blockedDownloads });
    return;
  }

  if (msg.type === "allowBlockedDownload") {
    const { id } = msg;
    const idx = blockedDownloads.findIndex((d) => d.id === id);
    if (idx === -1) {
      sendResponse({ ok: false, error: "Not found" });
      return;
    }

    const item = blockedDownloads[idx];
    chrome.downloads.download(
      {
        url: item.url,
        filename: item.filename,
        conflictAction: "uniquify"
      },
      (newId) => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          logEvent("info", "Manually allowed download", {
            url: item.url,
            newDownloadId: newId
          });
          blockedDownloads.splice(idx, 1);
          chrome.storage.local.set({ blockedDownloads });
          setBadgeForOriginOnTabs(item.origin);
          sendResponse({ ok: true });
        }
      }
    );
    return true;
  }

  if (msg.type === "getSiteRisk") {
    const { origin } = msg;
    const risk = computeRiskLevel(origin);
    sendResponse(risk);
    return;
  }

  if (msg.type === "getStats") {
    ensureTodayStats();
    sendResponse({ stats });
    return;
  }

  if (msg.type === "selfDestruct") {
    settings.tempAllow = {};
    settings.adminMfaVerified = false;
    settings.adminMfaExpiry = 0;
    settings.sensorsUnlockedUntil = 0;
    chrome.storage.local.set({ settings });

    siteStats = {};
    chrome.storage.local.set({ siteStats });

    logEvent("info", "Self-destruct executed", {});
    sendResponse({ ok: true });
    return;
  }

  sendResponse({ ok: false, error: "Unknown message type" });
});

// ---------- DOWNLOAD BLOCKING + LOGGING + BADGE ----------
chrome.downloads.onCreated.addListener((downloadItem) => {
  ensureTodayStats();

  if (!settings.protectionEnabled) return;

  // Always allow extension's own downloads (e.g., export logs)
  if (downloadItem.byExtensionId === chrome.runtime.id) {
    return;
  }

  const url = downloadItem.finalUrl || downloadItem.url || "";
  if (!url) return;

  let origin;
  try {
    origin = new URL(url).origin;
  } catch {
    origin = null;
  }

  const s = origin ? getSiteStats(origin) : null;

  // Admin + MFA => allow
  if (settings.role === "admin" && isAdminMfaActive()) {
    logEvent("info", "Admin mode: allowed download", { url, origin });
    return;
  }

  if (origin && (settings.whitelist.includes(origin) || isTempAllowed(origin))) {
    logEvent("info", "Allowed download from trusted origin", { url, origin });
    return;
  }

  // Block by default
  chrome.downloads.cancel(downloadItem.id, () => {
    const blocked = {
      id: Date.now() + Math.random().toString(16).slice(2),
      url,
      filename: downloadItem.filename || downloadItem.suggestedFilename || "download",
      time: new Date().toISOString(),
      origin
    };
    blockedDownloads.push(blocked);
    stats.downloadsBlocked++;
    chrome.storage.local.set({ blockedDownloads, stats });
    if (s) {
      s.blockedDownloads++;
      chrome.storage.local.set({ siteStats });
      if (origin) setBadgeForOriginOnTabs(origin);
    }
    logEvent("threat", "Blocked suspicious download", blocked);

    if (origin) {
      broadcastToastForOrigin(origin, {
        kind: "downloadBlocked",
        origin,
        downloadId: blocked.id,
        filename: blocked.filename
      });
    }
  });
});
