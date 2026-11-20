// اتصال رویدادهای رابط
function openShortcuts() {
  const d = $("#shortcutsDialog");
  if (d && !d.open) d.showModal();
}
// Guides: a 3×3 grid (thirds) over the page; editor-only, never exported.
function toggleGuides(force) {
  state.guides = typeof force === "boolean" ? force : !state.guides;
  els.comicPage.classList.toggle("show-guides", state.guides);
  $("#guidesBtn")?.setAttribute("aria-pressed", String(state.guides));
  try {
    localStorage.setItem("comic-guides", state.guides ? "1" : "0");
  } catch {}
}
// "My layouts": geometry of pages the user liked, kept in this browser.
function myLayouts() {
  try {
    const list = JSON.parse(localStorage.getItem("comic-my-layouts") || "[]");
    return Array.isArray(list) ? list.filter(x => Array.isArray(x?.shapes) && x.shapes.length).slice(0, 12) : [];
  } catch {
    return [];
  }
}
function storeMyLayouts(list) {
  try {
    localStorage.setItem("comic-my-layouts", JSON.stringify(list));
    return true;
  } catch {
    showToast("این مرورگر اجازهٔ ذخیرهٔ قالب نمی‌دهد.");
    return false;
  }
}
function saveMyLayout() {
  const p = page();
  if (!p.panels.length) return showToast("اول قاب‌های صفحه را بسازید.");
  const list = myLayouts();
  if (list.length >= 12) return showToast("۱۲ قالب ذخیره شده است؛ یکی را حذف کنید.");
  list.push({ shapes: readingOrder(p).map(q => globalPolygon(q).map(v => v.map(n => Math.round(n * 1000) / 1000))) });
  if (!storeMyLayouts(list)) return;
  state.templateCategory = "mine";
  renderTemplateCategories();
  showToast("چیدمان این صفحه در «قالب‌های من» ذخیره شد.");
}
function renderMyLayouts() {
  const root = $("#myLayouts"),
    list = myLayouts();
  root.replaceChildren();
  if (!list.length) {
    const note = document.createElement("p");
    note.className = "hint";
    note.textContent = "هنوز قالبی ذخیره نکرده‌اید. صفحه را بچینید و «ذخیره در قالب‌های من» را بزنید.";
    return root.append(note);
  }
  list.forEach((item, i) => {
    const card = document.createElement("div"),
      use = document.createElement("button"),
      del = document.createElement("button"),
      label = `قالب ${fa(i + 1)} · ${fa(item.shapes.length)} قاب`;
    card.className = "my-layout";
    use.type = del.type = "button";
    use.className = "preset-card";
    use.innerHTML = `<svg viewBox="-2 -2 104 104" class="mini-saved" aria-hidden="true">${item.shapes.map(sh => `<polygon points="${sh.map(v => v.join(",")).join(" ")}"/>`).join("")}</svg><b>${label}</b>`;
    use.addEventListener("click", () => applySavedLayout(item.shapes));
    del.className = "icon-btn sm danger";
    del.setAttribute("aria-label", `حذف ${label}`);
    del.title = "حذف این قالب";
    del.innerHTML = ICONS.trash;
    del.addEventListener("click", async () => {
      if (!(await ask(`${label} از «قالب‌های من» حذف شود؟`, { ok: "حذف شود", danger: true }))) return;
      const next = myLayouts();
      next.splice(i, 1);
      storeMyLayouts(next);
      renderMyLayouts();
    });
    card.append(use, del);
    root.append(card);
  });
}
function bind() {
  $("#handleSizeRange").addEventListener("input", e => {
    state.handleSize = Number(e.target.value);
    $("#handleSizeValue").textContent = fa(state.handleSize);
    els.comicPage.style.setProperty("--vertex-size", `${state.handleSize}px`);
    try {
      localStorage.setItem("comic-handle-size", String(state.handleSize));
    } catch {}
  });
  $$("[data-editor-tab]").forEach(b =>
    b.addEventListener("click", () => setEditorTab(b.dataset.editorTab))
  );
  $$("[data-count]").forEach(b =>
    b.addEventListener("click", () => applyTemplate(page().lastTemplate || "grid", Number(b.dataset.count)))
  );
  $$("[data-template]").forEach(b =>
    b.addEventListener("click", () =>
      applyTemplate(b.dataset.template, page().panels.length || page().targetCount)
    )
  );
  $$("[data-add-shape]").forEach(b => {
    b.addEventListener("click", () => addFreePanel(b.dataset.addShape, b.dataset.size));
    b.addEventListener("dragstart", e =>
      e.dataTransfer.setData(
        "application/x-comic-frame",
        JSON.stringify({ shape: b.dataset.addShape, size: b.dataset.size })
      )
    );
  });
  $("#addGapPanelBtn").addEventListener("click", addPanelInGap);
  $("#expandPrompt").addEventListener("click", e => {
    const btn = e.target.closest("[data-expand]");
    if (!btn) return;
    const pn = page().panels.find(q => q.id === state.pendingExpansionPanelId);
    $("#expandPrompt").close();
    state.pendingExpansionPanelId = null;
    if (!pn || btn.dataset.expand === "none") return;
    remember();
    if (growPanel(page(), pn, btn.dataset.expand)) {
      page().isTiled = coverageOkay(page());
      page().boundaries = sharedEdges(page());
      renderAll();
      showToast("لبه‌های قاب تازه بدون هم‌پوشانی کشیده شدند.");
    }
  });
  els.comicPage.addEventListener("dragover", e => {
    const t = [...e.dataTransfer.types];
    if (t.includes("application/x-comic-frame") || t.includes("application/x-comic-image") || t.includes("Files")) {
      e.preventDefault();
      els.comicPage.classList.add("drop-target");
    }
  });
  els.comicPage.addEventListener("dragleave", () => els.comicPage.classList.remove("drop-target"));
  els.comicPage.addEventListener("drop", e => {
    const r0 = els.comicPage.getBoundingClientRect();
    if (e.dataTransfer.files?.length) {
      e.preventDefault();
      els.comicPage.classList.remove("drop-target");
      dropImages(
        e.dataTransfer.files,
        ((e.clientX - r0.left) / r0.width) * 100,
        ((e.clientY - r0.top) / r0.height) * 100
      );
      return;
    }
    const from = e.dataTransfer.getData("application/x-comic-image");
    if (from) {
      e.preventDefault();
      els.comicPage.classList.remove("drop-target");
      const target = panelAtPoint(page(), ((e.clientX - r0.left) / r0.width) * 100, ((e.clientY - r0.top) / r0.height) * 100);
      if (target) swapImages(from, target.id);
      return;
    }
    const raw = e.dataTransfer.getData("application/x-comic-frame");
    if (!raw) return;
    e.preventDefault();
    els.comicPage.classList.remove("drop-target");
    const data = JSON.parse(raw),
      r = els.comicPage.getBoundingClientRect();
    addFreePanel(
      data.shape,
      data.size,
      ((e.clientX - r.left) / r.width) * 100,
      ((e.clientY - r.top) / r.height) * 100
    );
  });
  $$(`[data-category-tab]`).forEach(b =>
    b.addEventListener("click", () => {
      state.templateCategory = b.dataset.categoryTab;
      renderTemplateCategories();
    })
  );
  $("#clearFramesBtn").addEventListener("click", clearFrames);
  $("#tidyFramesBtn").addEventListener("click", tidyFrames);
  $("#smartPuzzleBtn").addEventListener("click", smartPuzzle);
  $("#creativeReflowBtn").addEventListener("click", creativeReflow);
  $("#beginLayoutBtn").addEventListener("click", () => setEditorTab("layout"));
  $("#resetFrameShapeBtn").addEventListener("click", () => {
    const pn = panel();
    if (!pn || pn.locked) return;
    const snap = snapshot(),
      before = clonePanel(pn);
    pn.customPoly = null;
    pn.shape = "rect";
    pn.fitBasePoly = null;
    guardPanelEdit(page(), pn, before, snap);
  });
  els.toggleLockBtn.addEventListener("click", () => togglePanelLock());
  els.panelManager.addEventListener("click", e => {
    const btn = e.target.closest("button[data-action]"),
      id = btn?.closest("[data-panel-id]")?.dataset.panelId;
    if (!id) return;
    state.selectedPanelId = id;
    const action = btn.dataset.action;
    if (action === "lock") togglePanelLock(id);
    else if (action === "delete") deletePanel();
    else if (action === "random") randomizePanel();
    else if (action === "fit") fitPanelToNeighbors(id);
    else if (["left", "right", "up", "down"].includes(action)) nudgePanel(action);
    else renderAll();
  });
  // The magnet always switches on at once and never touches the current layout: it only limits later moves.
  $("#magnetToggle").addEventListener("change", e => {
    const p = page();
    remember();
    p.magnet = e.target.checked;
    renderAll();
    if (!p.magnet) return showToast("آهنربا خاموش شد؛ قاب‌ها می‌توانند روی هم بروند.");
    const pairs = p.panels.length ? diagnostics(p).pairs : 0;
    showToast(
      pairs
        ? `آهنربا روشن شد. ${fa(pairs)} هم‌پوشانیِ فعلی سر جایش ماند؛ با «رفع هم‌پوشانی» جدا می‌شود.`
        : "آهنربا روشن شد؛ قاب‌ها دیگر روی هم نمی‌افتند."
    );
  });
  $$("[data-frame-align]").forEach(b =>
    b.addEventListener("click", () => alignFrame(b.dataset.frameAlign))
  );
  $$("[data-frame-layer]").forEach(b =>
    b.addEventListener("click", () => reorderFrame(b.dataset.frameLayer))
  );
  $$("[data-image-align]").forEach(b =>
    b.addEventListener("click", () => alignImage(b.dataset.imageAlign))
  );
  const geometryBefore = new WeakMap();
  for (const [field, input] of Object.entries({ x: els.frameX, y: els.frameY, w: els.frameW, h: els.frameH })) {
    input.addEventListener("focus", () => geometryBefore.set(input, snapshot()));
    input.addEventListener("change", () => {
      const before = geometryBefore.get(input);
      geometryBefore.delete(input);
      updateGeometry(field, before || snapshot());
    });
  }
  els.shapeSelect.addEventListener("change", e => {
    const pn = panel();
    if (!pn || pn.locked) return;
    const snap = snapshot(),
      before = clonePanel(pn);
    pn.shape = e.target.value;
    pn.customPoly = null;
    pn.fitBasePoly = null;
    guardPanelEdit(page(), pn, before, snap);
  });
  $("#squareFrameBtn").addEventListener("click", () => {
    const pn = panel();
    if (!pn || pn.locked) return;
    const snap = snapshot(),
      before = clonePanel(pn),
      pr = PAGE_PRESETS[page().preset] || PAGE_PRESETS.vaziri,
      w = Math.min(pn.w, (pn.h * pr.height) / pr.width),
      h = (w * pr.width) / pr.height;
    pn.x = clamp(pn.x + (pn.w - w) / 2, 0, 100 - w);
    pn.y = clamp(pn.y + (pn.h - h) / 2, 0, 100 - h);
    pn.w = w;
    pn.h = h;
    pn.shape = "rect";
    pn.customPoly = null;
    pn.fitBasePoly = null;
    guardPanelEdit(page(), pn, before, snap);
  });
  $("#duplicateFrameBtn").addEventListener("click", duplicatePanel);
  $("#deleteFrameBtn").addEventListener("click", () => deletePanel());
  $("#selectedImageBtn").addEventListener("click", () => {
    if (!panel()) return showToast("اول یک قاب را انتخاب کنید.");
    els.selectedImageInput.click();
  });
  els.selectedImageInput.addEventListener(
    "change",
    e => e.target.files[0] && assignSelectedImage(e.target.files[0])
  );
  $("#batchImageBtn").addEventListener("click", () => els.batchImageInput.click());
  els.batchImageInput.addEventListener("change", e => assignBatch(e.target.files));
  $("#removeImageBtn").addEventListener("click", removeImage);
  els.fitSelect.addEventListener("change", e => {
    const pn = panel();
    if (!pn?.image) return;
    remember();
    pn.image.fit = e.target.value;
    pn.image.panMode = e.target.value === "smart" ? "auto" : "manual";
    if (["smart", "cover"].includes(e.target.value)) pn.image.zoom = Math.max(100, pn.image.zoom);
    renderAll();
  });
  tracked(els.zoomRange, e => {
    const pn = panel();
    if (!pn?.image) return;
    pn.image.zoom = Number(e.target.value);
    renderPage();
    renderControls();
  });
  $$("[data-nudge]").forEach(b => b.addEventListener("click", () => nudgeImage(b.dataset.nudge)));
  $$("[data-image-pan]").forEach(input => {
    tracked(input, () => {
      const im = panel()?.image;
      if (!im) return;
      im.panMode = "manual";
      im[input.dataset.imagePan] = Number(input.value);
      renderPage();
      renderControls();
    });
  });
  $("#resetImagePlacementBtn").addEventListener("click", () => {
    const im = panel()?.image;
    if (!im) return;
    remember();
    im.fit = "smart";
    im.zoom = 100;
    im.panMode = "auto";
    im.panX = 50;
    im.panY = 50;
    renderAll();
  });
  for (const [id, field] of [
    ["flipImageXBtn", "flipX"],
    ["flipImageYBtn", "flipY"]
  ])
    $("#" + id).addEventListener("click", () => {
      const im = panel()?.image;
      if (!im) return;
      remember();
      im[field] = !im[field];
      renderAll();
    });
  const setRotation = value => {
    const im = panel()?.image;
    if (!im) return;
    im.rotation = clamp(Math.round(Number(value) || 0), -180, 180);
    renderPage();
    renderControls();
  };
  const angleRange = $("#imageRotationRange");
  tracked(angleRange, e => setRotation(e.target.value));
  const angleNumber = $("#imageRotationNumber");
  tracked(angleNumber, e => {
    if (e.target.value !== "") setRotation(e.target.value);
  });
  for (const [id, delta] of [
    ["rotateLeftBtn", -90],
    ["rotateRightBtn", 90]
  ])
    $("#" + id).addEventListener("click", () => {
      const im = panel()?.image;
      if (!im) return;
      remember();
      im.rotation = (((Number(im.rotation) || 0) + delta + 540) % 360) - 180;
      renderAll();
    });
  $("#resetImageTransformBtn").addEventListener("click", () => {
    const im = panel()?.image;
    if (!im) return;
    remember();
    im.rotation = 0;
    im.flipX = false;
    im.flipY = false;
    renderAll();
  });
  $("#lookScope").addEventListener("change", e => {
    state.lookScope = e.target.value;
    renderLookControls();
  });
  $("#lookPreset").addEventListener("change", e => applyLookPreset(e.target.value));
  $$("[data-look-field]").forEach(input => {
    tracked(input, () => setLookField(input.dataset.lookField, input.value));
  });
  $("#syncPageLookBtn").addEventListener("click", () => {
    remember();
    page().panels.forEach(pn => {
      if (pn.image) pn.image.lookOverride = null;
    });
    state.lookScope = "page";
    renderAll();
    showToast("ظاهر همهٔ عکس‌های این صفحه یکسان شد.");
  });
  $("#syncBookLookBtn").addEventListener("click", () => {
    remember();
    const look = clone(normalizeLook(page().look));
    state.pages.forEach(p => {
      p.look = clone(look);
      p.panels.forEach(pn => {
        if (pn.image) pn.image.lookOverride = null;
      });
    });
    state.lookScope = "page";
    renderAll();
    showToast("ظاهر همهٔ عکس‌های کتاب با این صفحه هماهنگ شد.");
  });
  tracked(els.gapRange, e => {
    page().gap = Number(e.target.value);
    els.gapValue.textContent = gapLabel(page(), page().gap);
    renderGutters();
    renderControls();
  });
  els.gutterStyle.addEventListener("change", e => {
    remember();
    page().gutterStyle = e.target.value;
    renderAll();
  });
  tracked(els.gutterColor, e => {
    page().gutterColor = e.target.value;
    els.gutterColorValue.textContent = e.target.value;
    renderGutters();
  });
  els.gutterColor.addEventListener("change", renderAll);
  tracked($("#gutterAccent"), e => {
    page().gutterAccent = e.target.value;
    $("#gutterAccentValue").textContent = e.target.value;
    renderGutters();
  });
  $("#gutterAccent").addEventListener("change", renderAll);
  tracked($("#gutterDetail"), e => {
    page().gutterDetail = Number(e.target.value);
    $("#gutterDetailValue").textContent = `${fa(page().gutterDetail)}٪`;
    renderGutters();
  });
  els.pagePreset.addEventListener("change", e => {
    remember();
    page().preset = e.target.value;
    renderAll();
  });
  $$("[data-color]").forEach(b =>
    b.addEventListener("click", () => {
      remember();
      page().paper = b.dataset.color;
      renderAll();
    })
  );
  els.paperColor.addEventListener("change", e => {
    remember();
    page().paper = e.target.value;
    renderAll();
  });
  $("#stageZoomOut").addEventListener("click", () => zoomBy(-0.08));
  $("#stageZoomIn").addEventListener("click", () => zoomBy(0.08));
  $("#stageZoomFit").addEventListener("click", fitZoom);
  bindPinch($("#canvasScroller"));
  $("#canvasScroller").addEventListener(
    "wheel",
    e => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 0.06 : -0.06, e.clientX, e.clientY);
    },
    { passive: false }
  );
  $("#addPageBtn").addEventListener("click", addPage);
  $("#duplicatePageBtn").addEventListener("click", duplicatePage);
  $("#deletePageBtn").addEventListener("click", deletePage);
  els.undoBtn.addEventListener("click", undo);
  els.redoBtn.addEventListener("click", redo);
  $("#saveProjectBtn").addEventListener("click", saveProject);
  $("#newProjectBtn").addEventListener("click", newProject);
  $("#guideBtn").addEventListener("click", openShortcuts);
  $("#loadProjectBtn").addEventListener("click", () => els.projectInput.click());
  els.projectInput.addEventListener("change", e => e.target.files[0] && openProject(e.target.files[0]));
  const openExport = () => {
    exportStatus("");
    cancelPreview();
    renderPreflight();
    if (!els.exportDialog.open) els.exportDialog.showModal();
  };
  for (const id of ["exportBtn", "exportStepBtn", "exportFromTabBtn"]) $("#" + id).addEventListener("click", openExport);
  $("#toImagesBtn").addEventListener("click", () => setEditorTab("image"));
  $("#emptyMoreBtn").addEventListener("click", () => setEditorTab("layout"));
  $$("[data-quick]").forEach(b =>
    b.addEventListener("click", async () => {
      if (await applyTemplate(b.dataset.quick, Number(b.dataset.quickCount))) setEditorTab("layout");
    })
  );
  $("#frameControls").addEventListener("click", e => {
    const action = e.target.closest("[data-frame-action]")?.dataset.frameAction,
      pn = panel();
    if (!action || !pn) return;
    if (action === "random") randomizePanel();
    else nudgePanel(action);
  });
  $("#guidesBtn").addEventListener("click", () => toggleGuides());
  try {
    if (localStorage.getItem("comic-guides") === "1") toggleGuides(true);
  } catch {}
  // On narrow screens the file actions fold into a "more" menu.
  const more = $("#moreBtn"),
    fileActions = $("#fileActions"),
    closeMenu = () => {
      fileActions.classList.remove("open");
      more.setAttribute("aria-expanded", "false");
    };
  more.addEventListener("click", e => {
    e.stopPropagation();
    const open = !fileActions.classList.contains("open");
    fileActions.classList.toggle("open", open);
    more.setAttribute("aria-expanded", String(open));
    if (open) fileActions.querySelector("button")?.focus();
  });
  fileActions.addEventListener("click", e => e.target.closest("button") && closeMenu());
  document.addEventListener("pointerdown", e => !e.target.closest("#fileActions,#moreBtn") && closeMenu());
  fileActions.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      closeMenu();
      more.focus();
    }
  });
  // ───── v26 controls ─────
  $("#snapToggle").addEventListener("change", e => {
    state.snap = e.target.checked;
    try {
      localStorage.setItem("comic-snap", state.snap ? "1" : "0");
    } catch {}
  });
  $("#fixOverlapsBtn").addEventListener("click", fixOverlaps);
  $("#previewApply").addEventListener("click", applyPreview);
  $("#previewCancel").addEventListener("click", cancelPreview);
  $("#previewAgain").addEventListener("click", () => state.preview?.again?.());
  $$("[data-layout-style]").forEach(b =>
    b.addEventListener("click", async () => {
      const p = page(),
        style = b.dataset.layoutStyle;
      if (p.layoutStyle === style) return;
      if (p.panels.length && !p.panels.some(q => q.locked)) await applyTemplate(p.lastTemplate || "grid", p.panels.length, { force: true, style });
      else p.layoutStyle = style;
      renderControls();
    })
  );
  $("#variantBtn").addEventListener("click", () => {
    const p = page();
    if (!p.panels.length) return showToast("اول یک چیدمان بسازید.");
    if (p.layoutStyle !== "hand" && p.lastTemplate !== "random")
      return showToast("چیدمان منظم فقط یک شکل دارد؛ برای نسخه‌های گوناگون «دست‌ساز» را بزنید.");
    applyTemplate(p.lastTemplate || "grid", p.panels.length, { reseed: true });
  });
  $$("[data-variety]").forEach(b =>
    b.addEventListener("click", () => {
      state.varietyStrength = Number(b.dataset.variety);
      renderControls();
    })
  );
  $$("[data-split]").forEach(b => b.addEventListener("click", () => splitPanel(b.dataset.split)));
  $("#mergeFrameBtn").addEventListener("click", mergeWithNeighbor);
  $$("[data-ratio]").forEach(b =>
    b.addEventListener("click", () => {
      const [w, h] = b.dataset.ratio.split(":").map(Number);
      setFrameRatio(w, h);
    })
  );
  const lockAll = on => {
    const p = page();
    if (!p.panels.length || p.panels.every(q => !!q.locked === on)) return showToast(on ? "همهٔ قاب‌ها قفل‌اند." : "هیچ قابی قفل نیست.");
    remember();
    p.panels.forEach(q => (q.locked = on));
    renderAll();
    showToast(on ? "همهٔ قاب‌ها قفل شدند؛ حالا با خیال راحت تصویرها را بچینید." : "قفل همهٔ قاب‌ها باز شد.", { undo: true });
  };
  $("#lockAllBtn").addEventListener("click", () => lockAll(true));
  $("#unlockAllBtn").addEventListener("click", () => lockAll(false));
  $("#orderBtn").addEventListener("click", startOrderMode);
  $("#autoOrderBtn").addEventListener("click", autoOrder);
  $("#showOrderBtn").addEventListener("click", () => {
    state.showOrder = !state.showOrder;
    renderAll();
  });
  $("#saveLayoutBtn").addEventListener("click", saveMyLayout);
  $("#swapSelect").addEventListener("change", e => {
    const other = e.target.value;
    e.target.value = "";
    if (other) swapImages(state.selectedPanelId, other);
  });
  $("#toastUndo").addEventListener("click", () => {
    els.toast.classList.remove("show");
    undo();
  });
  $("#diagChip").addEventListener("click", () => setEditorTab("layout"));
  const nameInputs = [$("#projectName"), $("#exportName")];
  nameInputs.forEach(input =>
    input.addEventListener("input", () => {
      state.projectName = input.value.slice(0, 60);
      nameInputs.forEach(x => x !== input && (x.value = state.projectName));
      scheduleAutosave();
    })
  );
  $("#exportScope").addEventListener("change", renderPreflight);
  $("#exportEmpty").addEventListener("change", e => {
    state.exportEmpty = e.target.value;
    try {
      localStorage.setItem("comic-export-empty", state.exportEmpty);
    } catch {}
  });
  try {
    state.exportEmpty = localStorage.getItem("comic-export-empty") === "dark" ? "dark" : "paper";
  } catch {
    state.exportEmpty = "paper";
  }
  $("#exportEmpty").value = state.exportEmpty;
  tracked($("#pageBorderRange"), e => {
    page().pageBorder = Number(e.target.value);
    $("#pageBorderValue").textContent = gapLabel(page(), page().pageBorder);
    renderGutters();
  });
  $("#downloadPngBtn").addEventListener("click", downloadPng);
  $("#printBookBtn").addEventListener("click", printBook);
  $(".canvas-scroller").addEventListener("pointerdown", e => {
    if (e.target.closest(".frame-shell, .handle, .frame-toolbar") || state.preview) return;
    if (state.selectedPanelId) {
      state.selectedPanelId = null;
      renderAll();
    }
  });
  document.addEventListener(
    "keydown",
    e => {
      const mod = e.ctrlKey || e.metaKey,
        key = e.key.toLowerCase(),
        ae = document.activeElement,
        textual =
          !!ae &&
          ((ae.tagName === "INPUT" && /^(text|number|search|tel|url|email|password)$/i.test(ae.type)) ||
            ae.tagName === "TEXTAREA" ||
            ae.isContentEditable);
      // A modal dialog owns the keyboard: shortcuts must not change the project behind it.
      if ([...document.querySelectorAll("dialog")].some(d => d.open)) return;
      if (mod && key === "z" && !textual) {
        e.preventDefault();
        e.stopPropagation();
        e.shiftKey ? redo() : undo();
        return;
      }
      if (mod && key === "y" && !textual) {
        e.preventDefault();
        e.stopPropagation();
        redo();
        return;
      }
      if (mod && key === "s") {
        e.preventDefault();
        saveProject();
        return;
      }
      if (state.preview && (e.key === "Enter" || e.key === "Escape")) {
        e.preventDefault();
        e.stopPropagation();
        e.key === "Enter" ? applyPreview() : cancelPreview();
        return;
      }
      if (e.key === "Escape") {
        if (state.orderMode) {
          state.orderMode = null;
          renderAll();
          showToast("ترتیب خوانش عوض نشد.");
        } else if (state.selectedPanelId) {
          state.selectedPanelId = null;
          renderAll();
        }
        return;
      }
      if (
        /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) ||
        document.activeElement.isContentEditable
      )
        return;
      if (!mod && !e.altKey) {
        if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
          e.preventDefault();
          openShortcuts();
          return;
        }
        if (e.key === "+" || e.key === "=") return zoomBy(0.08);
        if (e.key === "-") return zoomBy(-0.08);
        if (e.key === "0") return fitZoom();
        const step = { 1: "page", 2: "layout", 3: "image", "۱": "page", "۲": "layout", "۳": "image" }[e.key];
        if (step) return setEditorTab(step);
        if (key === "g" || e.key === "گ") return toggleGuides();
      }
      const inPageRail = !!document.activeElement.closest?.(".pages-rail");
      if ((e.key === "Delete" || e.key === "Backspace") && inPageRail) {
        e.preventDefault();
        deletePage();
        return;
      }
      const pn = panel();
      if ((e.key === "Delete" || e.key === "Backspace") && pn) {
        e.preventDefault();
        if (state.editorTab === "image") removeImage();
        else if (state.editorTab === "layout") deletePanel();
        return;
      }
      if (
        state.editorTab === "layout" &&
        pn &&
        !pn.locked &&
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
      ) {
        e.preventDefault();
        const dir = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" }[e.key];
        nudgePanel(dir, e.shiftKey ? 0.2 : mod ? 5 : 1);
        return;
      }
      if (state.editorTab === "layout" && pn) {
        if (mod && key === "d") {
          e.preventDefault();
          duplicatePanel();
        } else if (!mod && (key === "l" || e.key === "م")) togglePanelLock();
      }
    },
    true
  );
  // Window resize, rotation and panel resizing all funnel into one render per frame.
  let layoutFrame = 0;
  const scheduleLayout = () => {
    if (layoutFrame) return;
    layoutFrame = requestAnimationFrame(() => {
      layoutFrame = 0;
      renderPage();
    });
  };
  window.addEventListener("resize", scheduleLayout);
  if ("ResizeObserver" in window) new ResizeObserver(scheduleLayout).observe($("#canvasScroller"));
  $("#addVertexBtn").addEventListener("click", () => addVertex());
  $("#removeVertexBtn").addEventListener("click", () => removeVertex());
  const movePage = d => {
    const i = state.pages.findIndex(x => x.id === state.activePageId),
      j = i + d;
    if (j < 0 || j >= state.pages.length)
      return showToast(d < 0 ? "این صفحه همین حالا اول کتاب است." : "این صفحه همین حالا آخر کتاب است.");
    remember();
    [state.pages[i], state.pages[j]] = [state.pages[j], state.pages[i]];
    renderAll();
    showToast(`صفحه به جای ${fa(j + 1)} رفت.`);
  };
  $("#movePageUpBtn").addEventListener("click", () => movePage(-1));
  $("#movePageDownBtn").addEventListener("click", () => movePage(1));
  window.addEventListener("dragover", e => {
    if (e.dataTransfer?.types?.includes("Files")) e.preventDefault();
  });
  window.addEventListener("drop", e => {
    if (e.dataTransfer?.types?.includes("Files")) e.preventDefault();
  });
  window.addEventListener("beforeunload", e => {
    if (needsUnloadWarning()) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
}
function panelAtPoint(p, x, y) {
  return [...drawOrder(p)].reverse().find(pn => pointInPolygon([x, y], globalPolygon(pn))) || null;
}
async function dropImages(files, x, y) {
  const list = [...files].filter(isImageFile);
  if (!list.length) return showToast("فقط تصویر JPG، PNG یا WebP پذیرفته می‌شود.");
  const p = page();
  if (!p.panels.length) return showToast("اول قاب‌های صفحه را بسازید.");
  const target = panelAtPoint(p, x, y);
  if (target && list.length === 1) {
    state.selectedPanelId = target.id;
    return assignSelectedImage(list[0]);
  }
  return assignBatch(files);
}
function registerWebMcp() {
  const c = document.modelContext;
  if (!c?.registerTool) return;
  const ctrl = new AbortController(),
    reg = t => {
      try {
        Promise.resolve(c.registerTool(t, { signal: ctrl.signal })).catch(() => {});
      } catch {}
    };
  reg({
    name: "create_comic_frame_layout",
    title: "ساخت قاب‌بندی کمیک",
    description: "برای صفحهٔ فعال بین ۱ تا ۶ قابِ کاملاً پوشاننده می‌سازد.",
    inputSchema: {
      type: "object",
      properties: {
        count: { type: "integer", minimum: 1, maximum: 6 },
        template: {
          type: "string",
          enum: [
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
          ]
        }
      },
      required: ["count", "template"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    async execute(input) {
      if (!input || !Number.isInteger(input.count) || input.count < 1 || input.count > 6)
        throw new Error("تعداد قاب باید بین ۱ تا ۶ باشد.");
      if (!TEMPLATE_KEYS.includes(input.template)) throw new Error("نام قالب شناخته‌شده نیست.");
      if (!(await applyTemplate(input.template, input.count)))
        throw new Error("قالب اعمال نشد؛ قاب‌های قفل‌شده را باز کنید یا تأیید را بپذیرید.");
      return { count: page().panels.length, template: input.template };
    }
  });
  reg({
    name: "smart_fit_comic_frames",
    title: "مرتب‌سازی دقیق قاب‌ها",
    description: "چیدمان فعلی و قاب مرجع را حفظ می‌کند و ضلع‌های همسایه را با آن مچ می‌کند.",
    inputSchema: {
      type: "object",
      properties: { gap: { type: "integer", minimum: 0, maximum: 18 } },
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute(input = {}) {
      if (input.gap !== undefined) {
        if (!Number.isInteger(input.gap) || input.gap < 0 || input.gap > 18)
          throw new Error("ضخامت مرز معتبر نیست.");
        remember();
        page().gap = input.gap;
      }
      tidyFrames({ direct: true });
      return { panels: page().panels.length, gap: page().gap, complete: coverageOkay(page()) };
    }
  });
}
