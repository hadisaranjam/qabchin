// Narrow bridge between the offline editor and the web workspace.
function workspaceDocument() {
  const assets = Object.create(null);
  for (const pg of state.pages) for (const pn of pg.panels) if (pn.image) {
    if (!pn.image.assetId) pn.image.assetId = uid();
    assets[pn.image.assetId] = pn.image.dataUrl;
  }
  return {
    app: "comic-page-studio", version: FORMAT_VERSION, appVersion: APP_VERSION,
    name: state.projectName,
    activePage: Math.max(0, state.pages.findIndex(p => p.id === state.activePageId)),
    pages: JSON.parse(JSON.stringify(state.pages, (k, v) => k === "dataUrl" || k === "fitBasePoly" ? undefined : v)), assets
  };
}
function workspaceApply(input) {
  flushPending();
  if (!input || input.app !== "comic-page-studio" || !Array.isArray(input.pages) || !input.pages.length || input.pages.length > 300)
    throw new Error("پروژه معتبر نیست.");
  const doc = clone(input), rep = newRep(doc);
  for (const pg of doc.pages) for (const pn of pg.panels || []) if (pn?.image?.assetId && Object.hasOwn(doc.assets || {}, pn.image.assetId))
    pn.image.dataUrl = doc.assets[pn.image.assetId];
  const pages = doc.pages.map(p => cleanPage(p, rep));
  if (loadReport(rep).length) throw new Error("پروژه شامل دادهٔ ناسازگار است؛ ابتدا آن را از مسیر بازکردن فایل بررسی کنید.");
  state.pages = pages;
  state.activePageId = pages[Math.round(num(doc.activePage, 0, 0, pages.length - 1))].id;
  state.projectName = typeof doc.name === "string" ? doc.name.slice(0, 60) : "";
  state.selectedPanelId = null; state.selectedVertex = null;
  state.past = []; state.future = [];
  Store.lastJson = null;
  renderAll();
}
window.QabchinEditor = {
  document: workspaceDocument,
  apply: workspaceApply,
  blank() { return { app: "comic-page-studio", version: FORMAT_VERSION, appVersion: APP_VERSION, name: "", activePage: 0, pages: [newPage(1)], assets: {} }; },
  toast: showToast,
  ask,
  recoverLegacy: restoreOffer,
  startAutosave() { autosaveEnabled = true; scheduleAutosave(); },
  ready: null
};
