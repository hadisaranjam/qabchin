// رندر بوم، مرزها، فهرست صفحه‌ها و کنترل‌های ستون ابزار
const ZOOM_MIN = 0.1,
  ZOOM_MAX = 3;
// Until the user zooms, the page always fills the stage ("fit"); afterwards stageZoom is kept.
function syncPageSize() {
  const p = page(),
    pr = PAGE_PRESETS[p.preset] || PAGE_PRESETS.a4,
    base = pageBase(pr),
    scroller = $("#canvasScroller"),
    cs = getComputedStyle(scroller),
    padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) + 8,
    padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0) + 8,
    fit = Math.min(
      (scroller.clientWidth - padX) / base,
      (scroller.clientHeight - padY) / ((base * pr.height) / pr.width)
    ),
    zoom =
      !state.userZoomed && Number.isFinite(fit) && fit > 0
        ? clamp(fit, ZOOM_MIN, ZOOM_MAX)
        : clamp(state.stageZoom, ZOOM_MIN, ZOOM_MAX),
    width = Math.max(1, Math.round(base * zoom)),
    height = Math.max(1, Math.round((width * pr.height) / pr.width));
  els.comicPage.style.width = `${width}px`;
  els.comicPage.style.height = `${height}px`;
  els.stageZoomValue.textContent = `${fa(Math.round(zoom * 100))}٪`;
  state.pageSize = { width, height };
  return state.pageSize;
}
function currentZoom() {
  return state.pageSize.width / pageBase(PAGE_PRESETS[page().preset] || PAGE_PRESETS.vaziri);
}
// Zooms around a screen point (pinch centre, mouse) so the same spot of the page stays under it.
function setZoom(z, cx = null, cy = null) {
  const scroller = $("#canvasScroller"),
    r0 = els.comicPage.getBoundingClientRect(),
    fx = cx == null ? 0.5 : (cx - r0.left) / r0.width,
    fy = cy == null ? 0.5 : (cy - r0.top) / r0.height;
  state.stageZoom = clamp(z, ZOOM_MIN, ZOOM_MAX);
  state.userZoomed = true;
  renderPage();
  if (cx == null) return;
  const r1 = els.comicPage.getBoundingClientRect();
  scroller.scrollLeft += r1.left + fx * r1.width - cx;
  scroller.scrollTop += r1.top + fy * r1.height - cy;
}
function zoomBy(d, cx = null, cy = null) {
  setZoom(currentZoom() + d, cx, cy);
}
function fitZoom() {
  state.userZoomed = false;
  renderPage();
}
function edgeList(p) {
  return sharedEdges(p).filter(
    e =>
      ![
        [0, 0],
        [0, 1],
        [1, 0],
        [1, 1]
      ].some(
        ([axis, which]) =>
          Math.abs(e.a[axis] - which * 100) < 0.08 && Math.abs(e.b[axis] - which * 100) < 0.08
      )
  );
}
function svgLine(a, b, cls, attrs = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", "line");
  el.setAttribute("x1", a[0]);
  el.setAttribute("y1", a[1]);
  el.setAttribute("x2", b[0]);
  el.setAttribute("y2", b[1]);
  el.setAttribute("class", cls);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}
function jaggedPoints(edge, idx, amp = 0.45) {
  const dx = edge.b[0] - edge.a[0],
    dy = edge.b[1] - edge.a[1],
    len = Math.hypot(dx, dy) || 1,
    nx = -dy / len,
    ny = dx / len,
    count = Math.max(2, Math.round(len / 5));
  return Array.from({ length: count + 1 }, (_, i) => {
    const t = i / count,
      j = i === 0 || i === count ? 0 : Math.sin((idx + 1) * 31 + i * 7.7) * amp;
    return [edge.a[0] + dx * t + nx * j, edge.a[1] + dy * t + ny * j];
  });
}
function svgPolyline(points, attrs) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  el.setAttribute("points", points.map(p => p.join(",")).join(" "));
  el.setAttribute("class", "gutter-jagged");
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}
// Sides of frames that no other frame shares (a frame standing alone, or the open part of a longer side).
// Sides lying on the page edge are left out; the page border option draws those.
function freeEdges(p) {
  const shared = sharedEdges(p),
    out = [];
  for (const pn of p.panels) {
    const poly = globalPolygon(pn);
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length],
        len = pointDistance(a, b);
      if (len < 0.3) return;
      if ([0, 1].some(ax => [0, 100].some(v => Math.abs(a[ax] - v) < 0.08 && Math.abs(b[ax] - v) < 0.08))) return;
      const cover = [];
      for (const s of shared) {
        const h1 = projectPoint(s.a, a, b),
          h2 = projectPoint(s.b, a, b);
        if (h1.dist < 0.08 && h2.dist < 0.08 && Math.abs(h1.t - h2.t) * len > 0.05) cover.push([Math.min(h1.t, h2.t), Math.max(h1.t, h2.t)]);
      }
      cover.sort((x, y) => x[0] - y[0]);
      const at = t => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      let t = 0;
      for (const [s, e] of cover) {
        if ((s - t) * len > 0.3) out.push({ a: at(t), b: at(s) });
        t = Math.max(t, e);
      }
      if ((1 - t) * len > 0.3) out.push({ a: at(t), b: at(1) });
    });
  }
  return out;
}
function gutterPrims(p, W, H, k) {
  const gap = Number(p.gap) || 0,
    border = Number(p.pageBorder) || 0;
  if (!gap && !border) return [];
  const style = p.gutterStyle || "simpleWhite",
    color =
      style === "simpleWhite"
        ? "#ffffff"
        : style === "simpleBlack"
          ? "#090b0e"
          : p.gutterColor || "#ffffff",
    accent = p.gutterAccent || "#0e1723",
    detail = (p.gutterDetail ?? 50) / 100,
    g = gap * k,
    out = [];
  // shared borders between frames, then the open sides of frames that stand alone
  (gap ? [...edgeList(p), ...freeEdges(p)] : []).forEach((e, idx) => {
    const a = [(e.a[0] / 100) * W, (e.a[1] / 100) * H],
      b = [(e.b[0] / 100) * W, (e.b[1] / 100) * H],
      dx = b[0] - a[0],
      dy = b[1] - a[1],
      len = Math.hypot(dx, dy) || 1,
      nx = -dy / len,
      ny = dx / len,
      pct = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
    const L = (s, t, w, c, dash = null) => out.push({ t: "line", pts: [s, t], w, c, dash }),
      mark = (step, r, w, c) => {
        for (let d = 3; d < pct; d += step) {
          const f = d / pct,
            x = a[0] + dx * f,
            y = a[1] + dy * f;
          L([x - nx * r, y - ny * r], [x + nx * r, y + ny * r], w, c);
        }
      };
    if (style === "simpleWhite" || style === "simpleBlack" || style === "simpleColor") L(a, b, g, color);
    else if (style === "doubleComic") {
      L(a, b, g + 2.5 * k, accent);
      L(a, b, Math.max(k, g), color);
    } else if (style === "proHatch") {
      L(a, b, g + k, color);
      mark(6 - detail * 2.8, (0.18 + detail * 0.3) * 5.48 * k, Math.max(0.4 * k, g * 0.1), accent);
    } else if (style === "inkCut")
      out.push({
        t: "poly",
        pts: jaggedPoints(e, idx, 0.06 + detail * 0.22).map(v => [(v[0] / 100) * W, (v[1] / 100) * H]),
        w: g,
        c: color,
        dash: null
      });
    else if (style === "rail") {
      L(a, b, g + 2 * k, accent);
      L(a, b, Math.max(0.8 * k, g * 0.46), color);
    } else if (style === "dash")
      L(a, b, g, color, [(5 + (p.gutterDetail ?? 50) / 20) * k, (2 + (p.gutterDetail ?? 50) / 35) * k]);
    else if (style === "energy") {
      L(a, b, g, color);
      mark(9 - detail * 3, (0.15 + detail * 0.25) * 5.48 * k, Math.max(0.6 * k, g * 0.28), accent);
    }
  });
  if (border) {
    const w = border * k * 2;
    for (const pts of [
      [
        [0, 0],
        [W, 0]
      ],
      [
        [W, 0],
        [W, H]
      ],
      [
        [W, H],
        [0, H]
      ],
      [
        [0, H],
        [0, 0]
      ]
    ])
      out.push({ t: "line", pts, w, c: color, dash: null });
  }
  return out;
}
function renderGutters() {
  const p = page(),
    size = state.pageSize,
    pr = PAGE_PRESETS[p.preset] || PAGE_PRESETS.vaziri,
    ns = "http://www.w3.org/2000/svg";
  els.gutterLayer.replaceChildren();
  els.gutterLayer.setAttribute("viewBox", `0 0 ${size.width} ${size.height}`);
  for (const q of gutterPrims(p, size.width, size.height, size.width / pageBase(pr))) {
    const el = document.createElementNS(ns, q.t === "line" ? "line" : "polyline");
    if (q.t === "line") {
      el.setAttribute("x1", q.pts[0][0]);
      el.setAttribute("y1", q.pts[0][1]);
      el.setAttribute("x2", q.pts[1][0]);
      el.setAttribute("y2", q.pts[1][1]);
    } else el.setAttribute("points", q.pts.map(v => v.join(",")).join(" "));
    el.setAttribute("stroke", q.c);
    el.setAttribute("stroke-width", q.w);
    el.setAttribute("fill", "none");
    el.setAttribute("stroke-linejoin", "round");
    if (q.dash) el.setAttribute("stroke-dasharray", q.dash.join(" "));
    el.setAttribute("class", "gutter-main");
    els.gutterLayer.append(el);
  }
}
function paintGutters(ctx, prims) {
  for (const q of prims) {
    ctx.save();
    ctx.strokeStyle = q.c;
    ctx.lineWidth = q.w;
    ctx.lineJoin = "round";
    ctx.lineCap = "butt";
    ctx.setLineDash(q.dash || []);
    ctx.beginPath();
    q.pts.forEach((v, i) => (i ? ctx.lineTo(v[0], v[1]) : ctx.moveTo(v[0], v[1])));
    ctx.stroke();
    ctx.restore();
  }
}
const SVG_NS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}
// Effective print resolution of the image in a frame, after fit and zoom.
function effectiveDpi(p, pn) {
  if (!pn.image) return null;
  const pr = PAGE_PRESETS[p.preset] || PAGE_PRESETS.vaziri,
    pw = (pn.w / 100) * pr.width,
    ph = (pn.h / 100) * pr.height,
    pl = mediaPlacement(pn.image, pw, ph),
    scale = Math.max(pl.drawW / pn.image.width, pl.drawH / pn.image.height);
  return (p.preset === "webtoon" ? 96 : 300) / Math.max(scale, 1e-6);
}
// Gaps and overlaps of a page, for the live markers on the stage. Cached by geometry.
const diagCache = { key: "", value: null };
function diagnostics(p) {
  const key = p.id + "#" + geoSig(p);
  if (diagCache.key === key) return diagCache.value;
  const polys = p.panels.map(globalPolygon),
    overlaps = [];
  let pairs = 0;
  for (let i = 0; i < polys.length; i++)
    for (let j = i + 1; j < polys.length; j++) {
      if (intersectionArea(polys[i], polys[j]) < 0.0005) continue;
      const ta = triangulate(polys[i]),
        tb = triangulate(polys[j]);
      pairs++;
      if (!ta || !tb) continue;
      for (const x of ta)
        for (const y of tb) {
          let cut = x;
          for (let s = 0; s < 3 && cut.length >= 3; s++) cut = halfClip(cut, y[s], y[(s + 1) % 3], true);
          if (cut.length >= 3 && polyArea(cut) > 0.0005) overlaps.push(cut);
        }
    }
  const cells = polys.length ? freeCells(polys) : null,
    groups = cells ? cellComponents(cells.filter(c => polyArea(c) > 0.02)).filter(g => cellsArea(g) > 0.5) : [],
    gapCells = groups.flat(),
    value = { overlaps, pairs, gapCells, gapCount: groups.length, gapArea: cellsArea(gapCells) };
  diagCache.key = key;
  diagCache.value = value;
  return value;
}
function renderDiagnostics() {
  const layer = $("#diagLayer"),
    chip = $("#diagChip"),
    p = page();
  layer.replaceChildren();
  const busy = !!state.drag || !!state.preview,
    d = busy || !p.panels.length ? null : diagnostics(p);
  if (chip) {
    const bits = [];
    if (d?.pairs) bits.push(`${fa(d.pairs)} هم‌پوشانی`);
    if (d?.gapCount) bits.push(d.gapArea >= 4000 ? `${fa(Math.round(d.gapArea / 100))}٪ صفحه خالی` : `${fa(d.gapCount)} شکاف`);
    chip.hidden = !bits.length;
    chip.textContent = bits.join(" · ");
    chip.dataset.kind = d?.pairs ? "overlap" : "gap";
  }
  if (!d || state.editorTab !== "layout") return;
  layer.setAttribute("viewBox", "0 0 100 100");
  const draw = (cells, cls) => cells.forEach(c => layer.append(svgEl("polygon", { points: c.map(v => v.join(",")).join(" "), class: cls })));
  if (d.gapArea < 4000) draw(d.gapCells, "diag-gap");
  draw(d.overlaps, "diag-overlap");
}
function renderPage() {
  const p = page(),
    size = syncPageSize(),
    focused = document.activeElement?.classList?.contains("frame-shell") ? document.activeElement.dataset.panelId : null,
    picked = state.orderMode?.picked || null;
  els.comicPage.style.backgroundColor = p.paper;
  els.comicPage.classList.toggle("editor-image", state.editorTab === "image");
  els.comicPage.classList.toggle("editing-panel", state.editorTab === "layout" && !!state.selectedPanelId && !state.preview);
  els.comicPage.classList.toggle("previewing", !!state.preview);
  els.comicPage.classList.toggle("ordering", !!picked);
  els.emptyState.hidden = !!p.panels.length;
  els.framesLayer.replaceChildren();
  const liveImages = new Set();
  drawOrder(p).forEach((pn, stackIndex) => {
    const index = panelNumber(pn.id, p) - 1,
      box = {
        x: (pn.x / 100) * size.width,
        y: (pn.y / 100) * size.height,
        w: (pn.w / 100) * size.width,
        h: (pn.h / 100) * size.height
      },
      poly = shapePolygon(pn),
      selected = pn.id === state.selectedPanelId,
      shell = document.createElement("div");
    shell.className = `frame-shell${selected ? " selected" : ""}${state.editorTab === "image" ? " image-drag" : ""}${pn.locked ? " locked" : ""}`;
    shell.dataset.panelId = pn.id;
    shell.tabIndex = 0;
    shell.setAttribute("role", "button");
    shell.setAttribute("aria-pressed", String(selected));
    shell.setAttribute("aria-label", `قاب ${fa(index + 1)}، ${pn.image ? "تصویر دارد" : "بدون تصویر"}${pn.locked ? "، قفل" : ""}`);
    shell.style.cssText = `left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;z-index:${selected && state.editorTab === "layout" ? 20 : stackIndex + 1}`;
    const frame = document.createElement("div");
    frame.className = "comic-frame";
    frame.style.clipPath = polygonCss(poly);
    if (pn.image) {
      const img = frameImage(pn),
        pl = mediaPlacement(pn.image, box.w, box.h);
      liveImages.add(pn.id);
      frame.style.background = p.paper;
      img.alt = `تصویر قاب ${fa(index + 1)}`;
      img.style.cssText = `width:${pl.drawW}px;height:${pl.drawH}px;left:${pl.x}px;top:${pl.y}px;transform:${imageTransform(pn.image, pl)};filter:${lookFilter(effectiveLook(p, pn))}`;
      frame.append(img);
    } else if (state.editorTab === "image") {
      const empty = document.createElement("button");
      empty.type = "button";
      empty.tabIndex = -1;
      empty.className = "frame-placeholder image-picker";
      empty.setAttribute("aria-label", `افزودن تصویر به قاب ${fa(index + 1)}`);
      empty.innerHTML = `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><small>افزودن تصویر</small>`;
      empty.addEventListener("pointerdown", e => e.stopPropagation());
      empty.addEventListener("click", e => {
        e.stopPropagation();
        state.selectedPanelId = pn.id;
        renderAll();
        els.selectedImageInput.click();
      });
      frame.append(empty);
    } else {
      const empty = document.createElement("div");
      empty.className = "frame-placeholder layout-placeholder";
      empty.innerHTML = `<small>قاب خالی</small>`;
      frame.append(empty);
    }
    // number badge and the print-quality dot sit at the centre-top of the frame's own outline
    const spot = lockBadgePosition(poly),
      badge = document.createElement("span");
    badge.className = "panel-number";
    badge.textContent = picked ? (picked.includes(pn.id) ? fa(picked.indexOf(pn.id) + 1) : "؟") : fa(index + 1);
    if (picked?.includes(pn.id)) badge.classList.add("picked");
    const dpi = effectiveDpi(p, pn);
    if (dpi !== null && dpi < 220 && p.preset !== "webtoon") {
      badge.classList.add(dpi < 150 ? "low" : "mid");
      badge.title = `کیفیت چاپ این تصویر حدود ${fa(Math.round(dpi))}dpi است؛ برای چاپ خوب تصویر بزرگ‌تری بیاورید یا بزرگ‌نمایی را کم کنید.`;
    }
    frame.append(badge);
    shell.append(frame);
    if (pn.locked) {
      const lock = document.createElement("span");
      lock.className = "panel-lock";
      lock.innerHTML = ICONS.lock;
      lock.title = "قاب قفل است";
      lock.style.left = `${spot[0] * 100}%`;
      lock.style.top = `${spot[1] * 100}%`;
      shell.append(lock);
    }
    shell.addEventListener("pointerdown", e => beginDrag(e, pn, box, size));
    shell.addEventListener("keydown", e => {
      if (e.target !== shell || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault();
      if (state.orderMode) return pickOrder(pn);
      state.selectedPanelId = selected ? null : pn.id;
      renderAll();
    });
    attachPinch(shell);
    els.framesLayer.append(shell);
  });
  for (const id of frameImages.keys()) if (!liveImages.has(id)) frameImages.delete(id);
  if (focused) $(`.frame-shell[data-panel-id="${focused}"]`)?.focus({ preventScroll: true });
  renderGutters();
  renderDiagnostics();
  renderOverlay(size);
  renderStageInfo();
}
// Everything drawn above the page but not clipped by it: the selection outline, corner and edge handles,
// the floating frame toolbar, snap guides, the dashed proposal and the reading-order path.
function renderOverlay(size) {
  const layer = els.handlesLayer,
    p = page(),
    W = size.width,
    H = size.height,
    px = v => [(v[0] / 100) * W, (v[1] / 100) * H],
    pts = poly => poly.map(v => px(v).join(",")).join(" "),
    svg = svgEl("svg", { class: "overlay-svg", viewBox: `0 0 ${W} ${H}`, width: W, height: H, "aria-hidden": "true" }),
    nodes = [svg],
    pn = state.preview ? null : panel();
  layer.style.setProperty("--handle-size", `${state.handleSize}px`);
  if (state.preview?.pageId === p.id)
    for (const q of state.preview.panels) {
      const old = p.panels.find(x => x.id === q.id);
      svg.append(svgEl("polygon", { points: pts(globalPolygon(q)), class: `ghost${!old || frameKey(old) !== frameKey(q) ? " changed" : ""}` }));
    }
  for (const l of state.snapLines) {
    const at = l.axis === 0 ? (l.value / 100) * W : (l.value / 100) * H;
    svg.append(svgEl("line", l.axis === 0 ? { x1: at, y1: -12, x2: at, y2: H + 12, class: "snap-line" } : { x1: -12, y1: at, x2: W + 12, y2: at, class: "snap-line" }));
  }
  const order = state.orderMode ? state.orderMode.picked.map(id => p.panels.find(q => q.id === id)).filter(Boolean) : state.showOrder ? readingOrder(p) : [];
  if (order.length > 1)
    svg.append(svgEl("polyline", { points: order.map(q => px([q.x + q.w / 2, q.y + q.h / 2]).join(",")).join(" "), class: "order-path", "marker-end": "url(#orderArrow)" }));
  if (order.length > 1) {
    const defs = svgEl("defs"),
      marker = svgEl("marker", { id: "orderArrow", viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" });
    marker.append(svgEl("path", { d: "M0 0 10 5 0 10z", class: "order-arrow" }));
    defs.append(marker);
    svg.prepend(defs);
  }
  if (pn && state.editorTab === "layout") {
    const poly = globalPolygon(pn).map(px),
      box = { w: (pn.w / 100) * W, h: (pn.h / 100) * H },
      grab = el => {
        el.addEventListener("pointerdown", e => beginDrag(e, pn, box, size));
        attachPinch(el);
        nodes.push(el);
      };
    svg.append(svgEl("polygon", { points: poly.map(v => v.join(",")).join(" "), class: `selection-outline${state.drag?.blocked ? " invalid" : ""}` }));
    if (!pn.locked) {
      poly.forEach((a, i) => {
        const b = poly[(i + 1) % poly.length],
          len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < state.handleSize * 2.5) return;
        const h = document.createElement("span");
        h.className = "edge-handle handle";
        h.dataset.edge = i;
        h.style.cssText = `left:${(a[0] + b[0]) / 2}px;top:${(a[1] + b[1]) / 2}px;transform:translate(-50%,-50%) rotate(${(Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI}deg)`;
        grab(h);
      });
      poly.forEach((a, i) => {
        const h = document.createElement("span");
        h.className = `vertex-handle handle${i === state.selectedVertex ? " selected-vertex" : ""}`;
        h.dataset.vertex = i;
        h.style.cssText = `left:${a[0]}px;top:${a[1]}px`;
        grab(h);
      });
    }
  }
  if (pn && !state.drag && !state.orderMode && (state.editorTab === "layout" || state.editorTab === "image")) nodes.push(frameToolbar(p, pn, W, H));
  layer.replaceChildren(...nodes);
}
// Small floating toolbar beside the selected frame, placed outside the frame when there is room.
function frameToolbar(p, pn, W, H) {
  const bar = document.createElement("div"),
    b = polygonBounds(globalPolygon(pn)),
    x = (b.x / 100) * W,
    y = (b.y / 100) * H,
    w = (b.w / 100) * W,
    h = (b.h / 100) * H,
    n = fa(panelNumber(pn.id, p)),
    wide = W >= 330,
    items =
      state.editorTab === "image"
        ? [
            ["image", pn.image ? "جایگزینی تصویر" : "افزودن تصویر", () => els.selectedImageInput.click()],
            pn.image && ["trash", "حذف تصویر", () => removeImage(), "danger"]
          ]
        : [
            ["image", "تصویر این قاب", () => setEditorTab("image")],
            [pn.locked ? "lock" : "unlock", pn.locked ? "بازکردن قفل" : "قفل", () => togglePanelLock(), pn.locked ? "on" : ""],
            !pn.locked && ["splitV", "دو نیم ستونی", () => splitPanel("v")],
            !pn.locked && ["splitH", "دو نیم ردیفی", () => splitPanel("h")],
            wide && !pn.locked && ["merge", "یکی‌کردن با قاب کناری", () => mergeWithNeighbor()],
            wide && ["copy", "تکثیر", () => duplicatePanel()],
            ["trash", "حذف قاب", () => deletePanel(), "danger"]
          ];
  bar.className = "frame-toolbar";
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", `ابزار قاب ${n}`);
  bar.addEventListener("pointerdown", e => e.stopPropagation());
  for (const it of items.filter(Boolean)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `icon-btn sm${it[3] ? " " + it[3] : ""}`;
    btn.dataset.tool = it[0];
    btn.setAttribute("aria-label", `${it[1]} — قاب ${n}`);
    btn.title = it[1];
    btn.innerHTML = ICONS[it[0]];
    btn.addEventListener("click", it[2]);
    bar.append(btn);
  }
  // Prefer a vertical bar in the empty stage beside the page, so nothing covers the artwork. Only when the
  // stage has no room at the sides does the bar float next to the frame (never in the image step).
  const size = matchMedia("(pointer: coarse)").matches ? 44 : 36,
    count = bar.children.length,
    thick = size + 8,
    long = count * size + 8,
    gap = state.handleSize / 2 + 6,
    scroller = $("#canvasScroller"),
    sideRoom = (scroller.clientWidth - W) / 2;
  if (sideRoom >= thick + gap + 4) {
    bar.classList.add("vertical");
    const left = x + w / 2 < W / 2 ? -thick - gap : W + gap;
    bar.style.cssText = `left:${left}px;top:${clamp(y, 0, Math.max(0, H - long))}px`;
  } else if (state.editorTab === "image") bar.hidden = true;
  else {
    const top = y - thick - gap >= -30 ? y - thick - gap : y + h + gap + thick <= H + 30 ? y + h + gap : y + gap;
    bar.style.cssText = `left:${clamp(x + w / 2 - long / 2, Math.min(0, (W - long) / 2), Math.max(W - long, (W - long) / 2))}px;top:${top}px`;
  }
  return bar;
}
// <img> elements are reused between renders: re-creating them on every pointer move made the browser
// re-parse multi-megabyte data URLs at drag frame rate.
const frameImages = new Map();
function frameImage(pn) {
  let img = frameImages.get(pn.id);
  if (!img || img._src !== pn.image.dataUrl) {
    img = document.createElement("img");
    img.decoding = "async";
    img.draggable = false;
    img.src = pn.image.dataUrl;
    img._src = pn.image.dataUrl;
    frameImages.set(pn.id, img);
  }
  return img;
}
// Size of the selected frame (or the page) in print units, shown beside the page instead of over the artwork.
function printSize(px, dpi) {
  return fa(Math.round((px / dpi) * 25.4) / 10);
}
function renderStageInfo() {
  const el = $("#frameInfo");
  if (!el) return;
  const p = page(),
    pr = PAGE_PRESETS[p.preset] || PAGE_PRESETS.vaziri,
    dpi = p.preset === "webtoon" ? 96 : 300,
    pn = panel();
  if (pn) {
    const spec = frameSpecs(pn, p);
    el.textContent = `قاب ${fa(panelNumber(pn.id, p))} · ${fa(spec.w)}×${fa(spec.h)} پیکسل · ${printSize(spec.w, dpi)}×${printSize(spec.h, dpi)} سانتی‌متر`;
  } else
    el.textContent =
      dpi === 300
        ? `${pr.title} · ${printSize(pr.width, dpi)}×${printSize(pr.height, dpi)} سانتی‌متر · ۳۰۰dpi`
        : `${pr.title} · ${fa(pr.width)}×${fa(pr.height)} پیکسل`;
}
function renderPageList() {
  els.pageList.replaceChildren();
  state.pages.forEach((p, i) => {
    const card = document.createElement("button");
    card.className = `page-card${p.id === state.activePageId ? " active" : ""}`;
    const thumb = document.createElement("span");
    thumb.className = "page-thumb";
    thumb.style.background = p.paper;
    const pr = PAGE_PRESETS[p.preset] || PAGE_PRESETS.a4,
      tw = 50,
      th = (tw * pr.height) / pr.width;
    thumb.style.height = `${th}px`;
    readingOrder(p).forEach(pn => {
      const f = document.createElement("span");
      f.className = "thumb-frame";
      f.style.cssText = `left:${(pn.x / 100) * tw}px;top:${(pn.y / 100) * th}px;width:${(pn.w / 100) * tw}px;height:${(pn.h / 100) * th}px;clip-path:${polygonCss(shapePolygon(pn))}`;
      if (pn.image) {
        const im = document.createElement("img"),
          pl = mediaPlacement(pn.image, (pn.w / 100) * tw, (pn.h / 100) * th);
        im.src = pn.image.dataUrl;
        im.alt = "";
        im.style.cssText = `width:${pl.drawW}px;height:${pl.drawH}px;left:${pl.x}px;top:${pl.y}px;transform:${imageTransform(pn.image, pl)};filter:${lookFilter(effectiveLook(p, pn))}`;
        f.append(im);
      }
      thumb.append(f);
    });
    const copy = document.createElement("span");
    copy.className = "page-card-copy";
    copy.innerHTML = `<b>صفحه ${fa(i + 1)}</b><small>${p.panels.length ? `${fa(p.panels.length)} قاب · ${fa(p.panels.filter(x => x.image).length)} تصویر` : "بدون قاب"}</small>`;
    card.dataset.pageId = p.id;
    card.append(thumb, copy);
    card.draggable = true;
    card.setAttribute("aria-label", `صفحه ${fa(i + 1)}${p.id === state.activePageId ? "، باز است" : ""}`);
    card.addEventListener("dragstart", e => e.dataTransfer.setData("application/x-comic-page", p.id));
    card.addEventListener("dragover", e => {
      if ([...e.dataTransfer.types].includes("application/x-comic-page")) e.preventDefault();
    });
    card.addEventListener("drop", e => {
      const id = e.dataTransfer.getData("application/x-comic-page"),
        from = state.pages.findIndex(x => x.id === id);
      if (from < 0 || from === i) return;
      e.preventDefault();
      remember();
      const [moved] = state.pages.splice(from, 1);
      state.pages.splice(i, 0, moved);
      renderAll();
      showToast(`صفحه به جای ${fa(i + 1)} رفت.`, { undo: true });
    });
    card.addEventListener("click", () => {
      state.preview = null;
      state.orderMode = null;
      state.activePageId = p.id;
      state.selectedPanelId = null;
      renderAll();
      [...els.pageList.children].find(x => x.dataset.pageId === p.id)?.focus();
    });
    els.pageList.append(card);
  });
}
function renderPanelManager() {
  const p = page();
  els.panelManagerSection.hidden = !p.panels.length;
  els.panelManager.replaceChildren();
  readingOrder(p).forEach(pn => {
    const card = document.createElement("div"),
      index = panelNumber(pn.id, p),
      active = state.selectedPanelId === pn.id;
    card.className = `frame-row${active ? " active" : ""}${pn.locked ? " locked" : ""}`;
    card.dataset.panelId = pn.id;
    card.innerHTML = `<button type="button" class="frame-row-main" data-action="select" aria-pressed="${active}"><span class="frame-row-n">${fa(index)}</span><span class="frame-row-text"><b>قاب ${fa(index)}</b><small>${pn.image ? "تصویر دارد" : "بدون تصویر"}${pn.locked ? " · قفل" : ""}</small></span></button><button type="button" class="icon-btn sm" data-action="lock" aria-pressed="${!!pn.locked}" aria-label="${pn.locked ? "بازکردن قفل" : "قفل"} قاب ${fa(index)}" title="${pn.locked ? "بازکردن قفل" : "قفل"}">${pn.locked ? ICONS.lock : ICONS.unlock}</button><button type="button" class="icon-btn sm" data-action="fit" aria-label="فیت لبه‌های قاب ${fa(index)}" title="${pn.locked ? "فیت قاب‌های آزاد کنار این قاب" : "فیت لبه‌های این قاب"}">${ICONS.fit}</button><button type="button" class="icon-btn sm danger" data-action="delete" aria-label="حذف قاب ${fa(index)}" title="حذف">${ICONS.trash}</button>`;
    els.panelManager.append(card);
  });
}
function renderTemplateCategories() {
  const mine = state.templateCategory === "mine";
  $$("[data-category-tab]").forEach(x =>
    x.classList.toggle("active", x.dataset.categoryTab === state.templateCategory)
  );
  $$("[data-template]").forEach(x => {
    x.hidden = x.dataset.category !== state.templateCategory;
    x.classList.toggle("active", x.dataset.template === page().lastTemplate && !layoutEdited(page()));
  });
  $("#myLayouts").hidden = !mine;
  if (mine) renderMyLayouts();
}
function renderImagePicker() {
  const root = $("#imagePanelPicker");
  root.replaceChildren();
  readingOrder().forEach((pn, i) => {
    const b = document.createElement("button"),
      active = pn.id === state.selectedPanelId;
    b.type = "button";
    b.className = active ? "active" : "";
    b.setAttribute("aria-pressed", String(active));
    b.setAttribute("aria-label", `قاب ${fa(i + 1)} — ${pn.image?.name || "بدون تصویر"}`);
    b.title = `قاب ${fa(i + 1)} — ${pn.image?.name || "بدون تصویر"}`;
    const thumb = document.createElement("span");
    if (pn.image) {
      const img = document.createElement("img");
      img.src = pn.image.dataUrl;
      img.alt = "";
      img.decoding = "async";
      thumb.append(img);
    } else thumb.innerHTML = svgIcon('<path d="M12 6v12M6 12h12"/>');
    const label = document.createElement("small");
    label.textContent = fa(i + 1);
    b.append(thumb, label);
    b.addEventListener("click", () => {
      state.selectedPanelId = pn.id;
      renderAll();
    });
    b.draggable = !!pn.image;
    b.addEventListener("dragstart", e => e.dataTransfer.setData("application/x-comic-image", pn.id));
    b.addEventListener("dragover", e => {
      if ([...e.dataTransfer.types].includes("application/x-comic-image")) e.preventDefault();
    });
    b.addEventListener("drop", e => {
      const from = e.dataTransfer.getData("application/x-comic-image");
      if (!from || from === pn.id) return;
      e.preventDefault();
      swapImages(from, pn.id);
    });
    root.append(b);
  });
}
function renderLookControls() {
  const p = page(),
    pn = panel();
  if (state.lookScope === "panel" && !pn?.image) state.lookScope = "page";
  $("#lookScope").value = state.lookScope;
  $("#lookScope").querySelector('[value="panel"]').disabled = !pn?.image;
  const v =
    state.lookScope === "panel" ? normalizeLook(pn.image.lookOverride || p.look) : normalizeLook(p.look);
  $("#lookPreset").value = v.preset in LOOK_PRESETS ? v.preset : "custom";
  const ids = {
    brightness: "lookBrightnessValue",
    contrast: "lookContrastValue",
    saturation: "lookSaturationValue",
    hue: "lookHueValue",
    mono: "lookMonoValue"
  };
  $$("[data-look-field]").forEach(input => {
    const field = input.dataset.lookField;
    input.value = v[field];
    $("#" + ids[field]).textContent = field === "hue" ? `${fa(v[field])}°` : `${fa(v[field])}٪`;
  });
  $("#lookScopeHint").textContent =
    state.lookScope === "page"
      ? "ظاهر صفحه بر تصاویر تازه هم اعمال می‌شود؛ استثناهای تکی حفظ می‌شوند."
      : pn?.image?.lookOverride
        ? "این عکس تنظیم اختصاصی دارد؛ عکس اصلی تغییر نکرده است."
        : "این عکس فعلاً ظاهر صفحه را به ارث می‌برد؛ با تغییر، استثنای مستقل می‌شود.";
}
// Line thickness on paper: the stage is drawn pageBase units wide, the sheet is pr.width pixels at 300dpi.
function gapLabel(p, value) {
  const pr = PAGE_PRESETS[p.preset] || PAGE_PRESETS.vaziri;
  if (p.preset === "webtoon" || !value) return fa(value);
  return `${fa(value)} · ${fa(Math.round((value / pageBase(pr)) * (pr.width / 300) * 25.4 * 10) / 10)} م‌م`;
}
// Controls added in v26: layout style, variety strength, snap, overlap fixer, image swap, reading order, names.
function renderExtraControls() {
  const p = page(),
    pn = panel(),
    set = (sel, key, value) =>
      $$(sel).forEach(b => {
        const on = String(b.dataset[key]) === String(value);
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", String(on));
      });
  set("[data-layout-style]", "layoutStyle", p.layoutStyle === "hand" ? "hand" : "regular");
  set("[data-variety]", "variety", state.varietyStrength);
  $("#snapToggle").checked = state.snap;
  $("#fixOverlapsBtn").hidden = !!state.drag || !p.panels.length || !diagnostics(p).pairs;
  $("#pageBorderRange").value = p.pageBorder || 0;
  $("#pageBorderValue").textContent = gapLabel(p, p.pageBorder || 0);
  $("#autoOrderBtn").hidden = !p.panels.length || !p.panels.every(q => Number.isFinite(q.order));
  $("#showOrderBtn").setAttribute("aria-pressed", String(!!state.showOrder));
  $("#orderBtn").setAttribute("aria-pressed", String(!!state.orderMode));
  for (const input of [$("#projectName"), $("#exportName")]) if (document.activeElement !== input) input.value = state.projectName;
  const swap = $("#swapSelect");
  swap.replaceChildren(new Option("انتخاب قاب…", ""));
  if (pn) readingOrder(p).forEach((q, i) => q !== pn && (pn.image || q.image) && swap.add(new Option(`قاب ${fa(i + 1)}${q.image ? "" : " (خالی)"}`, q.id)));
  swap.disabled = swap.options.length < 2;
  for (const sel of ["[data-split]", "#mergeFrameBtn", "[data-ratio]"]) $$(sel).forEach(b => (b.disabled = !pn || !!pn.locked));
}
function renderControls() {
  renderExtraControls();
  $("#handleSizeRange").value = state.handleSize;
  $("#handleSizeValue").textContent = fa(state.handleSize);
  const p = page(),
    pn = panel(),
    idx = pn ? panelNumber(pn.id, p) : 0,
    pi = state.pages.findIndex(x => x.id === p.id);
  p.name = `صفحه ${fa(pi + 1)}`;
  els.activePageTitle.textContent = p.name;
  els.panelCountPill.textContent = p.panels.length ? `${fa(p.panels.length)} قاب` : "بدون قاب";
  $("#magnetToggle").checked = p.magnet !== false;
  els.gapRange.value = p.gap;
  els.gapValue.textContent = gapLabel(p, p.gap);
  els.gutterStyle.value = p.gutterStyle || "simpleWhite";
  els.gutterColor.value = p.gutterColor || "#ffffff";
  els.gutterColor.disabled = ["simpleWhite", "simpleBlack"].includes(p.gutterStyle);
  els.gutterColorValue.textContent = els.gutterColor.disabled ? "ثابت" : p.gutterColor || "#ffffff";
  $("#gutterDetail").value = p.gutterDetail ?? 50;
  $("#gutterDetailValue").textContent = `${fa(p.gutterDetail ?? 50)}٪`;
  $("#gutterDetail").disabled = !["proHatch", "inkCut", "rail", "dash", "energy"].includes(p.gutterStyle);
  $("#gutterAccent").value = p.gutterAccent || "#0e1723";
  $("#gutterAccentValue").textContent = p.gutterAccent || "#0e1723";
  $("#gutterAccent").disabled = !["rail", "energy", "doubleComic", "proHatch"].includes(p.gutterStyle);
  els.gutterPreview.dataset.style = p.gutterStyle || "simpleWhite";
  els.gutterPreview.style.setProperty("--preview-accent", p.gutterAccent || "#0e1723");
  els.gutterPreview.style.setProperty(
    "--preview-color",
    ["simpleWhite", "simpleBlack"].includes(p.gutterStyle)
      ? p.gutterStyle === "simpleWhite"
        ? "#ffffff"
        : "#090b0e"
      : p.gutterColor || "#ffffff"
  );
  els.gutterPreview.style.setProperty("--preview-width", `${p.gap}px`);
  els.pagePreset.value = p.preset;
  els.paperColor.value = p.paper;
  const pr = PAGE_PRESETS[p.preset] || PAGE_PRESETS.a4;
  els.pagePresetInfo.innerHTML = `<b>${pr.title} · ${fa(pr.width)} × ${fa(pr.height)} پیکسل</b>${pr.info}`;
  els.frameControls.hidden = !pn;
  els.noImageSelection.hidden = !!pn;
  els.imageControls.classList.toggle("disabled", !pn);
  $$("[data-count]").forEach(b =>
    b.classList.toggle("active", Number(b.dataset.count) === (p.panels.length || p.targetCount))
  );
  if (pn) {
    const spec = frameSpecs(pn, p);
    $("#frameSpec").innerHTML =
      `<b>${fa(spec.w)} × ${fa(spec.h)} پیکسل</b><span>نسبت ${fa2(Number(spec.ratio))} به ۱ · نزدیک به ${spec.standard}</span><small>تصویر را دست‌کم ${fa(spec.w)} × ${fa(spec.h)} پیکسل بسازید؛ برای جابه‌جایی راحت، حدود ${fa(Math.ceil(spec.w * 1.25))} × ${fa(Math.ceil(spec.h * 1.25))}.</small>`;
    els.selectedFrameNumber.textContent = fa(idx);
    els.imageFrameNumber.textContent = fa(idx);
    els.frameShapeLabel.textContent = pn.customPoly ? "چندضلعی آزاد" : SHAPE_LABELS[pn.shape] || "چندضلعی آزاد";
    els.frameX.value = (100 - pn.x - pn.w).toFixed(2);
    els.frameY.value = pn.y.toFixed(2);
    els.frameW.value = pn.w.toFixed(2);
    els.frameH.value = pn.h.toFixed(2);
    els.shapeSelect.value = ["rect", "diagonal", "cut"].includes(pn.shape) ? pn.shape : "rect";
    [els.frameX, els.frameY, els.frameW, els.frameH, els.shapeSelect].forEach(
      x => (x.disabled = !!pn.locked)
    );
    $$("[data-frame-align]").forEach(x => (x.disabled = !!pn.locked));
    els.toggleLockBtn.classList.toggle("active", !!pn.locked);
    els.toggleLockBtn.setAttribute("aria-pressed", String(!!pn.locked));
    els.toggleLockBtn.querySelector("span").innerHTML = pn.locked ? ICONS.lock : ICONS.unlock;
    els.toggleLockBtn.querySelector("b").textContent = pn.locked ? "قفل است" : "قفل";
    els.toggleLockBtn.title = pn.locked ? "بازکردن قفل این قاب" : "قفل‌کردن این قاب؛ جورچین و آهنربا تغییرش نمی‌دهند";
    els.selectedFileName.textContent = pn.image ? pn.image.name : "این قاب هنوز تصویر ندارد";
    els.fitSelect.disabled = !pn.image;
    els.zoomRange.disabled = !pn.image;
    if (pn.image) {
      const smartPan = mediaPlacement(pn.image, pn.w, pn.h);
      els.fitSelect.value = pn.image.fit;
      // "fill" modes cannot go below 100%; the slider only offers what has an effect
      els.zoomRange.min = pn.image.fit === "smart" || pn.image.fit === "cover" ? 100 : 50;
      els.zoomRange.value = pn.image.zoom;
      els.zoomValue.textContent = `${fa(pn.image.zoom)}٪`;
      $$(`[data-image-pan]`).forEach(input => {
        input.disabled = false;
        input.value =
          pn.image.panMode === "manual"
            ? (pn.image[input.dataset.imagePan] ?? 50)
            : smartPan[input.dataset.imagePan];
        $("#imagePan" + (input.dataset.imagePan === "panX" ? "X" : "Y") + "Value").textContent =
          `${fa(Number(input.value))}٪`;
      });
    }
  }
  const im = pn?.image,
    angle = clamp(Number(im?.rotation) || 0, -180, 180);
  $("#imageRotationRange").value = angle;
  $("#imageRotationNumber").value = angle;
  $("#imageRotationValue").textContent = `${fa(angle)}°`;
  $("#flipImageXBtn").setAttribute("aria-pressed", String(!!im?.flipX));
  $("#flipImageYBtn").setAttribute("aria-pressed", String(!!im?.flipY));
  $$(
    ".image-transform input,.image-transform button,[data-image-pan],[data-nudge],[data-image-align]"
  ).forEach(x => (x.disabled = !im));
  $("#removeImageBtn").disabled = !im;
  $("#resetImagePlacementBtn").disabled = !im;
  $("#selectedImageBtn").disabled = !pn;
  $("#batchImageBtn").disabled = !p.panels.length;
  $("#imageTransformSummary").textContent =
    im && (angle || im.flipX || im.flipY)
      ? `${angle ? `${fa(angle)}°` + " · " : ""}${im.flipX ? "افقی " : ""}${im.flipY ? "عمودی" : ""}`.trim()
      : "بدون تغییر";
  const withImage = p.panels.filter(x => x.image).length;
  els.stageStatus.textContent = !p.panels.length
    ? "اول قاب‌های صفحه را بسازید"
    : withImage === p.panels.length
      ? "همهٔ قاب‌ها تصویر دارند؛ آمادهٔ خروجی"
      : `${fa(p.panels.length - withImage)} قاب بدون تصویر`;
  $$("[data-color]").forEach(b => {
    const on = b.dataset.color.toLowerCase() === String(p.paper).toLowerCase();
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", String(on));
  });
  // Workflow steps: a check mark tells the user which steps already have content.
  const done = { page: p.panels.length > 0, layout: p.panels.length > 0, image: p.panels.length > 0 && withImage === p.panels.length };
  $$("[data-editor-tab]").forEach(b => b.classList.toggle("done", !!done[b.dataset.editorTab]));
  renderLookControls();
  renderVertexControls();
  syncHistory();
}
function renderPreviewBar() {
  const v = state.preview,
    bar = $("#previewBar");
  bar.hidden = !v;
  $(".stage").classList.toggle("has-preview", !!v);
  if (!v) return;
  $("#previewTitle").textContent = v.title;
  $("#previewText").textContent = v.text;
  $("#previewAgain").hidden = !v.again;
}
function renderAll() {
  if (state.preview && state.preview.pageId !== page().id) state.preview = null;
  renderPage();
  renderPageList();
  renderControls();
  renderPanelManager();
  renderTemplateCategories();
  renderImagePicker();
  renderPreviewBar();
  scheduleAutosave();
}
const MODES = {
  page: ["تنظیم صفحه", "قطع، زمینه و مرز"],
  layout: ["ویرایش قاب‌ها", "قاب را بکشید؛ گوشه‌ها شکل می‌دهند"],
  image: ["جابه‌جایی تصویر", "عکس را داخل قاب بکشید"]
};
function setEditorTab(tab) {
  state.editorTab = tab;
  state.preview = null;
  state.orderMode = null;
  $$("[data-editor-tab]").forEach(b => {
    const on = b.dataset.editorTab === tab;
    b.classList.toggle("active", on);
    if (on) b.setAttribute("aria-current", "step");
    else b.removeAttribute("aria-current");
  });
  $$("[data-tab-panel]").forEach(p => p.classList.toggle("active", p.dataset.tabPanel === tab));
  els.activeMode.dataset.mode = tab;
  els.activeMode.querySelector("b").textContent = MODES[tab][0];
  els.activeMode.querySelector("span").textContent = MODES[tab][1];
  renderPage();
  renderControls();
  renderPanelManager();
  renderImagePicker();
  renderPreviewBar();
}
