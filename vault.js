// vault.js - AES-GCM encryption helper for SecureWeb

const Vault = (() => {
  const algo = {
    name: "AES-GCM",
    length: 256
  };

  async function generateKey() {
    const key = await crypto.subtle.generateKey(algo, true, ["encrypt", "decrypt"]);
    const jwk = await crypto.subtle.exportKey("jwk", key);
    return jwk;
  }

  async function importKey(jwk) {
    return crypto.subtle.importKey("jwk", jwk, algo, true, ["encrypt", "decrypt"]);
  }

  function strToBuf(str) {
    return new TextEncoder().encode(str);
  }

  function bufToStr(buf) {
    return new TextDecoder().decode(buf);
  }

  function bufToBase64(buf) {
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function base64ToBuf(b64) {
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf.buffer;
  }

  async function encrypt(jwk, plaintext) {
    const key = await importKey(jwk);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      strToBuf(plaintext)
    );
    return {
      iv: bufToBase64(iv),
      data: bufToBase64(enc)
    };
  }

  async function decrypt(jwk, obj) {
    const key = await importKey(jwk);
    const iv = base64ToBuf(obj.iv);
    const data = base64ToBuf(obj.data);
    const dec = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(iv) },
      key,
      data
    );
    return bufToStr(dec);
  }

  return {
    generateKey,
    encrypt,
    decrypt
  };
})();

if (typeof window !== "undefined") {
  window.Vault = Vault;
}
