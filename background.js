// background.js - SecureWeb service worker
const LOG_KEY = "secureweb_logs";
const WHITELIST_KEY = "whitelist";
const ROLE_MAP_KEY = "secureweb_roles";
const TEMP_ALLOW_KEY = "temp_allow";
const GLOBAL_PROTECT_KEY = "globalProtect";
const PRIVACY_PREFS_KEY = "privacy_prefs";

async function init(){
  const data = await chrome.storage.local.get([WHITELIST_KEY, ROLE_MAP_KEY, TEMP_ALLOW_KEY, GLOBAL_PROTECT_KEY]);
  console.log("SecureWeb background init", data);
}
init();

function log(msg, meta = {}) {
  const entry = { ts: new Date().toISOString(), msg, meta };
  chrome.storage.local.get([LOG_KEY], res => {
    const arr = res[LOG_KEY] || [];
    arr.push(entry);
    if (arr.length > 2000) arr.splice(0, arr.length - 2000);
    chrome.storage.local.set({ [LOG_KEY]: arr });
  });
  console.log("[SecureWeb]", entry);
}

// Download blocking: cancel downloads from non-whitelisted origins if not by extension
chrome.downloads.onCreated.addListener(async (downloadItem) => {
  try {
    const url = downloadItem.finalUrl || downloadItem.url || "";
    let origin = "";
    try { origin = new URL(url).origin; } catch(e) { origin = ""; }
    const data = await chrome.storage.local.get([WHITELIST_KEY]);
    const whitelist = data[WHITELIST_KEY] || [];
    const byExt = downloadItem.byExtensionId === chrome.runtime.id;
    if (origin && !whitelist.includes(origin) && !byExt) {
      // heuristic cancel
      chrome.downloads.cancel(downloadItem.id, () => {
        log("Cancelled auto-download", { url, origin });
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icons/48.png",
          title: "SecureWeb: Download blocked",
          message: `Download from ${origin} was blocked.`
        });
      });
    }
  } catch (e) { log("download handler error", { e: e.toString() }); }
});

// Message handling between popup/content and background
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;
  (async () => {
    if (msg.type === "CHECK_ROLE") {
      const origin = msg.origin || (sender.tab ? new URL(sender.tab.url).origin : "");
      const data = await chrome.storage.local.get([ROLE_MAP_KEY]);
      const roleMap = data[ROLE_MAP_KEY] || {};
      sendResponse({ role: roleMap[origin] || "guest" });
    } else if (msg.type === "SET_WHITELIST") {
      const origin = msg.origin;
      const data = await chrome.storage.local.get([WHITELIST_KEY]);
      const wl = data[WHITELIST_KEY] || [];
      if (!wl.includes(origin)) wl.push(origin);
      await chrome.storage.local.set({ [WHITELIST_KEY]: wl });
      log("Whitelist added", { origin });
      sendResponse({ ok: true });
    } else if (msg.type === "SET_PRIVACY") {
      // allowed payload: { camera, microphone, location }
      const prefs = msg.value || {};
      await chrome.storage.local.set({ [PRIVACY_PREFS_KEY]: prefs });
      log("Privacy prefs set", prefs);
      sendResponse({ ok: true });
    } else if (msg.type === "STORE_ROLEMAP") {
      const roleMap = msg.roleMap || {};
      await chrome.storage.local.set({ [ROLE_MAP_KEY]: roleMap });
      log("Role map updated", { count: Object.keys(roleMap).length });
      sendResponse({ ok: true });
    } else if (msg.type === "LOG") {
      log(msg.message, msg.details||{});
      sendResponse({ ok: true });
    } else if (msg.type === "TEMP_ALLOW") {
      const origin = msg.origin;
      const expiry = msg.expiry || (Date.now() + (10*60*1000));
      const data = await chrome.storage.local.get([TEMP_ALLOW_KEY]);
      const ta = data[TEMP_ALLOW_KEY] || {};
      ta[origin] = expiry;
      await chrome.storage.local.set({ [TEMP_ALLOW_KEY]: ta });
      log("Temp allow set", { origin, expiry });
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: false });
    }
  })().catch(e => {
    console.error(e);
    sendResponse({ ok: false, error: e.toString() });
  });
  return true; // will call sendResponse asynchronously
});

// prune old temp allows & logs periodically
chrome.alarms.create("prune", { periodInMinutes: 30 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "prune") {
    // prune temp_allow
    const data = await chrome.storage.local.get([TEMP_ALLOW_KEY, LOG_KEY]);
    const ta = data[TEMP_ALLOW_KEY] || {};
    const now = Date.now();
    for (const k of Object.keys(ta)) if (ta[k] <= now) delete ta[k];
    await chrome.storage.local.set({ [TEMP_ALLOW_KEY]: ta });
    // prune logs
    const logs = data[LOG_KEY] || [];
    const max = 1000;
    if (logs.length > max) {
      const trimmed = logs.slice(logs.length - max);
      await chrome.storage.local.set({ [LOG_KEY]: trimmed });
    }
    log("Prune job ran", { keptTempAllow: Object.keys(ta).length });
  }
});
