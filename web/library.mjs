import { bytesToBase64, fromBase64 } from './sync.mjs';
export const uuid = () => crypto.randomUUID();
export class LocalConflict extends Error {}
export class Library {
  constructor() { this.pending = null; }
  open() {
    return this.pending ||= new Promise((resolve, reject) => {
      const r = indexedDB.open('qabchin-library', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('books', { keyPath: 'id' });
      r.onsuccess = () => { r.result.onversionchange = () => r.result.close(); resolve(r.result); };
      r.onerror = () => reject(r.error); r.onblocked = () => reject(new Error('پایگاه محلی در زبانهٔ دیگری باز است؛ زبانه‌های قدیمی را ببندید.'));
    });
  }
  async read(id) {
    const db = await this.open();
    return new Promise((resolve, reject) => { const r = db.transaction('books').objectStore('books').get(id); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  }
  async all() {
    const db = await this.open();
    return new Promise((resolve, reject) => { const r = db.transaction('books').objectStore('books').getAll(); r.onsuccess = () => resolve(r.result.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))); r.onerror = () => reject(r.error); });
  }
  async mutate(id, fn) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('books', 'readwrite'), store = tx.objectStore('books'), request = store.get(id);
      let value, failure;
      request.onsuccess = () => { try { value = fn(request.result); if (value === null) store.delete(id); else store.put(value); } catch (e) { failure = e; tx.abort(); } };
      tx.oncomplete = () => resolve(value);
      tx.onerror = tx.onabort = () => reject(failure || tx.error || new Error('ذخیرهٔ محلی انجام نشد.'));
    });
  }
  save(record, expectedRevision = null) {
    return this.mutate(record.id, old => {
      if ((old?.revision || null) !== expectedRevision) throw new LocalConflict('نسخهٔ این کتاب در زبانهٔ دیگری تغییر کرده است.');
      return { ...record, remoteSha: old?.remoteSha || record.remoteSha || null, syncedRevision: old?.syncedRevision || record.syncedRevision || null };
    });
  }
  markSynced(id, revision, sha) {
    return this.mutate(id, old => { if (!old) throw new Error('پروژهٔ محلی پیدا نشد.'); return { ...old, remoteSha: sha, syncedRevision: revision, syncedAt: new Date().toISOString() }; });
  }
}
export function makeRecord(doc, id = uuid()) {
  return { id, doc, revision: uuid(), name: doc.name || 'کتاب بی‌نام', updatedAt: new Date().toISOString(), remoteSha: null, syncedRevision: null };
}
async function vaultKey(password, salt) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function lockCredential(credential, password) {
  if (password.length < 8) throw new Error('رمز این دستگاه دست‌کم ۸ نویسه باشد.');
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await vaultKey(password, salt);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(credential)));
  return { version: 1, salt: bytesToBase64(salt), iv: bytesToBase64(iv), cipher: bytesToBase64(new Uint8Array(cipher)) };
}
export async function unlockCredential(vault, password) {
  try {
    if (vault.version !== 1) throw new Error('version');
    const key = await vaultKey(password, fromBase64(vault.salt));
    const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(vault.iv) }, key, fromBase64(vault.cipher));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch { throw new Error('رمز اتصال درست نیست یا اطلاعات ذخیره‌شده آسیب دیده است.'); }
}
