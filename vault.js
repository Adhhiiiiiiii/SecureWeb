// vault.js - Web Crypto helpers for local encryption (import where needed)
// NOTE: the extension storage is already separated from pages; this adds an extra encrypted layer.

async function generateKey() {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

async function exportKeyBase64(key) {
  const raw = await crypto.subtle.exportKey("raw", key);
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

async function importKeyFromBase64(b64) {
  const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", raw.buffer, "AES-GCM", true, ["encrypt", "decrypt"]);
}

async function encryptData(key, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder().encode(text);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc);
  return { iv: Array.from(iv), data: Array.from(new Uint8Array(cipher)) };
}

async function decryptData(key, payload) {
  const iv = new Uint8Array(payload.iv);
  const data = new Uint8Array(payload.data);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return new TextDecoder().decode(plain);
}

// small helpers to store/retrieve exported key
async function ensureVaultKey() {
  const s = await chrome.storage.local.get(["vault_key_b64"]);
  if (s.vault_key_b64) return await importKeyFromBase64(s.vault_key_b64);
  const key = await generateKey();
  const b64 = await exportKeyBase64(key);
  await chrome.storage.local.set({ vault_key_b64: b64 });
  return key;
}
