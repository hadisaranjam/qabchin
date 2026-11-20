function fileBase() {
  return state.projectName.replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}
// Format 10: every image is stored once in `assets` and frames refer to it by assetId.
function saveProject() {
  const idx = Math.max(
      0,
      state.pages.findIndex(p => p.id === state.activePageId)
    ),
    assets = {};
  state.pages.forEach(p =>
    p.panels.forEach(pn => {
      if (!pn.image) return;
      if (!pn.image.assetId) pn.image.assetId = uid();
      assets[pn.image.assetId] = pn.image.dataUrl;
    })
  );
  downloadBlob(
    new Blob(
      [
        JSON.stringify(
          {
            app: "comic-page-studio",
            version: FORMAT_VERSION,
            appVersion: APP_VERSION,
            name: state.projectName,
            savedAt: new Date().toISOString(),
            activePage: idx,
            pages: state.pages,
            assets
          },
          (k, v) => (k === "dataUrl" || k === "fitBasePoly" ? undefined : v)
        )
      ],
      { type: "application/json" }
    ),
    `${fileBase() || "comic-project"}-${jalaliStamp()}.json`
  );
  showToast("پروژه ذخیره شد؛ این فایل همهٔ صفحه‌ها و تصویرها را دارد.");
}
function cleanImage(im, rep) {
  if (!im || typeof im !== "object") return null;
  if (typeof im.dataUrl !== "string" || !IMG_PREFIX.test(im.dataUrl)) {
    rep.droppedImages++;
    return null;
  }
  const out = {
    name: String(im.name || "image").slice(0, 120),
    dataUrl: im.dataUrl,
    width: Math.round(num(im.width, 1000, 1, 100000)),
    height: Math.round(num(im.height, 1000, 1, 100000)),
    focusX: num(im.focusX, 50, 0, 100),
    focusY: num(im.focusY, 45, 0, 100),
    panX: num(im.panX, 50, 0, 100),
    panY: num(im.panY, 50, 0, 100),
    panMode: im.panMode === "manual" ? "manual" : "auto",
    zoom: num(im.zoom, 100, 50, 400),
    fit: ["smart", "cover", "stretch", "contain"].includes(im.fit) ? im.fit : "smart",
    flipX: !!im.flipX,
    flipY: !!im.flipY,
    rotation: num(im.rotation, 0, -180, 180),
    assetId: typeof im.assetId === "string" && im.assetId ? im.assetId.slice(0, 64) : uid()
  };
  if (im.lookOverride && typeof im.lookOverride === "object")
    out.lookOverride = normalizeLook(im.lookOverride);
  return out;
}
function cleanPanel(raw, rep) {
  if (!raw || typeof raw !== "object") {
    rep.droppedPanels++;
    return null;
  }
  const pn = newPanel(
    0,
    0,
    num(raw.w, 30, 1, 100),
    num(raw.h, 30, 1, 100),
    ["rect", "diagonal", "cut"].includes(raw.shape) ? raw.shape : "rect"
  );
  pn.x = num(raw.x, 0, 0, 100 - pn.w);
  pn.y = num(raw.y, 0, 0, 100 - pn.h);
  pn.slant = num(raw.slant, 9, 0, 24);
  pn.layer = num(raw.layer, 0, -50, 50);
  pn.locked = !!raw.locked;
  if (Number.isFinite(Number(raw.order)) && raw.order !== null) pn.order = Math.round(num(raw.order, 1, 1, 99));
  if (typeof raw.id === "string" && raw.id) pn.id = raw.id.slice(0, 64);
  if (
    Array.isArray(raw.customPoly) &&
    raw.customPoly.length >= 3 &&
    raw.customPoly.length <= 24 &&
    raw.customPoly.every(
      v => Array.isArray(v) && Number.isFinite(Number(v[0])) && Number.isFinite(Number(v[1]))
    )
  )
    pn.customPoly = raw.customPoly.map(v => [clamp(Number(v[0]), 0, 1), clamp(Number(v[1]), 0, 1)]);
  if (!polygonIsValid(globalPolygon(pn))) {
    if (pn.customPoly) {
      pn.customPoly = null;
      rep.resetShapes++;
    }
    if (!polygonIsValid(globalPolygon(pn))) {
      rep.droppedPanels++;
      return null;
    }
  }
  pn.image = cleanImage(raw.image, rep);
  return pn;
}
function cleanPage(old, rep) {
  const src = old && typeof old === "object" ? old : {},
    p = newPage(1),
    styleMap = {
      clean: "simpleWhite",
      bold: "simpleBlack",
      hatch: "proHatch",
      diagonal: "inkCut",
      pencil: "inkCut",
      paperTear: "inkCut",
      speedHatch: "proHatch",
      graphite: "inkCut",
      lightning: "inkCut",
      broken: "inkCut"
    };
  p.id = typeof src.id === "string" && src.id ? src.id.slice(0, 64) : uid();
  p.preset = PAGE_PRESETS[src.preset] ? src.preset : "vaziri";
  p.paper = HEX.test(src.paper) ? src.paper : p.paper;
  p.gap = num(src.gap, 3, 0, 24);
  const style = styleMap[src.gutterStyle] || src.gutterStyle;
  p.gutterStyle = GUTTER_STYLES.includes(style) ? style : "simpleWhite";
  p.gutterColor = HEX.test(src.gutterColor) ? src.gutterColor : "#ffffff";
  p.gutterAccent = HEX.test(src.gutterAccent) ? src.gutterAccent : "#0e1723";
  p.gutterDetail = num(src.gutterDetail, 50, 0, 100);
  p.look = normalizeLook(src.look);
  p.lastTemplate = TEMPLATE_KEYS.includes(src.lastTemplate) ? src.lastTemplate : "grid";
  p.targetCount = Math.round(num(src.targetCount, 3, 1, MAX_PANELS));
  p.magnet = src.magnet !== false;
  p.layoutStyle = src.layoutStyle === "hand" ? "hand" : "regular";
  p.layoutSeed = Math.round(num(src.layoutSeed, 1, 1, 1e9));
  p.templateSig = typeof src.templateSig === "string" ? src.templateSig.slice(0, 8000) : "";
  p.pageBorder = num(src.pageBorder, 0, 0, 24);
  let list = Array.isArray(src.panels) ? src.panels : null;
  if (!list) {
    const images = (Array.isArray(src.images) ? src.images : [])
      .map(x => cleanImage(x, rep))
      .filter(Boolean);
    list = buildPanels(p, "header", Math.min(MAX_PANELS, Math.max(1, images.length || 3)), images);
  }
  if (list.length > MAX_PANELS) {
    rep.trimmedPanels += list.length - MAX_PANELS;
    list = list.slice(0, MAX_PANELS);
  }
  p.panels = list.map(x => cleanPanel(x, rep)).filter(Boolean);
  if (!p.panels.every(q => Number.isFinite(q.order))) p.panels.forEach(q => delete q.order);
  p.boundaries = sharedEdges(p);
  p.isTiled = coverageOkay(p);
  return p;
}
function loadReport(rep) {
  const bits = [];
  if (rep.newer) bits.push("فایل از نسخهٔ جدیدتری ساخته شده و بعضی تنظیمات نادیده ماند");
  if (rep.droppedImages) bits.push(`${fa(rep.droppedImages)} تصویر نامعتبر کنار گذاشته شد`);
  if (rep.droppedPanels) bits.push(`${fa(rep.droppedPanels)} قاب نامعتبر حذف شد`);
  if (rep.trimmedPanels) bits.push(`${fa(rep.trimmedPanels)} قاب بیش از سقف ۶ تا کنار گذاشته شد`);
  if (rep.resetShapes) bits.push(`شکل ${fa(rep.resetShapes)} قاب نامعتبر به مستطیل برگشت`);
  return bits;
}
function newRep(v) {
  return {
    droppedImages: 0,
    droppedPanels: 0,
    trimmedPanels: 0,
    resetShapes: 0,
    newer: Number(v?.version) > FORMAT_VERSION
  };
}
const MAX_PROJECT_BYTES = 1024 * 1024 * 1024;
// Every failure path leaves the open book untouched and says why.
async function openProject(file) {
  els.projectInput.value = "";
  if (file.size > MAX_PROJECT_BYTES) return showToast("فایل پروژه بیش از ۱ گیگابایت است و باز نشد؛ چیزی تغییر نکرد.");
  let text;
  try {
    text = await file.text();
  } catch {
    return showToast("فایل خوانده نشد؛ دوباره انتخابش کنید. چیزی تغییر نکرد.");
  }
  let v;
  try {
    v = JSON.parse(text);
  } catch {
    return showToast("فایل پروژه معتبر نیست یا آسیب دیده است؛ چیزی تغییر نکرد.");
  }
  if (v?.app !== "comic-page-studio" || !Array.isArray(v.pages))
    return showToast("این فایل پروژهٔ قاب‌چین نیست و معتبر نیست؛ چیزی تغییر نکرد.");
  if (!v.pages.length || v.pages.length > 300)
    return showToast("تعداد صفحه‌های فایل باید بین ۱ تا ۳۰۰ باشد؛ فایل معتبر نیست و چیزی تغییر نکرد.");
  try {
    // format 10 keeps each image once in `assets`
    if (v.assets && typeof v.assets === "object")
      for (const pg of v.pages)
        for (const pn of Array.isArray(pg?.panels) ? pg.panels : []) {
          const im = pn?.image;
          if (im && typeof im === "object" && typeof im.dataUrl !== "string" && typeof im.assetId === "string" && Object.hasOwn(v.assets, im.assetId))
            im.dataUrl = v.assets[im.assetId];
        }
    const rep = newRep(v),
      pages = v.pages.map(x => cleanPage(x, rep)),
      at = Math.round(num(v.activePage, 0, 0, pages.length - 1)),
      bits = loadReport(rep);
    if (hasContent() && !(await ask("کتاب فعلی با این فایل جایگزین شود؟ با «واگرد» برمی‌گردد.", { ok: "بازکردن فایل", title: "بازکردن پروژه" })))
      return;
    remember();
    state.pages = pages;
    state.activePageId = pages[at].id;
    state.selectedPanelId = null;
    state.selectedVertex = null;
    state.projectName = typeof v.name === "string" ? v.name.slice(0, 60) : "";
    renderAll();
    showToast(bits.length ? `پروژه باز شد. ${bits.join("؛ ")}.` : "پروژه باز شد.");
  } catch (e) {
    console.error(e);
    showToast("فایل پروژه معتبر نیست یا آسیب دیده است؛ چیزی تغییر نکرد.");
  }
}
function ask(message, { ok = "تأیید", cancel = "انصراف", danger = false, title = "" } = {}) {
  return new Promise(res => {
    const d = $("#confirmDialog");
    if (!d?.showModal) {
      res(window.confirm(message));
      return;
    }
    const okb = $("#confirmOk"),
      cb = $("#confirmCancel");
    $("#confirmMessage").textContent = message;
    const head = $("#confirmTitle");
    if (head) {
      head.textContent = title || (danger ? "حذف شود؟" : "تأیید کنید");
    }
    okb.textContent = ok;
    cb.textContent = cancel;
    okb.classList.toggle("danger", danger);
    const done = v => {
      okb.onclick = cb.onclick = d.oncancel = null;
      d.close();
      res(v);
    };
    okb.onclick = () => done(true);
    cb.onclick = () => done(false);
    d.oncancel = e => {
      e.preventDefault();
      done(false);
    };
    d.showModal();
    cb.focus();
  });
}
// Automatic local backup in IndexedDB: geometry in one record, every image stored once as its own asset.
const Store = {
  ok: true,
  saved: new Set(),
  lastJson: null,
  db: null,
  open() {
    return (
      this.db ||
      (this.db = new Promise((res, rej) => {
        try {
          const r = indexedDB.open("comic-page-studio", 1);
          r.onupgradeneeded = () => {
            r.result.createObjectStore("meta");
            r.result.createObjectStore("assets");
          };
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
          r.onblocked = () => rej(new Error("blocked"));
        } catch (e) {
          rej(e);
        }
      }).catch(e => {
        this.ok = false;
        throw e;
      }))
    );
  },
  async run(store, mode, fn) {
    const d = await this.open();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode),
        r = fn(t.objectStore(store));
      t.oncomplete = () => res(r?.result);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  },
  get(store, key) {
    return this.run(store, "readonly", s => s.get(key));
  },
  put(store, key, val) {
    return this.run(store, "readwrite", s => s.put(val, key));
  },
  del(store, key) {
    return this.run(store, "readwrite", s => s.delete(key));
  },
  keys(store) {
    return this.run(store, "readonly", s => s.getAllKeys());
  },
  async clearAll() {
    await this.run("meta", "readwrite", s => s.clear());
    await this.run("assets", "readwrite", s => s.clear());
    this.saved.clear();
    this.lastJson = null;
  }
};
let autosaveEnabled = false,
  autosaveTimer = 0,
  autosaveBusy = false,
  autosaveAgain = false;
const hasContent = () => state.pages.length > 1 || state.pages.some(p => p.panels.length);
function needsUnloadWarning() {
  return autosaveEnabled && hasContent() && (!Store.ok || !!autosaveTimer || autosaveBusy);
}
function setSaveChip(kind, when) {
  const chip = $("#saveChip");
  if (!chip) return;
  chip.dataset.state = kind;
  const time = new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit" }).format(when || new Date());
  const [text, tip] = {
    saved: [`ذخیره شد · ${time}`, "کار شما خودکار در همین مرورگر ذخیره شد."],
    saving: ["در حال ذخیره…", "ذخیرهٔ خودکار در جریان است."],
    error: ["ذخیرهٔ خودکار متوقف شد", "ذخیرهٔ خودکار ناموفق بود؛ با «ذخیره» فایل پروژه بگیرید."],
    off: ["ذخیرهٔ خودکار خاموش", "این مرورگر اجازهٔ ذخیرهٔ خودکار نمی‌دهد (مثلاً حالت خصوصی)؛ با «ذخیره» فایل پروژه بگیرید."],
    idle: ["ذخیرهٔ خودکار روشن", "هر تغییر خودکار در همین مرورگر ذخیره می‌شود."]
  }[kind] || ["", ""];
  chip.textContent = text;
  chip.title = tip;
}
function scheduleAutosave() {
  window.dispatchEvent(new CustomEvent("qabchin:change"));
  if (!autosaveEnabled || !Store.ok) return;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    autosaveTimer = 0;
    autosaveNow();
  }, 1200);
}
async function autosaveNow() {
  if (!autosaveEnabled || !Store.ok) return;
  if (autosaveBusy) {
    autosaveAgain = true;
    return;
  }
  autosaveBusy = true;
  try {
    setSaveChip("saving");
    const used = new Set(),
      fresh = [];
    state.pages.forEach(p =>
      p.panels.forEach(pn => {
        const im = pn.image;
        if (!im) return;
        if (!im.assetId) im.assetId = uid();
        used.add(im.assetId);
        if (!Store.saved.has(im.assetId) && !fresh.some(x => x[0] === im.assetId))
          fresh.push([im.assetId, im.dataUrl]);
      })
    );
    for (const [id, url] of fresh) {
      await Store.put("assets", id, url);
      Store.saved.add(id);
    }
    const pages = JSON.parse(JSON.stringify(state.pages, (k, v) => (k === "dataUrl" ? undefined : v))),
      json = JSON.stringify({ pages, name: state.projectName, activePageId: state.activePageId });
    if (json !== Store.lastJson) {
      await Store.put("meta", "project", {
        app: "comic-page-studio",
        version: FORMAT_VERSION,
        name: state.projectName,
        savedAt: new Date().toISOString(),
        activeIndex: Math.max(
          0,
          state.pages.findIndex(p => p.id === state.activePageId)
        ),
        pages
      });
      Store.lastJson = json;
    }
    for (const k of await Store.keys("assets"))
      if (!used.has(k)) {
        await Store.del("assets", k);
        Store.saved.delete(k);
      }
    setSaveChip("saved", new Date());
  } catch (e) {
    Store.ok = false;
    setSaveChip("error");
    showToast(
      e?.name === "QuotaExceededError"
        ? "فضای ذخیرهٔ مرورگر پر است و ذخیرهٔ خودکار متوقف شد. با «ذخیره» فایل پروژه بگیرید."
        : "ذخیرهٔ خودکار در این مرورگر ممکن نشد. با «ذخیره» فایل پروژه بگیرید."
    );
  } finally {
    autosaveBusy = false;
    if (autosaveAgain) {
      autosaveAgain = false;
      scheduleAutosave();
    }
  }
}
async function restoreOffer() {
  let meta = null;
  try {
    meta = await Store.get("meta", "project");
  } catch {}
  if (!Store.ok) {
    setSaveChip("off");
    autosaveEnabled = true;
    return;
  }
  const has = meta && Array.isArray(meta.pages) && meta.pages.some(p => p && p.panels?.length);
  if (!has) {
    autosaveEnabled = true;
    setSaveChip("idle");
    return;
  }
  let when = "";
  try {
    when = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(meta.savedAt));
  } catch {}
  $("#restoreInfo").textContent =
    `${fa(meta.pages.length)} صفحه · ${fa(meta.pages.reduce((n, p) => n + (p.panels?.length || 0), 0))} قاب · آخرین ذخیره: ${when}`;
  const d = $("#restorePrompt"),
    yes = await new Promise(res => {
      $("#restoreYes").onclick = () => {
        d.close();
        res(true);
      };
      $("#restoreNo").onclick = () => {
        d.close();
        res(false);
      };
      d.oncancel = e => e.preventDefault();
      d.showModal();
      $("#restoreYes").focus();
    });
  // "Start fresh" deletes the stored work for good, so it is confirmed; declining restores it instead.
  const keep =
    yes ||
    !(await ask("کار قبلی از این مرورگر پاک می‌شود و برنمی‌گردد. پاک شود؟", { ok: "پاک شود", cancel: "بازیابی شود", danger: true, title: "شروع تازه" }));
  if (keep) {
    try {
      const rep = newRep(meta);
      for (const p of meta.pages)
        for (const pn of p.panels || [])
          if (pn?.image?.assetId) {
            const url = await Store.get("assets", pn.image.assetId);
            if (url) pn.image.dataUrl = url;
          }
      const pages = meta.pages.map(x => cleanPage(x, rep)),
        at = Math.round(num(meta.activeIndex, 0, 0, pages.length - 1));
      state.pages = pages;
      state.projectName = typeof meta.name === "string" ? meta.name.slice(0, 60) : "";
      state.activePageId = pages[at].id;
      state.selectedPanelId = null;
      state.selectedVertex = null;
      state.past = [];
      state.future = [];
      pages.forEach(p => p.panels.forEach(pn => pn.image && Store.saved.add(pn.image.assetId)));
      renderAll();
      const bits = loadReport(rep);
      showToast(bits.length ? `کار قبلی بازیابی شد. ${bits.join("؛ ")}.` : "کار قبلی بازیابی شد.");
    } catch {
      showToast("بازیابی ممکن نشد؛ پروژهٔ تازه باز است.");
    }
  } else {
    try {
      await Store.clearAll();
    } catch {}
  }
  autosaveEnabled = true;
  setSaveChip(Store.ok ? "idle" : "off");
  scheduleAutosave();
}
let toastTimer;
// Messages appear in the stage bar. Long ones stay longer; `undo` adds an undo button; `sticky` keeps the
// message until the next one.
function showToast(msg, opts = {}) {
  const o = opts === true ? { sticky: true } : opts;
  if (toastNote) {
    msg += " " + toastNote;
    toastNote = "";
  }
  clearTimeout(toastTimer);
  const text = $("#toastText"),
    undoBtn = $("#toastUndo");
  if (text) text.textContent = msg;
  else els.toast.textContent = msg;
  if (undoBtn) undoBtn.hidden = !o.undo;
  els.toast.title = msg;
  els.toast.classList.add("show");
  if (!o.sticky) toastTimer = setTimeout(() => els.toast.classList.remove("show"), clamp(2400 + msg.length * 45 + (o.undo ? 2500 : 0), 3200, 9000));
}
