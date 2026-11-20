// All requests are pinned to GitHub. Credentials never enter project documents or URLs.
export const DEFAULT_REPO = 'hadisaranjam/qabchin-private-data';
export const MAX_ASSET_BYTES = 30 * 1024 * 1024;
export class SyncError extends Error {
  constructor(message, code = 'network') { super(message); this.code = code; }
}
export function bytesToBase64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 32768) out += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(out);
}
export function fromBase64(s) { return Uint8Array.from(atob(s.replace(/\s/g, '')), c => c.charCodeAt(0)); }
export function encodeJSON(v) { return bytesToBase64(new TextEncoder().encode(JSON.stringify(v))); }
export function decodeJSON(v) { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(fromBase64(v))); }
export function validId(id) { return typeof id === 'string' && /^[a-zA-Z0-9-]{8,80}$/.test(id); }
export function validateProject(doc) {
  if (!doc || doc.app !== 'comic-page-studio' || !Array.isArray(doc.pages) || !doc.pages.length || doc.pages.length > 300)
    throw new SyncError('فایل پروژه معتبر نیست.', 'invalid');
  if (!doc.assets || typeof doc.assets !== 'object' || Array.isArray(doc.assets)) throw new SyncError('تصویرهای پروژه معتبر نیست.', 'invalid');
  for (const page of doc.pages) {
    if (!page || !Array.isArray(page.panels) || page.panels.length > 6) throw new SyncError('صفحه‌های پروژه معتبر نیست.', 'invalid');
    for (const panel of page.panels) if (panel?.image && (!Object.hasOwn(doc.assets, panel.image.assetId) || typeof doc.assets[panel.image.assetId] !== 'string'))
      throw new SyncError('یکی از تصویرهای پروژه موجود نیست؛ پروژه جایگزین نشد.', 'invalid');
  }
  return doc;
}
export function syncDecision(local, remoteSha) {
  if (!remoteSha) return local.remoteSha ? 'conflict' : 'push';
  if (!local.remoteSha) return 'conflict';
  const dirty = local.revision !== local.syncedRevision;
  if (local.remoteSha !== remoteSha) return dirty ? 'conflict' : 'pull';
  return dirty ? 'push' : 'same';
}
export class GitHubSync {
  constructor({ token, repo = DEFAULT_REPO, fetcher = globalThis.fetch, progress = () => {} }) {
    if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new SyncError('نام مخزن معتبر نیست.', 'invalid');
    if (typeof token !== 'string' || !token.trim()) throw new SyncError('کلید اتصال را وارد کنید.', 'auth');
    this.repo = repo; this.token = token.trim(); this.fetcher = fetcher; this.progress = progress;
    this.branch = 'main'; this.verified = false; this.uploaded = new Set();
  }
  async request(path, { method = 'GET', body, raw = false, missing = false } = {}) {
    let response;
    try {
      response = await this.fetcher(`https://api.github.com/repos/${this.repo}${path}`, {
        method, cache: 'no-store', credentials: 'omit', redirect: 'error',
        headers: { 'Authorization': `Bearer ${this.token}`, 'Accept': raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(90000)
      });
    } catch { throw new SyncError('ارتباط با GitHub برقرار نشد. کار شما روی این دستگاه محفوظ است؛ دوباره تلاش کنید.'); }
    if (response.status === 404 && missing) return null;
    if (!response.ok) {
      if (response.status === 401) throw new SyncError('کلید اتصال نامعتبر یا منقضی شده است. دوباره متصل شوید.', 'auth');
      if (response.status === 403 || response.status === 429) {
        const limited = response.status === 429 || response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after');
        throw new SyncError(limited ? 'محدودیت موقت GitHub؛ چند دقیقه بعد دوباره سینک کنید.' : 'کلید اجازهٔ این کار را ندارد؛ دسترسی Contents باید Read and write و مخزن درست انتخاب شده باشد.', limited ? 'rate' : 'permission');
      }
      if (response.status === 409 || response.status === 422) throw new SyncError('نسخهٔ ابری تغییر کرده است؛ برای حفظ هر دو نسخه، دوباره سینک کنید.', 'conflict');
      if (response.status === 404) throw new SyncError('مخزن پیدا نشد یا کلید اجازهٔ دسترسی به آن را ندارد.', 'permission');
      throw new SyncError(`سینک کامل نشد (کد ${response.status}). نسخهٔ محلی محفوظ است.`, 'server');
    }
    return raw ? new Uint8Array(await response.arrayBuffer()) : response.json();
  }
  async verify() {
    const repo = await this.request('');
    if (repo.private !== true) throw new SyncError('سینک فقط با مخزن خصوصی مجاز است؛ پروژه‌ای ارسال نشد.', 'privacy');
    if (repo.archived || repo.disabled) throw new SyncError('این مخزن امکان نوشتن ندارد.', 'permission');
    this.branch = repo.default_branch || 'main'; this.verified = true;
    return repo;
  }
  path(path) { return `/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(this.branch)}`; }
  async getMeta(id) {
    if (!validId(id)) throw new SyncError('شناسهٔ پروژه معتبر نیست.', 'invalid');
    const file = await this.request(this.path(`projects/${id}.json`), { missing: true });
    if (!file) return null;
    if (!file.content || file.size > 950000) throw new SyncError('فایل پروژهٔ ابری بیش از حد بزرگ یا آسیب‌دیده است.', 'invalid');
    let envelope;
    try { envelope = decodeJSON(file.content); } catch { throw new SyncError('فایل پروژهٔ ابری خوانده نشد.', 'invalid'); }
    if (envelope.schema !== 1 || envelope.id !== id || !envelope.doc) throw new SyncError('ساختار پروژهٔ ابری معتبر نیست.', 'invalid');
    return { ...envelope, sha: file.sha };
  }
  async list() {
    await this.verify();
    const entries = await this.request(this.path('projects'), { missing: true });
    if (!entries) return [];
    if (!Array.isArray(entries)) throw new SyncError('پوشهٔ پروژه‌ها معتبر نیست.', 'invalid');
    const result = [];
    for (const file of entries.filter(x => x.type === 'file' && /^[a-zA-Z0-9-]{8,80}\.json$/.test(x.name))) {
      const meta = await this.getMeta(file.name.slice(0, -5));
      if (meta) result.push(meta);
    }
    return result;
  }
  async push(record) {
    await this.verify();
    validateProject(record.doc);
    if (!validId(record.id)) throw new SyncError('شناسهٔ پروژه معتبر نیست.', 'invalid');
    const remote = await this.getMeta(record.id);
    if ((remote?.sha || null) !== (record.remoteSha || null)) throw new SyncError('این پروژه روی دستگاه دیگری تغییر کرده است.', 'conflict');
    const doc = structuredClone(record.doc), refs = Object.create(null), images = Object.entries(doc.assets);
    for (let i = 0; i < images.length; i++) {
      const [id, dataUrl] = images[i];
      const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
      if (!match) throw new SyncError('فرمت یکی از تصاویر برای سینک معتبر نیست.', 'invalid');
      let bytes;
      try { bytes = fromBase64(match[2]); } catch { throw new SyncError('دادهٔ تصویر آسیب‌دیده است.', 'invalid'); }
      if (bytes.length > MAX_ASSET_BYTES) throw new SyncError('هر تصویر برای سینک باید کمتر از ۳۰ مگابایت باشد؛ فایل محلی محفوظ است.', 'size');
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
      const path = `assets/${hash}.${match[1].split('/')[1]}`;
      refs[id] = { path, mime: match[1], bytes: bytes.length };
      this.progress(`تصویر ${i + 1} از ${images.length}`);
      if (this.uploaded.has(path)) continue;
      // Immutable, content-addressed assets can be shared between revisions and devices.
      const existing = await this.request(this.path(path), { missing: true });
      if (!existing) {
        try { await this.request(`/contents/${path}`, { method: 'PUT', body: { message: 'Sync comic image', content: bytesToBase64(bytes), branch: this.branch } }); }
        catch (error) {
          // Another device may have uploaded the very same image. Never replace it.
          if (error.code !== 'conflict' || !await this.request(this.path(path), { missing: true })) throw error;
        }
      }
      this.uploaded.add(path);
    }
    doc.assets = refs;
    const envelope = { schema: 1, id: record.id, name: String(doc.name || 'کتاب بی‌نام').slice(0, 60), updatedAt: new Date().toISOString(), revision: record.revision, doc };
    if (new TextEncoder().encode(JSON.stringify(envelope)).length > 900000) throw new SyncError('اطلاعات این کتاب برای سینک بیش از حد بزرگ است؛ آن را به چند کتاب تقسیم کنید.', 'size');
    this.progress('ثبت نسخهٔ پروژه');
    const result = await this.request(`/contents/projects/${record.id}.json`, { method: 'PUT', body: {
      message: 'Sync comic project', content: encodeJSON(envelope), branch: this.branch,
      ...(record.remoteSha ? { sha: record.remoteSha } : {})
    } });
    return { ...envelope, sha: result.content.sha };
  }
  async pull(meta) {
    await this.verify();
    const doc = structuredClone(meta.doc), assets = Object.create(null), entries = Object.entries(doc.assets || {});
    if (entries.length > 1800) throw new SyncError('تعداد تصویرها معتبر نیست.', 'invalid');
    for (let i = 0; i < entries.length; i++) {
      const [id, ref] = entries[i];
      if (!ref || !/^assets\/[a-f0-9]{64}\.(png|jpeg|webp|gif)$/.test(ref.path) || !/^image\/(png|jpeg|webp|gif)$/.test(ref.mime))
        throw new SyncError('نشانی تصویر در پروژه معتبر نیست.', 'invalid');
      this.progress(`دریافت تصویر ${i + 1} از ${entries.length}`);
      const bytes = await this.request(this.path(ref.path), { raw: true });
      if (bytes.length > MAX_ASSET_BYTES) throw new SyncError('تصویر ابری بیش از حد بزرگ است.', 'size');
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
      if (!ref.path.includes(`/${hash}.`)) throw new SyncError('تصویر دریافتی با نسخهٔ ذخیره‌شده مطابقت ندارد؛ دوباره تلاش کنید.', 'invalid');
      assets[id] = `data:${ref.mime};base64,${bytesToBase64(bytes)}`;
    }
    doc.assets = assets;
    return validateProject(doc);
  }
}
