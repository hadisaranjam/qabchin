// کشیدن با اشاره‌گر، نقطه‌های کنترل و فرمان‌های قاب
let lastTap = { key: "", t: 0 };
// Two-finger pinch: a second touch cancels a frame/image drag (undoing its partial move) and zooms the stage instead.
let pinch = null;
function cancelDrag() {
  const d = state.drag;
  if (!d) return;
  state.drag = null;
  state.snapLines = [];
  if (d.remembered && state.past.length) {
    const prev = state.past.pop();
    restore(prev);
    syncHistory();
  } else renderAll();
}
function beginDrag(e, pn, box, pageSize) {
  if (e.button !== undefined && e.button !== 0) return;
  if (pinch || state.preview) return;
  if (state.drag && state.drag.pointerId !== e.pointerId) return cancelDrag();
  if (state.orderMode) {
    e.preventDefault();
    return pickOrder(pn);
  }
  const wasSelected = state.selectedPanelId === pn.id;
  state.selectedPanelId = pn.id;
  if (!wasSelected) state.selectedVertex = null;
  const vertex = e.target.closest(".vertex-handle"),
    edge = e.target.closest(".edge-handle");
  if (vertex) state.selectedVertex = Number(vertex.dataset.vertex);
  let mode = "select";
  if (!pn.locked && vertex) mode = "vertex";
  else if (!pn.locked && edge) mode = "edge";
  else if (state.editorTab === "image" && pn.image) mode = "image";
  else if (state.editorTab === "layout" && !pn.locked) mode = "move";
  if (e.pointerType === "touch" && !wasSelected && (mode === "move" || mode === "image")) mode = "select";
  const pl = pn.image ? mediaPlacement(pn.image, box.w, box.h) : null;
  state.drag = {
    pointerId: e.pointerId,
    mode,
    vertex: Number(vertex?.dataset.vertex),
    edge: Number(edge?.dataset.edge),
    startX: e.clientX,
    startY: e.clientY,
    panelId: pn.id,
    base: {
      x: pn.x,
      y: pn.y,
      w: pn.w,
      h: pn.h,
      global: globalPolygon(pn).map(v => [...v]),
      panX: pl?.panX ?? 50,
      panY: pl?.panY ?? 50
    },
    baseOverlap: mode === "select" || mode === "image" ? 0 : overlapWith(page(), pn),
    pageSize,
    media: pl,
    remembered: false,
    moved: false,
    last: null,
    follow: null,
    blocked: "",
    told: false,
    tapKey: !pn.locked && (vertex || edge) ? pn.id + (vertex ? `v${vertex.dataset.vertex}` : `e${edge.dataset.edge}`) : ""
  };
  els.comicPage.setPointerCapture?.(e.pointerId);
  if (mode !== "select") e.preventDefault();
  renderPage();
  renderControls();
  renderPanelManager();
}
// Finds the frames that share the dragged corner or edge and records how each of their vertices follows it,
// so a common border moves in both frames and the page stays covered. Locked frames never follow.
function linkNeighbours(p, pn, d) {
  const base = d.base.global,
    n = base.length,
    out = [];
  if (d.mode === "vertex") {
    const i = d.vertex,
      pv = (i + n - 1) % n,
      nx = (i + 1) % n,
      edges = [
        [pv, i],
        [i, nx]
      ];
    for (const q of p.panels) {
      if (q === pn || q.locked) continue;
      const poly = globalPolygon(q);
      let inserted = false;
      for (const k of [i, pv, nx]) {
        const pt = base[k];
        if (poly.some(v => pointDistance(v, pt) < MESH_EPS)) continue;
        for (let e = 0; e < poly.length; e++) {
          const h = projectPoint(pt, poly[e], poly[(e + 1) % poly.length]);
          if (h.dist < MESH_EPS && h.t > 0 && h.t < 1) {
            poly.splice(e + 1, 0, [...pt]);
            inserted = true;
            break;
          }
        }
      }
      const links = [];
      poly.forEach((v, k) => {
        if (pointDistance(v, base[i]) < MESH_EPS) return links.push({ k, same: i });
        if (pointDistance(v, base[pv]) < MESH_EPS || pointDistance(v, base[nx]) < MESH_EPS) return;
        for (const [s, e] of edges) {
          const h = projectPoint(v, base[s], base[e]);
          if (h.dist < MESH_EPS && h.t > 0 && h.t < 1) return links.push({ k, s, e, t: h.t });
        }
      });
      if (!links.length || poly.length > 24) continue;
      out.push({ pn: q, base: poly, links, inserted, baseOverlap: overlapWith(p, q) });
    }
    return out;
  }
  // Edge: only frames lying across the dragged edge follow it. Where the edge ends in the middle of a
  // neighbour's longer edge, the neighbour gets a fixed and a moving vertex there (a clean step).
  const i = d.edge,
    j = (i + 1) % n,
    A = base[i],
    B = base[j],
    len = pointDistance(A, B) || 1,
    param = v => ((v[0] - A[0]) * (B[0] - A[0]) + (v[1] - A[1]) * (B[1] - A[1])) / (len * len),
    onLine = v => Math.abs((v[0] - A[0]) * (B[1] - A[1]) - (v[1] - A[1]) * (B[0] - A[0])) / len < MESH_EPS,
    eps = MESH_EPS / len;
  for (const q of p.panels) {
    if (q === pn || q.locked) continue;
    const src = globalPolygon(q),
      poly = [],
      links = [];
    let across = false,
      inserted = false;
    src.forEach((v, k) => {
      const w = src[(k + 1) % src.length],
        tv = param(v),
        tw = param(w),
        collinear = onLine(v) && onLine(w),
        overlap = collinear ? Math.min(Math.max(tv, tw), 1) - Math.max(Math.min(tv, tw), 0) : 0;
      if (onLine(v) && tv > -eps && tv < 1 + eps) {
        if (tv < eps) links.push({ k: poly.length, same: i });
        else if (tv > 1 - eps) links.push({ k: poly.length, same: j });
        else links.push({ k: poly.length, s: i, e: j, t: tv });
      }
      poly.push(v);
      if (overlap * len <= 0.5) return;
      across = true;
      // ends of the dragged edge that fall strictly inside this neighbour edge, in walking order
      const inner = [
        [0, i, A],
        [1, j, B]
      ]
        .filter(([t]) => t > Math.min(tv, tw) + eps && t < Math.max(tv, tw) - eps)
        .sort((x, y) => (tv < tw ? x[0] - y[0] : y[0] - x[0]));
      for (const [t, idx, pt] of inner) {
        // walking along the neighbour's edge: is the part before this point the shared (moving) part?
        const movingFirst = tv < tw ? t === 1 : t === 0;
        if (movingFirst) {
          links.push({ k: poly.length, same: idx });
          poly.push([...pt], [...pt]);
        } else {
          poly.push([...pt]);
          links.push({ k: poly.length, same: idx });
          poly.push([...pt]);
        }
        inserted = true;
      }
    });
    if (!across || !links.length || poly.length > 24) continue;
    out.push({ pn: q, base: poly, links, inserted, baseOverlap: overlapWith(p, q) });
  }
  return out;
}
// Applies a new outline to the dragged frame and its followers; all or nothing.
function applyShape(p, pn, poly, d) {
  if (!poly || !polygonIsValid(poly)) {
    d.blocked = "ضلع‌های قاب روی هم می‌افتند.";
    return false;
  }
  const group = [pn, ...(d.follow || []).map(f => f.pn)],
    backup = group.map(clonePanel);
  applyGlobalPolygon(pn, poly);
  let ok = true,
    why = "";
  for (const f of d.follow || []) {
    const fp = f.base.map(v => [...v]);
    for (const l of f.links)
      fp[l.k] =
        l.same !== undefined
          ? [...poly[l.same]]
          : [poly[l.s][0] + (poly[l.e][0] - poly[l.s][0]) * l.t, poly[l.s][1] + (poly[l.e][1] - poly[l.s][1]) * l.t];
    if (!polygonIsValid(cleanPolygon(fp))) {
      ok = false;
      why = `قاب ${fa(panelNumber(f.pn.id, p))} از این کوچک‌تر نمی‌شود.`;
      break;
    }
    applyGlobalPolygon(f.pn, fp);
  }
  if (ok && p.magnet) {
    const bases = [d.baseOverlap, ...(d.follow || []).map(f => f.baseOverlap)],
      bad = group.find((q, k) => !fitsOrBetter(p, q, bases[k]));
    if (bad) {
      const hit = blockerOf(p, bad);
      ok = false;
      why = hit ? `قاب ${fa(panelNumber(hit.id, p))} سر راه است.` : "این شکل با قاب کناری برخورد می‌کند.";
    }
  }
  if (!ok) {
    group.forEach((q, k) => copyGeometry(q, backup[k]));
    d.blocked = why;
    return false;
  }
  p.boundaries = [];
  return true;
}
// Snaps a span [v, v+size] by whichever of its two ends is closer to a guide.
function snapSpan(v, size, axis, pn, off) {
  const mark = state.snapLines.length,
    a = snapCoordinate(v, axis, pn, off),
    la = state.snapLines.splice(mark),
    b = snapCoordinate(v + size, axis, pn, off) - size,
    lb = state.snapLines.splice(mark),
    useA = la.length && (!lb.length || Math.abs(a - v) <= Math.abs(b - v));
  if (useA) state.snapLines.push(...la);
  else if (lb.length) state.snapLines.push(...lb);
  return useA ? a : lb.length ? b : v;
}
function processDrag() {
  const d = state.drag;
  if (!d || !d.last || d.mode === "select") return;
  const p = page(),
    pn = p.panels.find(x => x.id === d.panelId);
  if (!pn) return;
  const dxPct = ((d.last.x - d.startX) / d.pageSize.width) * 100,
    dyPct = ((d.last.y - d.startY) / d.pageSize.height) * 100,
    alt = d.last.alt;
  if (!d.remembered) {
    if (Math.abs(dxPct) + Math.abs(dyPct) <= 0.12) return;
    remember();
    d.remembered = true;
    if (d.mode === "move") p.isTiled = false;
    if ((d.mode === "vertex" || d.mode === "edge") && p.magnet && !alt) {
      d.follow = linkNeighbours(p, pn, d);
      for (const f of d.follow) if (f.inserted) applyGlobalPolygon(f.pn, f.base);
    }
  }
  state.snapLines = [];
  d.blocked = "";
  if (d.mode === "move") {
    const x = clamp(snapSpan(clamp(d.base.x + dxPct, 0, 100 - pn.w), pn.w, 0, pn, alt), 0, 100 - pn.w),
      y = clamp(snapSpan(clamp(d.base.y + dyPct, 0, 100 - pn.h), pn.h, 1, pn, alt), 0, 100 - pn.h);
    if (p.magnet) {
      if (!slideTo(p, pn, x, y, d.baseOverlap)) d.blocked = "stop";
    } else {
      pn.x = x;
      pn.y = y;
    }
    const near = (a, b) => Math.abs(a - b) < 0.01;
    state.snapLines = state.snapLines.filter(l =>
      l.axis === 0 ? near(l.value, pn.x) || near(l.value, pn.x + pn.w) : near(l.value, pn.y) || near(l.value, pn.y + pn.h)
    );
    p.boundaries = [];
  } else if (d.mode === "vertex" || d.mode === "edge") {
    const base = d.base.global,
      shapeAt = k => {
        const dx = dxPct * k,
          dy = dyPct * k;
        if (d.mode === "vertex") {
          const poly = base.map(v => [...v]),
            old = base[d.vertex];
          poly[d.vertex] = [
            snapCoordinate(clamp(old[0] + dx, 0, 100), 0, pn, alt),
            snapCoordinate(clamp(old[1] + dy, 0, 100), 1, pn, alt)
          ];
          return poly;
        }
        // An edge moves along its own normal; its ends slide on the neighbouring edges (see offsetEdge).
        const i = d.edge,
          a = base[i],
          b = base[(i + 1) % base.length],
          len = pointDistance(a, b) || 1,
          sign = signedArea(base) > 0 ? 1 : -1,
          nrm = [((b[1] - a[1]) / len) * sign, (-(b[0] - a[0]) / len) * sign];
        let dist = dx * nrm[0] + dy * nrm[1];
        for (const axis of [0, 1])
          if (Math.abs(nrm[axis]) > 0.999) dist = (snapCoordinate(clamp(a[axis] + nrm[axis] * dist, 0, 100), axis, pn, alt) - a[axis]) / nrm[axis];
        let poly = offsetEdge(base, i, dist);
        if (poly && !inPage(poly)) {
          let lo = 0,
            hi = 1;
          for (let s = 0; s < 12; s++) {
            const m = (lo + hi) / 2,
              q = offsetEdge(base, i, dist * m);
            if (q && inPage(q)) lo = m;
            else hi = m;
          }
          poly = offsetEdge(base, i, dist * lo);
        }
        return poly && snapToPage(poly);
      };
    if (!applyShape(p, pn, shapeAt(1), d)) {
      // go as far as possible towards the pointer instead of freezing
      const why = d.blocked;
      let lo = 0,
        hi = 1;
      for (let s = 0; s < 8; s++) {
        const m = (lo + hi) / 2;
        state.snapLines = [];
        if (applyShape(p, pn, shapeAt(m), d)) lo = m;
        else hi = m;
      }
      state.snapLines = [];
      d.blocked = why;
      if (!d.told) {
        d.told = true;
        showToast(why);
      }
    }
  } else if (d.mode === "image" && pn.image) {
    pn.image.panMode = "manual";
    const fx = d.media.spanX,
      fy = d.media.spanY,
      dx = d.last.x - d.startX,
      dy = d.last.y - d.startY,
      r = (d.media.rotation * Math.PI) / 180,
      localX = d.media.cover ? dx * Math.cos(r) + dy * Math.sin(r) : dx,
      localY = d.media.cover ? -dx * Math.sin(r) + dy * Math.cos(r) : dy;
    pn.image.panX = Math.abs(fx) < 0.01 ? 50 : clamp(d.base.panX + (localX / fx) * 100, 0, 100);
    pn.image.panY = Math.abs(fy) < 0.01 ? 50 : clamp(d.base.panY + (localY / fy) * 100, 0, 100);
  }
}
// Pointer moves are only recorded; the geometry work runs once per animation frame.
let dragFrame = 0;
const scheduleDrag = () => {
  if (dragFrame) return;
  dragFrame = requestAnimationFrame(() => {
    dragFrame = 0;
    processDrag();
    renderPage();
    renderControls();
  });
};
function endDrag(e) {
  const d = state.drag;
  if (!d || (e?.pointerId !== undefined && e.pointerId !== d.pointerId)) return;
  if (dragFrame) {
    cancelAnimationFrame(dragFrame);
    dragFrame = 0;
    processDrag();
  }
  state.drag = null;
  state.snapLines = [];
  const p = page();
  if (d.remembered) {
    // vertices that were only inserted to follow the drag and ended up on a straight line are removed again
    for (const f of d.follow || []) {
      if (!f.inserted) continue;
      const clean = cleanPolygon(globalPolygon(f.pn));
      if (clean.length >= 3 && clean.length !== shapePolygon(f.pn).length) applyGlobalPolygon(f.pn, clean);
    }
    if (d.mode !== "image") {
      p.isTiled = coverageOkay(p);
      p.boundaries = sharedEdges(p);
    }
  }
  // A double tap is two taps that did not move; two quick drags are not a double tap.
  if (d.tapKey && !d.moved && e?.type === "pointerup") {
    const now = performance.now();
    if (lastTap.key === d.tapKey && now - lastTap.t < 400) {
      lastTap = { key: "", t: 0 };
      if (Number.isFinite(d.vertex)) removeVertex(d.vertex);
      else addVertex(d.edge);
      return;
    }
    lastTap = { key: d.tapKey, t: now };
  } else lastTap = { key: "", t: 0 };
  renderAll();
}
// Manual reading order: the user taps the frames in the order they should be read.
function startOrderMode() {
  const p = page();
  if (p.panels.length < 2) return showToast("برای ترتیب خوانش دست‌کم دو قاب لازم است.");
  state.orderMode = { picked: [] };
  state.selectedPanelId = null;
  renderAll();
  showToast("قاب‌ها را به ترتیب خواندن بزنید. Esc لغو می‌کند.", { sticky: true });
}
function pickOrder(pn) {
  const m = state.orderMode,
    p = page();
  if (m.picked.includes(pn.id)) return;
  m.picked.push(pn.id);
  if (m.picked.length < p.panels.length) {
    renderAll();
    return showToast(`${fa(m.picked.length)} از ${fa(p.panels.length)} قاب انتخاب شد.`, { sticky: true });
  }
  state.orderMode = null;
  remember();
  m.picked.forEach((id, i) => (p.panels.find(q => q.id === id).order = i + 1));
  renderAll();
  showToast("ترتیب خوانش ثبت شد.", { undo: true });
}
function autoOrder() {
  const p = page();
  state.orderMode = null;
  if (!p.panels.some(q => Number.isFinite(q.order))) {
    renderAll();
    return showToast("ترتیب خوانش خودکار است: راست‌به‌چپ، بالا به پایین.");
  }
  remember();
  p.panels.forEach(q => delete q.order);
  renderAll();
  showToast("ترتیب خوانش به حالت خودکار برگشت.", { undo: true });
}
function addVertex(edgeIndex = null) {
  const pn = panel(),
    p = page();
  if (!pn || pn.locked) return;
  const poly = globalPolygon(pn);
  if (poly.length >= 12) return showToast("هر قاب حداکثر ۱۲ نقطه دارد.");
  let i = edgeIndex;
  if (i == null) {
    let best = -1;
    poly.forEach((a, j) => {
      const d = pointDistance(a, poly[(j + 1) % poly.length]);
      if (d > best) {
        best = d;
        i = j;
      }
    });
  }
  const a = poly[i],
    b = poly[(i + 1) % poly.length],
    next = [...poly];
  next.splice(i + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
  remember();
  applyGlobalPolygon(pn, next);
  pn.fitBasePoly = null;
  state.selectedVertex = i + 1;
  p.boundaries = sharedEdges(p);
  renderAll();
  showToast("نقطهٔ تازه روی ضلع نشست؛ آن را بکشید.");
}
function removeVertex(index = state.selectedVertex) {
  const pn = panel(),
    p = page();
  if (!pn || pn.locked || index == null) return;
  const poly = globalPolygon(pn);
  if (poly.length <= 3) return showToast("هر قاب دست‌کم سه نقطه دارد.");
  const next = poly.filter((_, i) => i !== index);
  if (!polygonIsValid(next)) return showToast("با حذف این نقطه شکل قاب نامعتبر می‌شود.");
  const candidate = clonePanel(pn);
  applyGlobalPolygon(candidate, next);
  if (p.magnet && !panelFits({ ...p, panels: p.panels.filter(q => q !== pn) }, candidate))
    return showToast("با حذف این نقطه قاب با قاب کناری هم‌پوشان می‌شود.");
  remember();
  applyGlobalPolygon(pn, next);
  pn.fitBasePoly = null;
  state.selectedVertex = null;
  p.isTiled = coverageOkay(p);
  p.boundaries = sharedEdges(p);
  renderAll();
}
function renderVertexControls() {
  const pn = panel(),
    add = $("#addVertexBtn"),
    rem = $("#removeVertexBtn");
  if (!add) return;
  const n = pn ? shapePolygon(pn).length : 0;
  if (state.selectedVertex != null && (!pn || state.selectedVertex >= n)) state.selectedVertex = null;
  add.disabled = !pn || pn.locked || n >= 12;
  rem.disabled = !pn || pn.locked || state.selectedVertex == null || n <= 3;
  $("#vertexCount").textContent = pn ? fa(n) : "—";
}
window.addEventListener("pointermove", e => {
  const d = state.drag;
  if (!d || e.pointerId !== d.pointerId || d.mode === "select") return;
  d.last = { x: e.clientX, y: e.clientY, alt: e.altKey };
  if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 4) d.moved = true;
  scheduleDrag();
});
window.addEventListener("pointerup", endDrag);
window.addEventListener("pointercancel", endDrag);
function touchSpan(t) {
  const [a, b] = [t[0], t[1]];
  return { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
}
// Touch events stay addressed to the element the finger first landed on. The page is re-rendered on
// pointerdown, so that element may already be detached; listeners are therefore attached to every frame
// shell as well as to the scroller, and each event is handled once.
let pinchFrame = 0,
  pinchNext = null;
function pinchStart(e) {
  if (e._comicPinch) return;
  e._comicPinch = true;
  if (e.touches.length !== 2) return;
  cancelDrag();
  pinch = { d0: Math.max(10, touchSpan(e.touches).d), z0: currentZoom() };
  e.preventDefault();
}
function pinchMove(e) {
  if (e._comicPinch) return;
  e._comicPinch = true;
  if (!pinch || e.touches.length < 2) return;
  e.preventDefault();
  const s1 = touchSpan(e.touches);
  pinchNext = { z: (pinch.z0 * s1.d) / pinch.d0, x: s1.x, y: s1.y };
  if (!pinchFrame)
    pinchFrame = requestAnimationFrame(() => {
      pinchFrame = 0;
      if (pinchNext) setZoom(pinchNext.z, pinchNext.x, pinchNext.y);
    });
}
function pinchEnd(e) {
  if (pinch && e.touches.length < 2) pinch = null;
}
function attachPinch(el) {
  el.addEventListener("touchstart", pinchStart, { passive: false });
  el.addEventListener("touchmove", pinchMove, { passive: false });
  el.addEventListener("touchend", pinchEnd);
  el.addEventListener("touchcancel", pinchEnd);
}
function bindPinch(scroller) {
  attachPinch(scroller);
}

function suggestedPosition(p, sz, shape, step = 5) {
  const axis = (size, edges) => [
      ...new Set(
        [...Array(Math.ceil((100 - size) / step) + 1)].map((_, i) => Math.min(i * step, 100 - size)).concat(100 - size, edges)
      )
    ],
    xs = axis(
      sz.w,
      p.panels.flatMap(q => [q.x + q.w, q.x - sz.w])
    ),
    ys = axis(
      sz.h,
      p.panels.flatMap(q => [q.y + q.h, q.y - sz.h])
    );
  let best = null;
  for (const y0 of ys)
    for (const x0 of xs) {
      const x = clamp(x0, 0, 100 - sz.w),
        y = clamp(y0, 0, 100 - sz.h),
        score = y * 0.04 + (100 - x) * 0.02;
      if (best && score >= best.score) continue;
      if (panelFits(p, newPanel(x, y, sz.w, sz.h, shape))) best = { x, y, score };
    }
  return best;
}
// Finds room for a new frame: the wanted size first, then smaller copies of it (same proportions) down to
// 8% of the page. Returns null only when even the smallest one has no place.
function findSlot(p, base, shape) {
  for (const s of [1, 0.85, 0.7, 0.58, 0.48, 0.4, 0.33, 0.27, 0.22]) {
    const sz = { w: base.w * s, h: base.h * s };
    if (Math.min(sz.w, sz.h) < 8 && s < 1) break;
    const spot = suggestedPosition(p, sz, shape, Math.max(2, 5 * s));
    if (spot) return { ...spot, ...sz, scale: s };
  }
  return null;
}
async function offerSplitInstead() {
  const p = page(),
    pr = PAGE_PRESETS[p.preset] || PAGE_PRESETS.vaziri,
    free = p.panels.filter(q => !q.locked).sort((a, b) => polyArea(globalPolygon(b)) - polyArea(globalPolygon(a)))[0];
  if (!free) return showToast("صفحه پر است و همهٔ قاب‌ها قفل‌اند؛ یک قفل را باز کنید.");
  const target = panel() && !panel().locked ? panel() : free;
  if (!(await ask(`صفحه جای خالی ندارد. قاب ${fa(panelNumber(target.id, p))} دو نیم شود؟`, { ok: "دو نیم شود", title: "جا برای قاب تازه نیست" })))
    return;
  state.selectedPanelId = target.id;
  splitPanel(target.w * pr.width >= target.h * pr.height ? "v" : "h");
}
function offerExpansion(pn) {
  const dialog = $("#expandPrompt"),
    p = page();
  if (!p.magnet || !dialog?.showModal) return;
  const initial = { x: pn.x, y: pn.y, w: pn.w, h: pn.h, shape: pn.shape, customPoly: pn.customPoly ? pn.customPoly.map(v => [...v]) : null };
  let possible = false;
  for (const btn of $$("[data-expand]", dialog)) {
    if (btn.dataset.expand === "none") continue;
    const changed = growPanel(p, pn, btn.dataset.expand);
    btn.disabled = !changed;
    possible = possible || changed;
    Object.assign(pn, initial);
  }
  if (possible) {
    state.pendingExpansionPanelId = pn.id;
    dialog.showModal();
  }
}
// Adds a free frame. With the magnet on it always finds a way: the wanted size, a smaller copy that fits, the
// exact shape of the largest free area, and finally an offer to split a frame.
function addFreePanel(shape, size, x = null, y = null) {
  const p = page();
  if (p.panels.length >= MAX_PANELS) return showToast("صفحه ۶ قاب دارد؛ برای قاب تازه یکی را حذف یا دو قاب را یکی کنید.");
  const base = sizePreset(size, p),
    at = (sz, cx, cy) => newPanel(clamp(cx - sz.w / 2, 0, 100 - sz.w), clamp(cy - sz.h / 2, 0, 100 - sz.h), sz.w, sz.h, shape);
  let pn = null,
    note = "";
  if (!p.magnet) pn = at(base, x ?? 100 - base.w / 2, y ?? base.h / 2);
  else {
    if (x !== null)
      for (const s of [1, 0.8, 0.62, 0.48, 0.36]) {
        const trial = at({ w: base.w * s, h: base.h * s }, x, y);
        if (panelFits(p, trial)) {
          pn = trial;
          if (s < 1) note = "قاب کوچک‌تر شد تا همین‌جا جا شود.";
          break;
        }
      }
    if (!pn) {
      const slot = findSlot(p, base, shape);
      if (slot) {
        pn = newPanel(slot.x, slot.y, slot.w, slot.h, shape);
        if (slot.scale < 1) note = "قاب کوچک‌تر شد تا جا شود.";
      }
    }
    if (!pn) {
      const cells = freeCells(p.panels.map(globalPolygon));
      if (cells && cellsArea(cells) >= 100) return addPanelInGap();
      return offerSplitInstead();
    }
  }
  remember();
  p.panels.forEach(q => delete q.order);
  p.panels.push(pn);
  p.isTiled = false;
  p.boundaries = [];
  p.targetCount = p.panels.length;
  state.selectedPanelId = pn.id;
  renderAll();
  if (note) showToast(note);
  offerExpansion(pn);
}
function addPanelInGap() {
  const p = page();
  if (p.panels.length >= MAX_PANELS) return showToast("صفحه حداکثر ۶ قاب دارد.");
  const cells = freeCells(p.panels.map(globalPolygon));
  if (!cells?.length || cellsArea(cells) < 1) return showToast("فضای خالیِ کافی برای قاب جدید پیدا نشد.");
  const groups = cellComponents(cells).sort((a, b) => cellsArea(b) - cellsArea(a)),
    poly = mergeCells(groups[0]) || [...groups[0]].sort((a, b) => polyArea(b) - polyArea(a))[0],
    pn = newPanel(0, 0, 20, 20);
  remember();
  applyGlobalPolygon(pn, poly);
  p.panels.push(pn);
  p.targetCount = p.panels.length;
  p.isTiled = coverageOkay(p);
  p.boundaries = sharedEdges(p);
  state.selectedPanelId = pn.id;
  renderAll();
  showToast("قاب تازه در بزرگ‌ترین فضای خالی نشست؛ برای بستن شکاف‌ها «جورچین کامل» را بزنید.");
}
async function clearFrames() {
  const p = page();
  if (!p.panels.length) return;
  if (
    p.panels.some(x => x.image) &&
    !(await ask("همهٔ قاب‌ها و تصاویر داخل آن‌ها پاک شوند؟", { ok: "پاک شود", danger: true }))
  )
    return;
  remember();
  p.panels = [];
  p.boundaries = [];
  state.selectedPanelId = null;
  renderAll();
}
function duplicatePanel() {
  const p = page(),
    pn = panel();
  if (!pn) return;
  if (p.panels.length >= MAX_PANELS) return showToast("صفحه ۶ قاب دارد؛ برای قاب تازه یکی را حذف یا دو قاب را یکی کنید.");
  let c = { ...clonePanel(pn), id: uid(), locked: false, image: pn.image ? { ...pn.image } : null },
    note = "";
  delete c.order;
  c.x = clamp(c.x - 4, 0, 100 - c.w);
  c.y = clamp(c.y + 4, 0, 100 - c.h);
  if (p.magnet && !panelFits(p, c)) {
    const slot = findSlot(p, { w: pn.w, h: pn.h }, "rect");
    if (!slot) return offerSplitInstead();
    c = { ...scaledPanel(c, slot), id: c.id, image: c.image };
    if (!panelFits(p, c)) {
      // a slanted copy may not fit where its bounding box does; fall back to a plain rectangle there
      c.customPoly = null;
      c.shape = "rect";
    }
    if (slot.scale < 1) note = "رونوشت کوچک‌تر شد تا جا شود.";
  }
  remember();
  p.panels.forEach(q => delete q.order);
  p.panels.push(c);
  p.isTiled = false;
  p.boundaries = [];
  state.selectedPanelId = c.id;
  renderAll();
  if (note) showToast(note);
  offerExpansion(c);
}
async function deletePanel() {
  const p = page(),
    pn = panel();
  if (!pn) return;
  if (
    !(await ask(`قاب ${fa(panelNumber(pn.id, p))}${pn.image ? " و تصویر داخل آن" : ""} حذف شود؟`, {
      ok: "حذف شود",
      danger: true
    }))
  )
    return;
  remember();
  const i = p.panels.findIndex(x => x.id === pn.id);
  p.panels.splice(i, 1);
  p.isTiled = false;
  p.boundaries = [];
  state.selectedPanelId = p.panels[Math.min(i, p.panels.length - 1)]?.id || null;
  renderAll();
}
// Applies ONE numeric field. The other three values come from the model, not from the (rounded) inputs, so
// re-entering the value that is already shown changes nothing.
function updateGeometry(field, snap = snapshot()) {
  const pn = panel(),
    p = page(),
    input = { x: els.frameX, y: els.frameY, w: els.frameW, h: els.frameH }[field];
  if (!pn || pn.locked || !input) return;
  const v = Number(input.value),
    current = { x: 100 - pn.x - pn.w, y: pn.y, w: pn.w, h: pn.h }[field];
  if (!Number.isFinite(v) || input.value === "" || Math.abs(v - Number(current.toFixed(2))) < 0.005) return renderControls();
  const before = clonePanel(pn),
    right = 100 - pn.x - pn.w;
  if (field === "w") {
    pn.w = clamp(v, 1, 100 - right);
    pn.x = 100 - right - pn.w;
  } else if (field === "h") pn.h = clamp(v, 1, 100 - pn.y);
  else if (field === "x") pn.x = 100 - pn.w - clamp(v, 0, 100 - pn.w);
  else pn.y = clamp(v, 0, 100 - pn.h);
  pn.fitBasePoly = null;
  guardPanelEdit(p, pn, before, snap);
}
// Gives the selected frame a ready proportion (on paper), keeping its width and its top-right corner.
function setFrameRatio(rw, rh) {
  const pn = panel(),
    p = page();
  if (!pn || pn.locked) return;
  const pr = PAGE_PRESETS[p.preset] || PAGE_PRESETS.vaziri,
    snap = snapshot(),
    before = clonePanel(pn),
    right = pn.x + pn.w;
  let w = pn.w,
    h = (((w / 100) * pr.width * rh) / rw / pr.height) * 100;
  if (h > 100 - pn.y) {
    h = 100 - pn.y;
    w = (((h / 100) * pr.height * rw) / rh / pr.width) * 100;
  }
  pn.w = w;
  pn.h = h;
  pn.x = right - w;
  pn.fitBasePoly = null;
  guardPanelEdit(p, pn, before, snap);
}
function nudgePanel(dir, n = 1) {
  const pn = panel(),
    p = page();
  if (!pn || pn.locked) return;
  const snap = snapshot(),
    before = clonePanel(pn);
  if (dir === "left") pn.x = clamp(pn.x - n, 0, 100 - pn.w);
  if (dir === "right") pn.x = clamp(pn.x + n, 0, 100 - pn.w);
  if (dir === "up") pn.y = clamp(pn.y - n, 0, 100 - pn.h);
  if (dir === "down") pn.y = clamp(pn.y + n, 0, 100 - pn.h);
  pn.fitBasePoly = null;
  guardPanelEdit(p, pn, before, snap);
}
function alignFrame(where) {
  const pn = panel(),
    p = page();
  if (!pn || pn.locked) return;
  const snap = snapshot(),
    before = clonePanel(pn);
  if (where === "right") pn.x = 100 - pn.w;
  if (where === "left") pn.x = 0;
  if (where === "center") pn.x = (100 - pn.w) / 2;
  if (where === "top") pn.y = 0;
  if (where === "bottom") pn.y = 100 - pn.h;
  if (where === "middle") pn.y = (100 - pn.h) / 2;
  pn.fitBasePoly = null;
  guardPanelEdit(p, pn, before, snap);
}
function reorderFrame(where) {
  const pn = panel(),
    p = page();
  if (!pn) return;
  remember();
  const layers = p.panels.map(x => x.layer || 0);
  pn.layer = where === "front" ? Math.max(...layers) + 1 : Math.min(...layers) - 1;
  if (Math.abs(pn.layer) > 10) {
    const order = drawOrder(p);
    order.forEach((x, i) => (x.layer = i));
  }
  renderAll();
  showToast("ترتیب نمایش قاب عوض شد.");
}
function alignImage(where) {
  const pn = panel();
  if (!pn?.image) return;
  remember();
  pn.image.panMode = "manual";
  if (where === "left") pn.image.panX = 0;
  if (where === "center") pn.image.panX = 50;
  if (where === "right") pn.image.panX = 100;
  if (where === "top") pn.image.panY = 0;
  if (where === "middle") pn.image.panY = 50;
  if (where === "bottom") pn.image.panY = 100;
  renderAll();
}
function randomizePanel() {
  const pn = panel(),
    p = page();
  if (!pn || pn.locked) return;
  const poly = globalPolygon(pn),
    target = poly.map(v => {
      if (
        p.panels.some(
          q =>
            q !== pn &&
            q.locked &&
            globalPolygon(q).some(
              (a, i, points) => projectPoint(v, a, points[(i + 1) % points.length]).dist < 0.12
            )
        )
      )
        return v;
      return [
        v[0] < 0.05 || v[0] > 99.95 ? v[0] : clamp(v[0] + (rand() - 0.5) * 5, 0, 100),
        v[1] < 0.05 || v[1] > 99.95 ? v[1] : clamp(v[1] + (rand() - 0.5) * 5, 0, 100)
      ];
    });
  if (!polygonIsValid(target)) return showToast("این تغییر شکل معتبر نیست؛ دوباره تلاش کنید.");
  const candidate = clonePanel(pn);
  applyGlobalPolygon(candidate, target);
  if (p.magnet && !panelFits({ ...p, panels: p.panels.filter(q => q !== pn) }, candidate))
    return showToast("این تغییر گوشه‌ها با آهنربای روشن به قاب کناری برخورد می‌کند.");
  remember();
  applyGlobalPolygon(pn, target);
  pn.fitBasePoly = poly;
  p.boundaries = [];
  renderAll();
}
