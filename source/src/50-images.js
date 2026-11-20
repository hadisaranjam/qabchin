// ورود تصویر، کوچک‌سازی و رنگ و نور
function fileData(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });
}
async function analyzeImage(im) {
  const s = 80,
    c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(im, 0, 0, s, s);
  let d;
  try {
    d = ctx.getImageData(0, 0, s, s).data;
  } catch {
    return { x: 50, y: 45 };
  }
  const lum = (x, y) => {
    const i = (y * s + x) * 4;
    return 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  };
  let sum = 0,
    sx = 0,
    sy = 0;
  for (let y = 1; y < s - 1; y += 2)
    for (let x = 1; x < s - 1; x += 2) {
      const i = (y * s + x) * 4,
        edge = Math.abs(lum(x, y) - lum(x - 1, y)) + Math.abs(lum(x, y) - lum(x, y - 1)),
        sat = Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]),
        wt = Math.max(0.1, edge + sat * 0.18);
      sum += wt;
      sx += x * wt;
      sy += y * wt;
    }
  return { x: clamp((sx / sum / s) * 100, 8, 92), y: clamp((sy / sum / s) * 100, 8, 92) };
}
// Content fingerprint: the same picture imported twice is stored once (autosave and project file).
function hashString(text) {
  let a = 0x811c9dc5,
    b = 0x1b873593;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x85ebca6b) ^ (b >>> 13);
  }
  return `h${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}${text.length.toString(36)}`;
}
const MAX_IMG_SIDE = 4096,
  MAX_IMG_BYTES = 80 * 1024 * 1024;
let toastNote = "";
// Some systems give an empty MIME type (e.g. WebP on older Windows), so the extension is checked too.
function isImageFile(f) {
  return /^image\/(jpeg|png|webp)$/i.test(f.type) || (!f.type && /\.(jpe?g|png|webp)$/i.test(f.name));
}
async function shrinkImage(file, dataUrl, im) {
  const big = Math.max(im.naturalWidth, im.naturalHeight);
  if (big <= MAX_IMG_SIDE) return { dataUrl, im };
  const k = MAX_IMG_SIDE / big,
    w = Math.max(1, Math.round(im.naturalWidth * k)),
    h = Math.max(1, Math.round(im.naturalHeight * k)),
    c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(im, 0, 0, w, h);
  // JPEG stays JPEG; PNG/WebP may be transparent, so they become WebP (browsers without a WebP encoder return PNG).
  const jpeg = /jpe?g/i.test(file.type) || /\.jpe?g$/i.test(file.name),
    out = c.toDataURL(jpeg ? "image/jpeg" : "image/webp", 0.92);
  c.width = c.height = 0;
  try {
    const small = await loadImage(out);
    toastNote = `«${file.name}» به ${fa(w)}×${fa(h)} کوچک شد.`;
    return { dataUrl: out, im: small };
  } catch {
    return { dataUrl, im };
  }
}
async function imageRecord(file) {
  if (file.size > MAX_IMG_BYTES) throw new Error("too-big");
  let dataUrl = await fileData(file),
    im = await loadImage(dataUrl);
  ({ dataUrl, im } = await shrinkImage(file, dataUrl, im));
  const focus = await analyzeImage(im);
  return {
    name: file.name,
    dataUrl,
    width: im.naturalWidth,
    height: im.naturalHeight,
    focusX: focus.x,
    focusY: focus.y,
    panX: 50,
    panY: 50,
    panMode: "auto",
    zoom: 100,
    fit: "smart",
    flipX: false,
    flipY: false,
    rotation: 0,
    assetId: hashString(dataUrl)
  };
}
function imageError(e, name) {
  return e?.message === "too-big"
    ? `«${name}» بزرگ‌تر از ۸۰ مگابایت است.`
    : `«${name}» خوانده نشد؛ فایل JPG، PNG یا WebP سالم بدهید.`;
}
async function assignSelectedImage(file) {
  const pn = panel();
  els.selectedImageInput.value = "";
  if (!pn) return showToast("اول یک قاب را انتخاب کنید.");
  if (!isImageFile(file)) return showToast("فقط تصویر JPG، PNG یا WebP پذیرفته می‌شود.");
  showToast(`در حال خواندن «${file.name}»…`, true);
  try {
    const rec = await imageRecord(file);
    remember();
    pn.image = rec;
    setEditorTab("image");
    renderAll();
    showToast("تصویر در قاب نشست؛ برای جابه‌جایی، آن را بکشید.");
  } catch (e) {
    showToast(imageError(e, file.name));
  }
}
// Fills empty frames in Persian reading order and reports every file it could not use.
async function assignBatch(files) {
  const all = [...files];
  els.batchImageInput.value = "";
  const p = page(),
    empty = readingOrder(p).filter(x => !x.image),
    images = all.filter(isImageFile),
    unsupported = all.length - images.length;
  if (!p.panels.length) return showToast("اول قاب‌های صفحه را بسازید.");
  if (!images.length) return showToast("فقط تصویر JPG، PNG یا WebP پذیرفته می‌شود.");
  if (!empty.length) return showToast("همهٔ قاب‌ها تصویر دارند؛ برای جایگزینی، قاب را انتخاب کنید.");
  const records = [],
    failed = [];
  showToast(`در حال خواندن ${fa(Math.min(images.length, empty.length))} تصویر…`, true);
  for (const f of images.slice(0, empty.length)) {
    try {
      records.push(await imageRecord(f));
    } catch (e) {
      failed.push(imageError(e, f.name));
    }
  }
  const extra = Math.max(0, images.length - empty.length),
    notes = [];
  if (extra) notes.push(`${fa(extra)} تصویر قاب خالی نداشت و اضافه نشد`);
  if (unsupported) notes.push(`${fa(unsupported)} فایل تصویر پشتیبانی‌شده نبود`);
  if (failed.length) notes.push(failed.join(" "));
  if (!records.length) return showToast(notes.join("؛ ") + ".");
  remember();
  records.forEach((im, i) => (empty[i].image = im));
  state.selectedPanelId = empty[0].id;
  setEditorTab("image");
  renderAll();
  showToast(`${fa(records.length)} تصویر به ترتیب خوانش در قاب‌ها نشست.` + (notes.length ? ` ${notes.join("؛ ")}.` : ""));
}
function nudgeImage(dir) {
  const pn = panel();
  if (!pn?.image) return;
  remember();
  if (dir === "focus") pn.image.panMode = "auto";
  else {
    pn.image.panMode = "manual";
    if (dir === "left") pn.image.panX = clamp(pn.image.panX - 6, 0, 100);
    if (dir === "right") pn.image.panX = clamp(pn.image.panX + 6, 0, 100);
    if (dir === "up") pn.image.panY = clamp(pn.image.panY - 6, 0, 100);
    if (dir === "down") pn.image.panY = clamp(pn.image.panY + 6, 0, 100);
  }
  renderAll();
}
async function removeImage() {
  const pn = panel();
  if (!pn?.image) return;
  if (
    !(await ask(`تصویر قاب ${fa(panelNumber(pn.id))} حذف شود؟ خود قاب باقی می‌ماند.`, {
      ok: "حذف شود",
      danger: true
    }))
  )
    return;
  remember();
  pn.image = null;
  renderAll();
}
function lookTarget() {
  if (state.lookScope === "panel" && panel()?.image) {
    const im = panel().image;
    if (!im.lookOverride) im.lookOverride = clone(normalizeLook(page().look));
    return im.lookOverride;
  }
  return page().look;
}
function applyLookPreset(name) {
  remember();
  const target = lookTarget();
  Object.assign(target, name === "custom" ? { preset: "custom" } : { preset: name, ...LOOK_PRESETS[name] });
  renderAll();
}
function setLookField(field, value) {
  const target = lookTarget();
  target[field] = Number(value);
  target.preset = "custom";
  renderPage();
  renderPageList();
  renderLookControls();
}
// Swaps the pictures of two frames; each lands with its smart placement in the new frame.
function swapImages(idA, idB) {
  const p = page(),
    a = p.panels.find(q => q.id === idA),
    b = p.panels.find(q => q.id === idB);
  if (!a || !b || a === b || (!a.image && !b.image)) return;
  remember();
  [a.image, b.image] = [b.image, a.image];
  for (const q of [a, b]) if (q.image) Object.assign(q.image, { panMode: "auto", panX: 50, panY: 50, zoom: Math.min(q.image.zoom, 100), fit: q.image.fit === "contain" ? "contain" : "smart" });
  state.selectedPanelId = b.id;
  renderAll();
  showToast(`تصویر قاب ${fa(panelNumber(a.id, p))} و قاب ${fa(panelNumber(b.id, p))} جابه‌جا شد.`, { undo: true });
}
