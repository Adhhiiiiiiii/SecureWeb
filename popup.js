/* popup.js - SecureWeb popup logic (tablet UI) */
document.addEventListener('DOMContentLoaded', init);

const SVG_SPRITE = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">
  <symbol id="ico-gear" viewBox="0 0 16 16"><path fill="currentColor" d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492z"/></symbol>
</svg>`;

async function init(){
  document.getElementById('svg-sprite-placeholder').innerHTML = SVG_SPRITE;
  bindUI();
  await loadPrefs();
  await refreshSiteInfo();
  refreshLogs();
  const s = await chrome.storage.local.get(['seen_onboard']);
  if (!s.seen_onboard) _SW.showModal('onboardModal');
}

function bindUI(){
  document.getElementById('whitelistBtn').addEventListener('click', whitelistSite);
  document.getElementById('tempAllowBtn').addEventListener('click', tempAllowSite);
  document.getElementById('setRoleBtn').addEventListener('click', setRoleForSite);
  document.getElementById('exportLogs').addEventListener('click', exportLogs);
  document.getElementById('clearLogs').addEventListener('click', clearLogs);
  document.getElementById('openOnboard').addEventListener('click', ()=>_SW.showModal('onboardModal'));
  document.getElementById('detailClose').addEventListener('click', ()=>_SW.hideModal('detailModal'));
  document.getElementById('onboardClose').addEventListener('click', async ()=>{ await chrome.storage.local.set({seen_onboard:true}); _SW.hideModal('onboardModal'); });

  document.getElementById('blockCamera').addEventListener('change', applyPrivacyFromUI);
  document.getElementById('blockMic').addEventListener('change', applyPrivacyFromUI);
  document.getElementById('blockLocation').addEventListener('change', applyPrivacyFromUI);
  document.getElementById('globalProtect').addEventListener('change', onGlobalToggle);
}

async function loadPrefs(){
  const data = await chrome.storage.local.get(['privacy_prefs','globalProtect']);
  const prefs = data.privacy_prefs || {};
  document.getElementById('blockCamera').checked = prefs.blockCamera || false;
  document.getElementById('blockMic').checked = prefs.blockMic || false;
  document.getElementById('blockLocation').checked = prefs.blockLocation || false;
  document.getElementById('globalProtect').checked = (data.globalProtect !== false);
  updateStatusBadge();
}

function updateStatusBadge(){
  const badge = document.getElementById('statusBadge');
  const on = document.getElementById('globalProtect').checked;
  badge.textContent = on ? 'Active' : 'Paused';
  badge.className = on ? 'badge badge-success' : 'badge';
}

async function applyPrivacyFromUI(){
  const camera = document.getElementById('blockCamera').checked;
  const microphone = document.getElementById('blockMic').checked;
  const location = document.getElementById('blockLocation').checked;
  const prefs = { blockCamera: camera, blockMic: microphone, blockLocation: location };
  await chrome.storage.local.set({ privacy_prefs: prefs });
  // notify content scripts via storage change; they forward to page
  _SW.toast('Privacy settings saved');
}

function onGlobalToggle(){
  const on = document.getElementById('globalProtect').checked;
  chrome.storage.local.set({ globalProtect: on });
  updateStatusBadge();
  chrome.runtime.sendMessage({ type: 'LOG', message: on ? 'Protection enabled' : 'Protection disabled' });
}

async function refreshSiteInfo(){
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const siteOriginEl = document.getElementById('siteOrigin');
  const siteRoleEl = document.getElementById('siteRole');
  if (!tab || !tab.url) { siteOriginEl.textContent = 'No active tab'; siteRoleEl.textContent = '—'; return; }
  const origin = (new URL(tab.url)).origin;
  siteOriginEl.textContent = origin;
  chrome.runtime.sendMessage({ type: 'CHECK_ROLE', origin }, resp => {
    const role = resp?.role || 'guest';
    siteRoleEl.textContent = role;
    document.getElementById('roleSelect').value = role;
  });
  // check temp allow
  const s = await chrome.storage.local.get(['temp_allow']);
  const ta = s.temp_allow || {};
  if (ta[origin] && ta[origin] > Date.now()) {
    document.getElementById('tempAllowBtn').textContent = 'Allowed';
    document.getElementById('tempAllowBtn').disabled = true;
  } else {
    document.getElementById('tempAllowBtn').textContent = 'Allow 10m';
    document.getElementById('tempAllowBtn').disabled = false;
  }
}

async function whitelistSite(){
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) { _SW.toast('No active tab'); return; }
  const origin = (new URL(tab.url)).origin;
  chrome.runtime.sendMessage({ type: 'SET_WHITELIST', origin }, resp => {
    if (resp?.ok) _SW.toast('Whitelisted '+origin);
    refreshLogs();
  });
}

async function tempAllowSite(){
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) { _SW.toast('No active tab'); return; }
  const origin = (new URL(tab.url)).origin;
  const expiry = Date.now() + (10*60*1000);
  const s = await chrome.storage.local.get(['temp_allow']);
  const ta = s.temp_allow || {};
  ta[origin] = expiry;
  await chrome.storage.local.set({ temp_allow: ta });
  _SW.toast('Temporary allow added for 10 minutes');
  refreshSiteInfo();
  chrome.runtime.sendMessage({ type: 'LOG', message: 'Temp allow added', details: { origin, expires: expiry } });
}

async function setRoleForSite(){
  const role = document.getElementById('roleSelect').value;
  const origin = document.getElementById('siteOrigin').textContent;
  const data = await chrome.storage.local.get(['secureweb_roles']);
  const m = data.secureweb_roles || {};
  m[origin] = role;
  chrome.runtime.sendMessage({ type: 'STORE_ROLEMAP', roleMap: m }, resp => {
    if (resp?.ok) { _SW.toast('Role set to '+role); document.getElementById('siteRole').textContent = role; }
  });
}

/* Logs */
function refreshLogs(){
  chrome.storage.local.get(['secureweb_logs'], res => {
    const arr = res.secureweb_logs || [];
    const tbody = document.getElementById('logsBody');
    tbody.innerHTML = '';
    arr.slice(-80).reverse().forEach((entry, idx) => {
      const tr = document.createElement('tr');
      const tdTime = document.createElement('td'); tdTime.style.width = '140px';
      tdTime.innerHTML = `<small class="text-muted">${new Date(entry.ts).toLocaleString()}</small>`;
      const tdMsg = document.createElement('td');
      tdMsg.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><div class="small">${escapeHtml(entry.msg)}</div><div><button data-idx="${idx}" class="btn btn-sm btn-outline-light detailBtn">Details</button></div></div>`;
      tr.appendChild(tdTime); tr.appendChild(tdMsg); tbody.appendChild(tr);
    });
    Array.from(document.getElementsByClassName('detailBtn')).forEach(btn => btn.addEventListener('click', showDetail));
  });
}

function showDetail(e){
  const idx = parseInt(e.currentTarget.getAttribute('data-idx'));
  chrome.storage.local.get(['secureweb_logs'], res => {
    const arr = res.secureweb_logs || [];
    const entry = arr.slice(-80).reverse()[idx];
    if (!entry) return;
    document.getElementById('detailTitle').textContent = entry.msg;
    document.getElementById('detailBody').textContent = JSON.stringify(entry.meta || {}, null, 2);
    _SW.showModal('detailModal');
  });
}

function exportLogs(){
  chrome.storage.local.get(['secureweb_logs'], res => {
    const data = JSON.stringify(res.secureweb_logs || [], null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'secureweb_logs.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  });
}

function clearLogs(){
  if (!confirm('Clear activity logs?')) return;
  chrome.storage.local.set({ secureweb_logs: [] }, () => { refreshLogs(); _SW.toast('Logs cleared'); });
}

function escapeHtml(s){ return (s||'').toString().replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[ch])); }
