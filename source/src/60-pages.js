// صفحه‌ها و کتاب تازه
function addPage() {
  remember();
  const n = newPage(state.pages.length + 1),
    cur = page();
  n.preset = cur.preset;
  n.paper = cur.paper;
  n.gap = cur.gap;
  n.gutterStyle = cur.gutterStyle;
  n.gutterColor = cur.gutterColor;
  n.gutterAccent = cur.gutterAccent;
  n.gutterDetail = cur.gutterDetail;
  n.look = clone(cur.look || defaultLook());
  state.pages.push(n);
  state.activePageId = n.id;
  state.selectedPanelId = null;
  setEditorTab("page");
  renderAll();
}
function duplicatePage() {
  remember();
  const src = page(),
    c = clone(src);
  c.id = uid();
  c.panels.forEach(x => (x.id = uid()));
  delete c.lockLayout;
  state.pages.splice(state.pages.findIndex(x => x.id === src.id) + 1, 0, c);
  state.activePageId = c.id;
  state.selectedPanelId = c.panels[0]?.id || null;
  renderAll();
}
async function deletePage() {
  if (state.pages.length === 1) {
    if (page().panels.length && !(await ask("محتوای این صفحه پاک شود؟", { ok: "پاک شود", danger: true })))
      return;
    remember();
    state.pages = [newPage(1)];
    state.activePageId = state.pages[0].id;
    state.selectedPanelId = null;
    return renderAll();
  }
  if (!(await ask("این صفحه حذف شود؟", { ok: "حذف شود", danger: true }))) return;
  remember();
  const i = state.pages.findIndex(x => x.id === state.activePageId);
  state.pages.splice(i, 1);
  const p = state.pages[Math.min(i, state.pages.length - 1)];
  state.activePageId = p.id;
  state.selectedPanelId = p.panels[0]?.id || null;
  renderAll();
}
async function newProject() {
  if (
    (state.pages.length > 1 || state.pages.some(p => p.panels.length)) &&
    !(await ask(
      "کتاب کنونی از محیط ویرایش پاک و یک پروژهٔ خالی باز شود؟ با «واگرد» برمی‌گردد، ولی بهتر است پیش از آن پروژه را ذخیره کنید.",
      { ok: "کتاب تازه", danger: true }
    ))
  )
    return;
  remember();
  state.pages = [newPage(1)];
  state.activePageId = state.pages[0].id;
  state.selectedPanelId = null;
  state.templateCategory = "classic";
  state.lookScope = "page";
  setEditorTab("page");
  renderAll();
  showToast("کتاب تازه آماده است؛ اول قطع صفحه را انتخاب کنید.");
}
