// پایه: ابزارهای کوچک، قطع‌های صفحه، وضعیت برنامه و تاریخچهٔ واگرد
"use strict";
const $ = (s, r = document) => r.querySelector(s),
  $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const fa = v => new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 }).format(v);
const fa2 = v => new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 }).format(v);
// Inline SVG icons (stroke = currentColor) shared by the rendered UI.
const svgIcon = d => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICONS = {
  lock: svgIcon('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  unlock: svgIcon('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>'),
  up: svgIcon('<path d="M12 19V5m-6 6 6-6 6 6"/>'),
  down: svgIcon('<path d="M12 5v14m6-6-6 6-6-6"/>'),
  left: svgIcon('<path d="M19 12H5m6-6-6 6 6 6"/>'),
  right: svgIcon('<path d="M5 12h14m-6-6 6 6-6 6"/>'),
  fit: svgIcon('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  shuffle: svgIcon('<path d="M4 17l5-10 4 6 3-4 4 8"/>'),
  trash: svgIcon('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>'),
  copy: svgIcon('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/>'),
  splitV: svgIcon('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>'),
  splitH: svgIcon('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 12h18"/>'),
  merge: svgIcon('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v4M12 16v4M8 12h8m-3-3 3 3-3 3M11 9l-3 3 3 3"/>'),
  image: svgIcon('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-8 8"/>')
};
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const clone = v => JSON.parse(JSON.stringify(v));
// History copies editable metadata while reusing immutable image strings.
function historyClone(value) {
  const assets = [];
  const serialized = JSON.stringify(value, (key, item) => {
    if (key === "dataUrl" && typeof item === "string") {
      assets.push(item);
      return { imageAsset: assets.length - 1 };
    }
    return item;
  });
  return JSON.parse(serialized, (key, item) =>
    key === "dataUrl" && item && typeof item.imageAsset === "number" ? assets[item.imageAsset] : item
  );
}
const PAGE_PRESETS = {
  roghi: {
    width: 1665,
    height: 2504,
    title: "قطع رقعی",
    info: "۱۴٫۱ × ۲۱٫۲ سانتی‌متر پس از برش، در ۳۰۰dpi."
  },
  vaziri: {
    width: 1949,
    height: 2776,
    title: "قطع وزیری",
    info: "۱۶٫۵ × ۲۳٫۵ سانتی‌متر پس از برش، در ۳۰۰dpi."
  },
  rahli: {
    width: 2421,
    height: 3461,
    title: "قطع رحلی",
    info: "۲۰٫۵ × ۲۹٫۳ سانتی‌متر پس از برش، در ۳۰۰dpi."
  },
  kheshti: { width: 2598, height: 2598, title: "خشتی بزرگ", info: "۲۲ × ۲۲ سانتی‌متر در ۳۰۰dpi." },
  kheshtiKids: { width: 2362, height: 2362, title: "خشتی کودک", info: "۲۰ × ۲۰ سانتی‌متر در ۳۰۰dpi." },
  paltoei: { width: 1358, height: 2480, title: "قطع پالتویی", info: "۱۱٫۵ × ۲۱ سانتی‌متر در ۳۰۰dpi." },
  jibi: { width: 1299, height: 1949, title: "قطع جیبی", info: "۱۱ × ۱۶٫۵ سانتی‌متر در ۳۰۰dpi." },
  bayazi: { width: 3508, height: 2480, title: "قطع بیاضی", info: "۲۹٫۷ × ۲۱ سانتی‌متر افقی در ۳۰۰dpi." },
  a4: {
    width: 2480,
    height: 3508,
    title: "A4 عمودی",
    info: "۲۱۰ × ۲۹۷ میلی‌متر در ۳۰۰dpi؛ مناسب چاپ عمومی، نمونه‌خوانی و کتاب مصور."
  },
  a4landscape: {
    width: 3508,
    height: 2480,
    title: "A4 افقی",
    info: "۲۹۷ × ۲۱۰ میلی‌متر در ۳۰۰dpi؛ مناسب صفحه‌های سینمایی و قاب‌های عریض."
  },
  comic: {
    width: 1988,
    height: 3075,
    title: "کمیک استاندارد",
    info: "۶٫۶۲۵ × ۱۰٫۲۵ اینچ در ۳۰۰dpi؛ تناسب رایج برای کتاب کمیک چاپی."
  },
  manga: {
    width: 2150,
    height: 3035,
    title: "مانگا B5",
    info: "۱۸۲ × ۲۵۷ میلی‌متر در ۳۰۰dpi؛ جمع‌وجور و مناسب روایت‌های پرقاب."
  },
  album: {
    width: 2953,
    height: 3543,
    title: "آلبوم اروپایی",
    info: "۲۵۰ × ۳۰۰ میلی‌متر در ۳۰۰dpi؛ سطح بزرگ‌تر برای جزئیات و تصویرسازی غنی."
  },
  square: {
    width: 2400,
    height: 2400,
    title: "کتاب مربع",
    info: "۸ × ۸ اینچ در ۳۰۰dpi؛ مناسب کتاب تصویری و ترکیب‌بندی متقارن."
  },
  kids: {
    width: 2480,
    height: 2480,
    title: "کتاب کودک خشتی",
    info: "۲۱۰ × ۲۱۰ میلی‌متر در ۳۰۰dpi؛ خوانا، صمیمی و مناسب کودک فارسی‌زبان."
  },
  webtoon: {
    width: 1080,
    height: 1920,
    title: "دیجیتال عمودی",
    info: "نسبت ۹:۱۶ برای نمایشگر و انتشار دیجیتال؛ این گزینه چاپ‌محور نیست."
  }
};
const SHAPE_LABELS = { rect: "مستطیل آزاد", diagonal: "چهارضلعی مورب", cut: "گوشه‌بریده" };
// Free-frame sizes in page percent. "square" is square on paper, so its height depends on the page ratio.
function sizePreset(size, p) {
  const pr = PAGE_PRESETS[p.preset] || PAGE_PRESETS.vaziri,
    ratio = pr.width / pr.height;
  if (size === "wide") return { w: 100, h: 23 };
  if (size === "square") return ratio <= 1 ? { w: 36, h: 36 * ratio } : { w: 36 / ratio, h: 36 };
  if (size === "portrait") return { w: 29, h: 49 };
  return { w: 49, h: 31 };
}
// Seedable random source: layouts and "variety" are reproducible from a seed stored on the page.
let rand = () => Math.random();
function seeded(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
function withSeed(seed, fn) {
  const old = rand;
  rand = seeded(seed);
  try {
    return fn();
  } finally {
    rand = old;
  }
}
const MAX_PANELS = 6,
  APP_VERSION = 27,
  FORMAT_VERSION = 10,
  MAX_HISTORY = 60;
const pageBase = pr => (pr.width > pr.height ? 650 : pr.width === pr.height ? 570 : 548);
const GUTTER_STYLES = [
  "simpleWhite",
  "simpleBlack",
  "simpleColor",
  "doubleComic",
  "proHatch",
  "inkCut",
  "rail",
  "dash",
  "energy"
];
const TEMPLATE_KEYS = [
  "grid",
  "header",
  "footer",
  "heroRight",
  "heroLeft",
  "strips",
  "diagonal",
  "zigzag",
  "spotlight",
  "mosaic",
  "cinematic",
  "action",
  "experimental",
  "random"
];
const HEX = /^#[0-9a-f]{6}$/i,
  IMG_PREFIX = /^data:image\/(png|jpeg|webp|gif);base64,/i;
const num = (v, d, a, b) => {
  const n = Number(v);
  return Number.isFinite(n) ? clamp(n, a, b) : d;
};
const LOOK_PRESETS = {
  original: { brightness: 100, contrast: 100, saturation: 100, hue: 0, mono: 0 },
  balanced: { brightness: 102, contrast: 116, saturation: 88, hue: 0, mono: 0 },
  noir: { brightness: 102, contrast: 138, saturation: 0, hue: 0, mono: 100 },
  cool: { brightness: 94, contrast: 114, saturation: 85, hue: 12, mono: 0 },
  warm: { brightness: 104, contrast: 109, saturation: 88, hue: -12, mono: 0 },
  matte: { brightness: 105, contrast: 88, saturation: 76, hue: -3, mono: 0 }
};
const defaultLook = () => ({ preset: "original", ...LOOK_PRESETS.original });
function normalizeLook(value) {
  const v = value || defaultLook();
  return {
    preset: v.preset || "custom",
    brightness: clamp(Number(v.brightness) || 100, 60, 140),
    contrast: clamp(Number(v.contrast) || 100, 60, 160),
    saturation: clamp(v.saturation === 0 ? 0 : Number(v.saturation) || 100, 0, 160),
    hue: clamp(Number(v.hue) || 0, -30, 30),
    mono: clamp(Number(v.mono) || 0, 0, 100)
  };
}
function lookFilter(v) {
  const x = normalizeLook(v);
  return `brightness(${x.brightness}%) contrast(${x.contrast}%) saturate(${x.saturation}%) hue-rotate(${x.hue}deg) grayscale(${x.mono}%)`;
}
function effectiveLook(p, pn) {
  return pn.image?.lookOverride ? normalizeLook(pn.image.lookOverride) : normalizeLook(p.look);
}

function newPage(number) {
  return {
    id: uid(),
    name: `صفحه ${fa(number)}`,
    preset: "vaziri",
    paper: "#f6f2e8",
    gap: 3,
    gutterStyle: "simpleWhite",
    gutterColor: "#ffffff",
    gutterAccent: "#0e1723",
    gutterDetail: 50,
    look: defaultLook(),
    targetCount: 3,
    lastTemplate: "grid",
    panels: [],
    boundaries: [],
    isTiled: false,
    magnet: true,
    layoutStyle: "regular",
    layoutSeed: 1,
    templateSig: "",
    pageBorder: 0
  };
}
function newPanel(x, y, w, h, shape = "rect", image = null) {
  return {
    id: uid(),
    x,
    y,
    w,
    h,
    shape,
    slant: 9,
    customPoly: null,
    image,
    locked: false,
    fitBasePoly: null,
    layer: 0
  };
}
const state = {
  pages: [newPage(1)],
  activePageId: null,
  selectedPanelId: null,
  selectedVertex: null,
  pageSize: { width: 548, height: 800 },
  stageZoom: 0.84,
  userZoomed: false,
  editorTab: "page",
  templateCategory: "classic",
  lookScope: "page",
  handleSize: 17,
  past: [],
  future: [],
  drag: null,
  snap: true,
  snapLines: [],
  preview: null,
  orderMode: null,
  projectName: "",
  varietyStrength: 2
};
try {
  const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  state.handleSize = clamp(Number(localStorage.getItem("comic-handle-size")) || (coarse ? 24 : 16), 10, 36);
  state.snap = localStorage.getItem("comic-snap") !== "0";
} catch {}
state.activePageId = state.pages[0].id;
const els = {
  comicPage: $("#comicPage"),
  handlesLayer: $("#handlesLayer"),
  framesLayer: $("#framesLayer"),
  gutterLayer: $("#gutterLayer"),
  emptyState: $("#emptyState"),
  pageList: $("#pageList"),
  activePageTitle: $("#activePageTitle"),
  panelCountPill: $("#panelCountPill"),
  frameControls: $("#frameControls"),
  imageControls: $("#imageControls"),
  noImageSelection: $("#noImageSelection"),
  selectedFrameNumber: $("#selectedFrameNumber"),
  imageFrameNumber: $("#imageFrameNumber"),
  frameShapeLabel: $("#frameShapeLabel"),
  toggleLockBtn: $("#toggleLockBtn"),
  frameX: $("#frameX"),
  frameY: $("#frameY"),
  frameW: $("#frameW"),
  frameH: $("#frameH"),
  shapeSelect: $("#shapeSelect"),
  selectedFileName: $("#selectedFileName"),
  fitSelect: $("#fitSelect"),
  zoomRange: $("#zoomRange"),
  zoomValue: $("#zoomValue"),
  gapRange: $("#gapRange"),
  gapValue: $("#gapValue"),
  gutterStyle: $("#gutterStyle"),
  gutterColor: $("#gutterColor"),
  gutterColorValue: $("#gutterColorValue"),
  gutterPreview: $("#gutterPreview"),
  panelManager: $("#panelManager"),
  panelManagerSection: $("#panelManagerSection"),
  pagePreset: $("#pagePreset"),
  pagePresetInfo: $("#pagePresetInfo"),
  paperColor: $("#paperColor"),
  stageStatus: $("#stageStatus"),
  stageZoomValue: $("#stageZoomValue"),
  activeMode: $("#activeMode"),
  undoBtn: $("#undoBtn"),
  redoBtn: $("#redoBtn"),
  selectedImageInput: $("#selectedImageInput"),
  batchImageInput: $("#batchImageInput"),
  projectInput: $("#projectInput"),
  exportDialog: $("#exportDialog"),
  toast: $("#toast")
};
function page() {
  return state.pages.find(p => p.id === state.activePageId) || state.pages[0];
}
function panel() {
  return page().panels.find(p => p.id === state.selectedPanelId) || null;
}
function snapshot() {
  return historyClone({
    pages: state.pages,
    activePageId: state.activePageId,
    selectedPanelId: state.selectedPanelId
  });
}
function pushHistory(snap) {
  state.preview = null;
  state.past.push(snap);
  if (state.past.length > MAX_HISTORY) state.past.shift();
  state.future = [];
  syncHistory();
  scheduleAutosave();
}
function remember() {
  pushHistory(snapshot());
}
// One undo step per edit gesture: the snapshot is taken before the first change and committed when the control is released.
const pendingCommits = new Set();
function flushPending() {
  [...pendingCommits].forEach(f => f());
}
function tracked(el, apply) {
  let pending = null,
    timer = 0;
  const commit = () => {
    clearTimeout(timer);
    if (pending) {
      pushHistory(pending);
      pending = null;
    }
    pendingCommits.delete(commit);
  };
  el.addEventListener("input", e => {
    clearTimeout(timer);
    if (!pending) {
      pending = snapshot();
      pendingCommits.add(commit);
    }
    apply(e);
  });
  el.addEventListener("change", () => {
    clearTimeout(timer);
    timer = setTimeout(commit, 700);
  });
  el.addEventListener("blur", commit);
}
function restore(v) {
  state.pages = v.pages;
  state.activePageId = v.activePageId;
  state.selectedPanelId = v.selectedPanelId;
  state.selectedVertex = null;
  state.preview = null;
  state.orderMode = null;
  renderAll();
}
function undo() {
  flushPending();
  if (!state.past.length) return;
  state.future.push(snapshot());
  restore(state.past.pop());
}
function redo() {
  flushPending();
  if (!state.future.length) return;
  state.past.push(snapshot());
  restore(state.future.pop());
}
function syncHistory() {
  els.undoBtn.disabled = !state.past.length;
  els.redoBtn.disabled = !state.future.length;
}
