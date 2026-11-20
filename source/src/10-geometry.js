// هندسهٔ قاب‌ها: چندضلعی‌ها، چیدمان‌های آماده، پوشش کامل، آهنربا و جورچین
function shapePolygon(pn) {
  if (pn.customPoly?.length >= 3) return pn.customPoly;
  const s = clamp((pn.slant || 9) / 100, 0, 0.24);
  if (pn.shape === "diagonal")
    return [
      [s, 0],
      [1, 0],
      [1 - s, 1],
      [0, 1]
    ];
  if (pn.shape === "cut")
    return [
      [s, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, s]
    ];
  return [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1]
  ];
}
function polygonCss(points) {
  return `polygon(${points.map(([x, y]) => `${x * 100}% ${y * 100}%`).join(",")})`;
}
function globalPolygon(pn) {
  return shapePolygon(pn).map(([x, y]) => [pn.x + x * pn.w, pn.y + y * pn.h]);
}
function polygonBounds(poly) {
  const xs = poly.map(p => p[0]),
    ys = poly.map(p => p[1]);
  const x = Math.min(...xs),
    y = Math.min(...ys),
    r = Math.max(...xs),
    b = Math.max(...ys);
  return { x, y, w: Math.max(0.01, r - x), h: Math.max(0.01, b - y) };
}
function applyGlobalPolygon(pn, poly) {
  const b = polygonBounds(poly);
  pn.x = b.x;
  pn.y = b.y;
  pn.w = b.w;
  pn.h = b.h;
  pn.shape = "rect";
  pn.customPoly = poly.map(([x, y]) => [(x - b.x) / b.w, (y - b.y) / b.h]);
}
// Persian reading order: rows from top to bottom, right to left inside a row. A frame joins the current row
// when at least half of its height (or of the row anchor's height) overlaps the anchor. The result does not
// depend on the order of the panels array. A manual order (pn.order on every frame) wins.
function readingOrder(p = page()) {
  const list = [...p.panels];
  if (list.length && list.every(q => Number.isFinite(q.order)))
    return list.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));
  const tie = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  list.sort((a, b) => a.y - b.y || b.x - a.x || tie(a, b));
  const rows = [];
  for (const q of list) {
    const row = rows.at(-1),
      a = row?.[0];
    if (a && Math.min(a.y + a.h, q.y + q.h) - Math.max(a.y, q.y) >= 0.5 * Math.min(a.h, q.h) - 1e-9) row.push(q);
    else rows.push([q]);
  }
  return rows.flatMap(row => row.sort((a, b) => b.x + b.w / 2 - (a.x + a.w / 2) || a.y - b.y || tie(a, b)));
}
function panelNumber(id, p = page()) {
  return readingOrder(p).findIndex(x => x.id === id) + 1;
}
function drawOrder(p = page()) {
  return p.panels
    .map((pn, i) => ({ pn, i }))
    .sort((a, b) => (a.pn.layer || 0) - (b.pn.layer || 0) || a.i - b.i)
    .map(x => x.pn);
}
function frameSpecs(pn, p = page()) {
  const pr = PAGE_PRESETS[p.preset] || PAGE_PRESETS.vaziri,
    w = Math.max(1, Math.round((pr.width * pn.w) / 100)),
    h = Math.max(1, Math.round((pr.height * pn.h) / 100)),
    r = w / h,
    standards = [
      [16, 9],
      [3, 2],
      [4, 3],
      [1, 1],
      [4, 5],
      [2, 3],
      [9, 16]
    ],
    best = standards.reduce((a, b) =>
      Math.abs(Math.log(b[0] / b[1] / r)) < Math.abs(Math.log(a[0] / a[1] / r)) ? b : a
    );
  return {
    w,
    h,
    ratio: r.toFixed(2),
    standard: `${fa(best[0])}:${fa(best[1])}`,
    deviation: Math.round(Math.abs(r / (best[0] / best[1]) - 1) * 100)
  };
}
function polygonIsValid(poly) {
  if (poly.length < 3 || polyArea(poly) < 0.8) return false;
  const b = polygonBounds(poly);
  if (b.w < 1 || b.h < 1 || poly.some(([x, y]) => x < -0.001 || y < -0.001 || x > 100.001 || y > 100.001))
    return false;
  for (let i = 0; i < poly.length; i++)
    for (let j = i + 1; j < poly.length; j++) {
      if (j === i + 1 || (i === 0 && j === poly.length - 1)) continue;
      const a = poly[i],
        v = poly[(i + 1) % poly.length],
        c = poly[j],
        d = poly[(j + 1) % poly.length],
        cross = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
      if (cross(a, v, c) * cross(a, v, d) < -1e-7 && cross(c, d, a) * cross(c, d, v) < -1e-7) return false;
    }
  return true;
}
// Snaps one coordinate to page edges, the page centre and other frames. The threshold is 8 screen pixels,
// whatever the zoom. Every snap is recorded in state.snapLines so the stage can draw a guide.
function snapCoordinate(value, axis, pn, disabled = false) {
  if (disabled || !state.snap) return value;
  const candidates = [0, 50, 100];
  page().panels.forEach(q => {
    if (q === pn || q.id === pn.id) return;
    globalPolygon(q).forEach(v => candidates.push(v[axis]));
    candidates.push(axis === 0 ? q.x : q.y, axis === 0 ? q.x + q.w : q.y + q.h);
  });
  const px = axis === 0 ? state.pageSize.width : state.pageSize.height;
  let best = value,
    distance = (8 / Math.max(1, px)) * 100,
    hit = false;
  for (const n of candidates) {
    const d = Math.abs(value - n);
    if (d < distance) {
      distance = d;
      best = n;
      hit = true;
    }
  }
  if (hit) state.snapLines.push({ axis, value: best });
  return best;
}

function lineValue(point, axis, pos, slope) {
  return axis === "x"
    ? point[0] - (pos + slope * (point[1] - 50))
    : point[1] - (pos + slope * (point[0] - 50));
}
function clipPolygon(poly, axis, pos, slope, positive) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length],
      fa = lineValue(a, axis, pos, slope),
      fb = lineValue(b, axis, pos, slope),
      ina = positive ? fa >= -1e-7 : fa <= 1e-7,
      inb = positive ? fb >= -1e-7 : fb <= 1e-7;
    if (ina) out.push(a);
    if (ina !== inb) {
      const t = fa / (fa - fb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}
function splitPolygon(poly, axis, pos, slope = 0) {
  const neg = clipPolygon(poly, axis, pos, slope, false),
    posPoly = clipPolygon(poly, axis, pos, slope, true),
    hits = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length],
      fa = lineValue(a, axis, pos, slope),
      fb = lineValue(b, axis, pos, slope);
    if (Math.abs(fa) < 1e-6) hits.push(a);
    if (fa * fb < 0) {
      const t = fa / (fa - fb);
      hits.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  const uniq = hits.filter(
    (p, i) => hits.findIndex(q => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.01) === i
  );
  let boundary = null;
  if (uniq.length >= 2) {
    let best = [uniq[0], uniq[1]],
      dist = 0;
    for (let i = 0; i < uniq.length; i++)
      for (let j = i + 1; j < uniq.length; j++) {
        const d = Math.hypot(uniq[i][0] - uniq[j][0], uniq[i][1] - uniq[j][1]);
        if (d > dist) {
          dist = d;
          best = [uniq[i], uniq[j]];
        }
      }
    boundary = { a: best[0], b: best[1] };
  }
  return { neg, pos: posPoly, boundary };
}
function polyArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i],
      q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a / 2);
}
// 1 = hand-made (slightly irregular), 0 = regular. Set by applyTemplate from the page setting.
let layoutJitter = 1;
function partitionPoly(poly, count, mode, depth = 0, cuts = []) {
  if (count <= 1) return [poly];
  const b = polygonBounds(poly);
  let axis,
    first = Math.ceil(count / 2),
    slope = 0;
  if (mode === "strips") {
    axis = "y";
    first = 1;
  } else if (mode === "zigzag") {
    axis = "y";
    first = 1;
    slope = depth % 2 ? -0.19 : 0.19;
  } else if (mode === "diagonal" || mode === "action") {
    axis = depth % 2 ? "y" : "x";
    slope = (depth % 2 ? -0.17 : 0.22) * (depth % 3 === 0 ? 1 : -1);
  } else if (mode === "mosaic" || mode === "experimental") {
    axis = depth % 3 === 0 ? (b.w > b.h * 0.72 ? "x" : "y") : depth % 2 ? "x" : "y";
    first = Math.max(1, Math.min(count - 1, depth % 2 ? 1 : Math.floor(count / 2)));
    slope = mode === "experimental" ? (depth % 2 ? 0.16 : -0.13) : depth % 2 ? 0.035 : -0.025;
  } else if (mode === "random") {
    axis = rand() > b.w / (b.w + b.h) ? "y" : "x";
    first = Math.max(1, Math.min(count - 1, Math.round(count * (0.32 + rand() * 0.36))));
    slope = (rand() - 0.5) * 0.18;
  } else axis = b.w / (b.h || 1) > 1.05 ? "x" : b.h / (b.w || 1) > 1.05 ? "y" : depth % 2 ? "y" : "x";
  // Regular layouts (layoutJitter 0) use exact fractions; hand-made ones add a little irregularity.
  const J = mode === "random" ? 1 : layoutJitter;
  let ratio = first / count;
  if (J) {
    ratio = clamp(ratio, 0.25, 0.75);
    ratio =
      mode === "strips"
        ? clamp(ratio + (rand() - 0.5) * 0.06, 0.2, 0.32)
        : clamp(ratio + (rand() - 0.5) * 0.1, 0.25, 0.75);
  }
  if (mode === "grid" && depth > 0) slope = (rand() - 0.5) * 0.045 * J;
  const raw = axis === "x" ? b.x + b.w * ratio : b.y + b.h * ratio,
    pos = J
      ? clamp(
          raw,
          axis === "x" ? b.x + b.w * 0.2 : b.y + b.h * 0.2,
          axis === "x" ? b.x + b.w * 0.8 : b.y + b.h * 0.8
        )
      : raw,
    sp = splitPolygon(poly, axis, pos, slope);
  if (!sp.boundary || polyArea(sp.neg) < 20 || polyArea(sp.pos) < 20) {
    const fallback = splitPolygon(poly, axis, pos, 0);
    if (fallback.boundary) {
      cuts.push(fallback.boundary);
      return [
        ...partitionPoly(fallback.neg, first, mode, depth + 1, cuts),
        ...partitionPoly(fallback.pos, count - first, mode, depth + 1, cuts)
      ];
    }
  }
  if (sp.boundary) cuts.push(sp.boundary);
  return [
    ...partitionPoly(sp.neg, first, mode, depth + 1, cuts),
    ...partitionPoly(sp.pos, count - first, mode, depth + 1, cuts)
  ];
}
function templateGeometry(type, count) {
  const root = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100]
    ],
    cuts = [],
    J = layoutJitter;
  if (count === 1) return { regions: [root], cuts };
  if (type === "header" || type === "cinematic") {
    const y = (type === "cinematic" ? 42 : 32) + (rand() - 0.5) * 6 * J,
      sp = splitPolygon(root, "y", y, type === "cinematic" ? 0 : (rand() - 0.5) * 0.025 * J);
    cuts.push(sp.boundary);
    return {
      regions: [
        sp.neg,
        ...partitionPoly(sp.pos, count - 1, type === "cinematic" ? "strips" : "grid", 0, cuts)
      ],
      cuts
    };
  }
  if (type === "footer") {
    const sp = splitPolygon(root, "y", 68 + (rand() - 0.5) * 6 * J, (rand() - 0.5) * 0.025 * J);
    cuts.push(sp.boundary);
    return { regions: [...partitionPoly(sp.neg, count - 1, "grid", 0, cuts), sp.pos], cuts };
  }
  if (type === "diagonal") {
    const sp = splitPolygon(
      root,
      "y",
      49 + (rand() - 0.5) * 7 * J,
      (J && rand() < 0.5 ? -1 : 1) * (0.28 + rand() * 0.08 * J)
    );
    cuts.push(sp.boundary);
    const top = Math.ceil(count / 2);
    return {
      regions: [
        ...partitionPoly(sp.neg, top, "diagonal", 1, cuts),
        ...partitionPoly(sp.pos, count - top, "diagonal", 2, cuts)
      ],
      cuts
    };
  }
  if (type === "heroRight" || type === "action") {
    const sp = splitPolygon(
      root,
      "x",
      (type === "action" ? 59 : 56) + (rand() - 0.5) * 7 * J,
      type === "action" ? 0.22 + (rand() - 0.5) * 0.05 * J : (rand() - 0.5) * 0.025 * J
    );
    cuts.push(sp.boundary);
    return {
      regions: [
        sp.pos,
        ...partitionPoly(sp.neg, count - 1, type === "action" ? "zigzag" : "strips", 0, cuts)
      ],
      cuts
    };
  }
  if (type === "heroLeft") {
    const sp = splitPolygon(root, "x", 44 + (rand() - 0.5) * 7 * J, (rand() - 0.5) * 0.025 * J);
    cuts.push(sp.boundary);
    return { regions: [sp.neg, ...partitionPoly(sp.pos, count - 1, "strips", 0, cuts)], cuts };
  }
  if (type === "spotlight" && count >= 3) {
    const a = splitPolygon(root, "x", 29 + (rand() - 0.5) * 4 * J, -0.03),
      b = splitPolygon(a.pos, "x", 72 + (rand() - 0.5) * 4 * J, 0.04);
    cuts.push(a.boundary, b.boundary);
    const side = count - 1,
      leftCount = Math.ceil(side / 2),
      rightCount = side - leftCount;
    return {
      regions: [
        b.neg,
        ...partitionPoly(a.neg, leftCount, "strips", 0, cuts),
        ...partitionPoly(b.pos, Math.max(1, rightCount), "strips", 0, cuts)
      ].slice(0, count),
      cuts
    };
  }
  const mode =
    {
      grid: "grid",
      strips: "strips",
      diagonal: "diagonal",
      zigzag: "zigzag",
      mosaic: "mosaic",
      experimental: "experimental",
      random: "random"
    }[type] || "grid";
  return { regions: partitionPoly(root, count, mode, 0, cuts), cuts };
}
// Images are handed out in Persian reading order of the NEW frames (not in the order the regions were cut),
// so a re-layout never shuffles the story.
function buildPanels(p, type, count, images = []) {
  const g = templateGeometry(type, count);
  p.boundaries = g.cuts.filter(Boolean);
  p.isTiled = true;
  const panels = g.regions.map(poly => {
    const pn = newPanel(0, 0, 100, 100, "rect", null);
    // rounding removes float noise such as 1.6e-14 from the cuts, so a regular grid is exactly regular
    applyGlobalPolygon(pn, poly.map(roundPoint));
    return pn;
  });
  readingOrder({ panels }).forEach((pn, i) => (pn.image = images[i] || null));
  return panels;
}
// Applies a ready layout. It never throws away work silently: a hand-edited layout or images that would not
// fit are confirmed first, and re-applying the layout that is already on the page does nothing.
async function applyTemplate(type, count = page().targetCount, { reseed = false, force = false, style = null } = {}) {
  count = clamp(Number(count) || 1, 1, MAX_PANELS);
  const p = page();
  if (p.panels.some(x => x.locked)) {
    showToast("برای چیدمان تازه، اول قفل قاب‌ها را باز کنید؛ «جورچین کامل» با قفل هم کار می‌کند.");
    return false;
  }
  const edited = layoutEdited(p);
  if (!edited && !reseed && !force && p.panels.length === count && p.lastTemplate === type) {
    showToast("همین چیدمان روی صفحه است.");
    return true;
  }
  const images = readingOrder(p)
      .map(x => x.image)
      .filter(Boolean),
    warn = [];
  if (edited) warn.push("چیدمان دستی این صفحه جایگزین می‌شود.");
  if (images.length > count) warn.push(`${fa(images.length - count)} تصویر در چیدمان تازه جا نمی‌گیرد و از صفحه برداشته می‌شود.`);
  if (warn.length && !(await ask(`${warn.join(" ")} با «واگرد» برمی‌گردد. ادامه می‌دهید؟`, { ok: "ادامه", title: "جایگزینی چیدمان" })))
    return false;
  remember();
  if (reseed) p.layoutSeed = (p.layoutSeed || 1) + 1;
  if (style) p.layoutStyle = style;
  p.targetCount = count;
  p.lastTemplate = type;
  layoutJitter = p.layoutStyle === "hand" ? 1 : 0;
  try {
    p.panels = withSeed((p.layoutSeed || 1) * 7919 + count * 131 + TEMPLATE_KEYS.indexOf(type), () =>
      buildPanels(p, type, count, images)
    );
  } finally {
    layoutJitter = 1;
  }
  p.panels.forEach(q => delete q.order);
  p.templateSig = geoSig(p);
  state.selectedPanelId = null;
  state.selectedVertex = null;
  renderAll();
  showToast(reseed ? "نسخهٔ دیگری از این چیدمان ساخته شد." : "چیدمان ساخته شد.");
  return true;
}
// Applies a layout the user saved ("my layouts"): pure geometry, images follow in reading order.
async function applySavedLayout(shapes) {
  const p = page();
  if (p.panels.some(x => x.locked)) return showToast("برای چیدمان تازه، اول قفل قاب‌ها را باز کنید.");
  const images = readingOrder(p)
      .map(x => x.image)
      .filter(Boolean),
    warn = [];
  if (layoutEdited(p)) warn.push("چیدمان دستی این صفحه جایگزین می‌شود.");
  if (images.length > shapes.length) warn.push(`${fa(images.length - shapes.length)} تصویر جا نمی‌گیرد و برداشته می‌شود.`);
  if (warn.length && !(await ask(`${warn.join(" ")} با «واگرد» برمی‌گردد. ادامه می‌دهید؟`, { ok: "ادامه", title: "جایگزینی چیدمان" })))
    return;
  remember();
  const panels = shapes.slice(0, MAX_PANELS).map(poly => {
    const pn = newPanel(0, 0, 100, 100);
    applyGlobalPolygon(pn, poly.map(v => [...v]));
    return pn;
  });
  readingOrder({ panels }).forEach((pn, i) => (pn.image = images[i] || null));
  p.panels = panels;
  p.targetCount = panels.length;
  p.templateSig = geoSig(p);
  p.isTiled = coverageOkay(p);
  p.boundaries = sharedEdges(p);
  state.selectedPanelId = null;
  renderAll();
  showToast("چیدمان ذخیره‌شده روی صفحه نشست.");
}

function pointDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
function projectPoint(p, a, b) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    l = dx * dx + dy * dy || 1,
    t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l, 0, 1),
    q = [a[0] + dx * t, a[1] + dy * t];
  return { t, dist: pointDistance(p, q) };
}
function sharedEdges(p) {
  const edges = [];
  p.panels.forEach(pn => {
    const poly = globalPolygon(pn);
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length],
        len = pointDistance(a, b);
      if (len > 0.04) {
        let u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
        if (u[0] < -0.00001 || (Math.abs(u[0]) < 0.00001 && u[1] < 0)) u = u.map(v => -v);
        edges.push({ a, b, id: pn.id, u, offset: -u[1] * a[0] + u[0] * a[1] });
      }
    });
  });
  const groups = [];
  edges.forEach(e => {
    let g = groups.find(
      g => Math.abs(g.u[0] * e.u[1] - g.u[1] * e.u[0]) < 0.001 && Math.abs(g.offset - e.offset) < 0.065
    );
    if (!g) {
      g = { u: e.u, offset: e.offset, edges: [] };
      groups.push(g);
    }
    g.edges.push(e);
  });
  const result = [];
  groups.forEach(g => {
    if (new Set(g.edges.map(e => e.id)).size < 2) return;
    const u = g.u,
      n = [-u[1], u[0]],
      project = v => v[0] * u[0] + v[1] * u[1],
      ts = g.edges.flatMap(e => [project(e.a), project(e.b)]).sort((a, b) => a - b),
      uni = ts.filter((t, i) => i === 0 || Math.abs(t - ts[i - 1]) > 0.025);
    for (let i = 0; i < uni.length - 1; i++) {
      const t0 = uni[i],
        t1 = uni[i + 1];
      if (t1 - t0 < 0.025) continue;
      const mid = (t0 + t1) / 2,
        owners = new Set(
          g.edges
            .filter(e => {
              const lo = Math.min(project(e.a), project(e.b)),
                hi = Math.max(project(e.a), project(e.b));
              return mid >= lo - 0.03 && mid <= hi + 0.03;
            })
            .map(e => e.id)
        );
      if (owners.size < 2) continue;
      result.push({
        a: [u[0] * t0 + n[0] * g.offset, u[1] * t0 + n[1] * g.offset],
        b: [u[0] * t1 + n[0] * g.offset, u[1] * t1 + n[1] * g.offset]
      });
    }
  });
  return result;
}

function pointInPolygon(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (a[1] > pt[1] !== b[1] > pt[1] && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0])
      inside = !inside;
  }
  return inside;
}
function lockBadgePosition(poly) {
  let best = { score: -Infinity, point: [0.5, 0.5] };
  for (let y = 0.12; y <= 0.89; y += 0.08)
    for (let x = 0.12; x <= 0.89; x += 0.08) {
      const v = [x, y];
      if (!pointInPolygon(v, poly)) continue;
      const clearance = Math.min(
        ...poly.map((a, i) => projectPoint(v, a, poly[(i + 1) % poly.length]).dist)
      );
      const score = Math.min(clearance, 0.19) * 4 - 0.15 * (x + y);
      if (score > best.score) best = { score, point: v };
    }
  return best.point;
}
function coverageOkay(p) {
  if (!p.panels.length) return false;
  const polys = p.panels.map(globalPolygon);
  if (Math.abs(polys.reduce((s, x) => s + polyArea(x), 0) - 10000) > 2) return false;
  for (let y = 1.73; y < 100; y += 3.91)
    for (let x = 2.37; x < 100; x += 3.83)
      if (polys.reduce((n, poly) => n + (pointInPolygon([x, y], poly) ? 1 : 0), 0) !== 1) return false;
  return true;
}
const roundPoint = v => v.map(n => Math.round(n * 1e6) / 1e6);
function signedArea(poly) {
  let a = 0;
  poly.forEach((v, i) => {
    const b = poly[(i + 1) % poly.length];
    a += v[0] * b[1] - v[1] * b[0];
  });
  return a / 2;
}
function cleanPolygon(poly) {
  let out = poly.map(roundPoint).filter((v, i, a) => i === 0 || pointDistance(v, a[i - 1]) > 1e-5);
  if (out.length > 2 && pointDistance(out[0], out.at(-1)) < 1e-5) out.pop();
  let changed = true;
  while (changed && out.length > 3) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const a = out[(i + out.length - 1) % out.length],
        v = out[i],
        b = out[(i + 1) % out.length],
        cross = (v[0] - a[0]) * (b[1] - v[1]) - (v[1] - a[1]) * (b[0] - v[0]);
      if (Math.abs(cross) < 1e-5 && projectPoint(v, a, b).dist < 1e-5) {
        out.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return out;
}
function triangulate(poly) {
  const points = cleanPolygon(poly),
    sign = Math.sign(signedArea(points));
  if (points.length < 3 || !sign) return null;
  const result = [],
    indices = points.map((_, i) => i),
    cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  let attempts = 0;
  while (indices.length > 3 && attempts++ < 100) {
    let found = false;
    for (let k = 0; k < indices.length; k++) {
      const a = points[indices[(k + indices.length - 1) % indices.length]],
        b = points[indices[k]],
        c = points[indices[(k + 1) % indices.length]];
      if (cross(a, b, c) * sign < 1e-5) continue;
      const contains = indices.some(
        (ix, j) =>
          j !== k &&
          j !== (k + indices.length - 1) % indices.length &&
          j !== (k + 1) % indices.length &&
          [points[ix]].some(v => {
            const q = [cross(a, b, v), cross(b, c, v), cross(c, a, v)];
            return q.every(n => n * sign > 1e-5);
          })
      );
      if (contains) continue;
      result.push(sign > 0 ? [a, b, c] : [c, b, a]);
      indices.splice(k, 1);
      found = true;
      break;
    }
    if (!found) return null;
  }
  const tail = indices.map(i => points[i]);
  result.push(sign > 0 ? tail : tail.reverse());
  return result;
}
function halfClip(poly, a, b, inside) {
  const side = v => (b[0] - a[0]) * (v[1] - a[1]) - (b[1] - a[1]) * (v[0] - a[0]),
    out = [];
  for (let i = 0; i < poly.length; i++) {
    const v = poly[i],
      n = poly[(i + 1) % poly.length],
      sv = side(v),
      sn = side(n),
      isV = inside ? sv >= -1e-8 : sv <= 1e-8,
      isN = inside ? sn >= -1e-8 : sn <= 1e-8;
    if (isV) out.push(v);
    if (isV !== isN) {
      const t = sv / (sv - sn);
      out.push(roundPoint([v[0] + (n[0] - v[0]) * t, v[1] + (n[1] - v[1]) * t]));
    }
  }
  return cleanPolygon(out);
}
function subtractTriangle(cell, tri) {
  let inside = cell,
    outside = [];
  for (let i = 0; i < 3 && inside.length >= 3; i++) {
    const a = tri[i],
      b = tri[(i + 1) % 3],
      outer = halfClip(inside, a, b, false);
    if (outer.length >= 3 && polyArea(outer) > 0.0001) outside.push(outer);
    inside = halfClip(inside, a, b, true);
  }
  return outside;
}
function freeCells(fixed) {
  let cells = [
    [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100]
    ]
  ];
  for (const shape of fixed) {
    const tris = triangulate(shape);
    if (!tris) return null;
    for (const tri of tris) {
      cells = cells.flatMap(cell => subtractTriangle(cell, tri));
      if (cells.length > 140) return null;
    }
  }
  return cells.filter(cell => polyArea(cell) > 0.0001);
}
function intersectionArea(a, b) {
  const ba = polygonBounds(a),
    bb2 = polygonBounds(b);
  if (ba.x >= bb2.x + bb2.w || bb2.x >= ba.x + ba.w || ba.y >= bb2.y + bb2.h || bb2.y >= ba.y + ba.h) return 0;
  const aa = triangulate(a),
    bb = triangulate(b);
  if (!aa || !bb) return Infinity;
  let sum = 0;
  for (const x of aa)
    for (const y of bb) {
      let cut = x;
      for (let i = 0; i < 3 && cut.length >= 3; i++) cut = halfClip(cut, y[i], y[(i + 1) % 3], true);
      if (cut.length >= 3) sum += polyArea(cut);
    }
  return sum;
}
function panelFits(p, pn, limit = 0.0005) {
  const poly = globalPolygon(pn);
  return (
    polygonIsValid(poly) &&
    p.panels.every(q => q === pn || q.id === pn.id || intersectionArea(poly, globalPolygon(q)) < limit)
  );
}
// Total area this frame shares with the other frames of the page.
function overlapWith(p, pn) {
  const poly = globalPolygon(pn);
  let sum = 0;
  for (const q of p.panels) if (q !== pn && q.id !== pn.id) sum += intersectionArea(poly, globalPolygon(q));
  return sum;
}
// The magnet rule: a frame may go anywhere it does not overlap. A frame that already overlapped (magnet was off)
// may still move, as long as the overlap does not grow — so switching the magnet on never has to refuse.
function fitsOrBetter(p, pn, base = 0) {
  if (base <= 0.0005) return panelFits(p, pn);
  return polygonIsValid(globalPolygon(pn)) && overlapWith(p, pn) <= base + 1e-4;
}
function blockerOf(p, pn) {
  const poly = globalPolygon(pn);
  return p.panels.find(q => q !== pn && q.id !== pn.id && intersectionArea(poly, globalPolygon(q)) >= 0.0005) || null;
}
function clonePanel(q) {
  return { ...q, customPoly: q.customPoly ? q.customPoly.map(v => [...v]) : null, fitBasePoly: null };
}
function draftOf(p) {
  return { ...p, panels: p.panels.map(clonePanel) };
}
function copyGeometry(to, from) {
  to.x = from.x;
  to.y = from.y;
  to.w = from.w;
  to.h = from.h;
  to.shape = from.shape;
  to.customPoly = from.customPoly;
  to.fitBasePoly = null;
}
// Geometry fingerprint of a page: tells whether the layout still is the template that was applied.
function geoSig(p) {
  return p.panels
    .map(q =>
      globalPolygon(q)
        .map(v => v.map(n => n.toFixed(3)).join(","))
        .join(" ")
    )
    .sort()
    .join("|");
}
function layoutEdited(p) {
  return p.panels.length > 0 && p.templateSig !== geoSig(p);
}
// Continuous magnet move: go straight to the wanted spot if it is free; otherwise advance from the last valid
// position as far as possible, then slide along x and along y. No jumps to unrelated places.
function slideTo(p, pn, wx, wy, base = 0) {
  const ok = () => fitsOrBetter(p, pn, base),
    sx = pn.x,
    sy = pn.y;
  pn.x = wx;
  pn.y = wy;
  if (ok()) return true;
  pn.x = sx;
  pn.y = sy;
  const reach = (tx, ty) => {
    const ox = pn.x,
      oy = pn.y;
    if (Math.abs(tx - ox) + Math.abs(ty - oy) < 1e-6) return;
    pn.x = tx;
    pn.y = ty;
    if (ok()) return;
    let lo = 0,
      hi = 1;
    for (let i = 0; i < 12; i++) {
      const m = (lo + hi) / 2;
      pn.x = ox + (tx - ox) * m;
      pn.y = oy + (ty - oy) * m;
      if (ok()) lo = m;
      else hi = m;
    }
    pn.x = ox + (tx - ox) * lo;
    pn.y = oy + (ty - oy) * lo;
  };
  reach(wx, wy);
  reach(wx, pn.y);
  reach(pn.x, wy);
  return false;
}
function moveWithoutOverlap(p, pn, wantedX, wantedY) {
  const xs = [wantedX, pn.x, 0, 100 - pn.w],
    ys = [wantedY, pn.y, 0, 100 - pn.h];
  for (const q of p.panels)
    if (q !== pn) {
      xs.push(q.x - pn.w, q.x + q.w);
      ys.push(q.y - pn.h, q.y + q.h);
    }
  const values = (list, max) =>
    [...new Set(list.map(v => clamp(v, 0, max).toFixed(4)))]
      .map(Number)
      .sort((a, b) => Math.abs(a - list[0]) - Math.abs(b - list[0]));
  const old = [pn.x, pn.y],
    choices = [];
  for (const x of values(xs, 100 - pn.w))
    for (const y of values(ys, 100 - pn.h))
      choices.push({ x, y, score: (x - wantedX) ** 2 + (y - wantedY) ** 2 });
  choices.sort((a, b) => a.score - b.score);
  for (const v of choices) {
    pn.x = v.x;
    pn.y = v.y;
    if (panelFits(p, pn)) return true;
  }
  pn.x = old[0];
  pn.y = old[1];
  return false;
}
// Geometry fingerprint of one frame; used to skip empty undo steps.
function frameKey(q) {
  return JSON.stringify([q.x, q.y, q.w, q.h, q.shape, q.customPoly]);
}
// Accepts an edit of one frame. With the magnet on, an edit that would overlap is not refused: the frame goes
// as far as it can (binary search between the old and the wanted geometry) and the message names the frame in
// the way. `snap` is the undo snapshot taken before the edit; it is pushed only when something really changed.
function guardPanelEdit(p, pn, before, snap = null) {
  let note = "";
  const base = overlapWith(p, before);
  if (p.magnet && !fitsOrBetter(p, pn, base)) {
    const hit = blockerOf(p, pn),
      who = hit ? `قاب ${fa(panelNumber(hit.id, p))}` : "قاب کناری",
      wanted = { x: pn.x, y: pn.y, w: pn.w, h: pn.h },
      sameShape = before.shape === pn.shape && JSON.stringify(before.customPoly) === JSON.stringify(pn.customPoly);
    let lo = 0;
    if (sameShape) {
      let hi = 1;
      const at = t => {
        for (const k of ["x", "y", "w", "h"]) pn[k] = before[k] + (wanted[k] - before[k]) * t;
      };
      for (let i = 0; i < 14; i++) {
        const m = (lo + hi) / 2;
        at(m);
        if (fitsOrBetter(p, pn, base)) lo = m;
        else hi = m;
      }
      at(lo);
    }
    if (!sameShape || lo < 1e-3) {
      Object.assign(pn, before);
      renderAll();
      showToast(`${who} سر راه است؛ این تغییر انجام نشد.`);
      return false;
    }
    note = `تا لبهٔ ${who} جلو رفت.`;
  }
  if (snap && frameKey(before) !== frameKey(pn)) pushHistory(snap);
  p.isTiled = coverageOkay(p);
  p.boundaries = sharedEdges(p);
  renderAll();
  if (note) showToast(note);
  return true;
}
function shrinkAndPlace(space, q) {
  const original = clonePanel(q),
    candidates = [];
  for (let scale = 0.95; scale >= 0.35; scale -= 0.05)
    for (const axis of ["width", "height", "both"]) {
      const trial = clonePanel(q),
        w = q.w * (axis === "height" ? 1 : scale),
        h = q.h * (axis === "width" ? 1 : scale);
      trial.x = clamp(q.x + (q.w - w) / 2, 0, 100 - w);
      trial.y = clamp(q.y + (q.h - h) / 2, 0, 100 - h);
      trial.w = w;
      trial.h = h;
      if (!keepOrientation(original, trial, space)) continue;
      if (!panelFits(space, trial) && !moveWithoutOverlap(space, trial, trial.x, trial.y)) continue;
      if (!panelFits(space, trial)) continue;
      const score = (1 - (w * h) / (q.w * q.h)) * 45 + Math.hypot(trial.x - q.x, trial.y - q.y);
      candidates.push({ trial, score });
    }
  if (!candidates.length) return false;
  candidates.sort((a, b) => a.score - b.score);
  Object.assign(q, {
    x: candidates[0].trial.x,
    y: candidates[0].trial.y,
    w: candidates[0].trial.w,
    h: candidates[0].trial.h
  });
  return true;
}
// Smallest move along one axis that frees the frame.
function pushOut(space, q) {
  let best = null;
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ]) {
    const max = dx > 0 ? 100 - q.x - q.w : dx < 0 ? q.x : dy > 0 ? 100 - q.y - q.h : q.y,
      t = clonePanel(q),
      at = d => {
        t.x = q.x + dx * d;
        t.y = q.y + dy * d;
        return panelFits(space, t);
      };
    let found = null;
    for (let d = 1; d <= max + 1e-9 && found === null; d += 1) if (at(Math.min(d, max))) found = Math.min(d, max);
    if (found === null && max > 0 && at(max)) found = max;
    if (found === null) continue;
    let lo = Math.max(0, found - 1),
      hi = found;
    for (let i = 0; i < 10; i++) {
      const m = (lo + hi) / 2;
      if (at(m)) hi = m;
      else lo = m;
    }
    if (!best || hi < best.d) best = { d: hi, x: q.x + dx * hi, y: q.y + dy * hi };
  }
  return best;
}
// Cuts the parts covered by other frames away from a frame and keeps the largest remaining piece.
function clipAway(space, q) {
  const tris = triangulate(globalPolygon(q));
  if (!tris) return false;
  const original = polyArea(globalPolygon(q));
  let cells = tris;
  for (const o of space.panels) {
    const ot = triangulate(globalPolygon(o));
    if (!ot) return false;
    for (const tri of ot) {
      cells = cells.flatMap(c => subtractTriangle(c, tri));
      if (cells.length > 160) return false;
    }
  }
  cells = cells.filter(c => polyArea(c) > 0.01);
  if (!cells.length) return false;
  const groups = cellComponents(cells).sort((a, b) => cellsArea(b) - cellsArea(a)),
    shape = mergeCells(groups[0]);
  if (!shape || shape.length > 12 || !polygonIsValid(shape) || polyArea(shape) < original * 0.35) return false;
  const trial = clonePanel(q);
  applyGlobalPolygon(trial, shape);
  if (!panelFits(space, trial)) return false;
  copyGeometry(q, trial);
  return true;
}
// Separates overlapping frames with the least damage: a short push first, then trimming the covered part,
// then a longer push, and shrinking only as the last resort. Locked frames never change. Returns true when
// no overlap is left; frames that could not be freed stay as they were.
function resolveMagnetOverlaps(p) {
  const area = q => polyArea(globalPolygon(q)),
    ordered = [...p.panels.filter(q => q.locked), ...p.panels.filter(q => !q.locked).sort((a, b) => area(b) - area(a))],
    placed = [];
  let all = true;
  for (const q of ordered) {
    const space = { ...p, panels: placed };
    if (!panelFits(space, q)) {
      let done = false;
      if (!q.locked) {
        const push = pushOut(space, q);
        if (push && push.d <= 12) {
          q.x = push.x;
          q.y = push.y;
          done = true;
        } else if (clipAway(space, q)) done = true;
        else if (push) {
          q.x = push.x;
          q.y = push.y;
          done = true;
        } else done = shrinkAndPlace(space, q);
      }
      if (!done) all = false;
    }
    placed.push(q);
  }
  return all;
}
function scaledPanel(pn, next) {
  const poly = globalPolygon(pn),
    old = { x: pn.x, y: pn.y, w: pn.w, h: pn.h };
  const result = clonePanel(pn);
  applyGlobalPolygon(
    result,
    poly.map(([x, y]) => [next.x + ((x - old.x) / old.w) * next.w, next.y + ((y - old.y) / old.h) * next.h])
  );
  return result;
}
function keepOrientation(original, candidate, p) {
  const pr = PAGE_PRESETS[p.preset] || PAGE_PRESETS.vaziri,
    aspect = q => (q.w * pr.width) / (q.h * pr.height),
    start = aspect(original),
    end = aspect(candidate);
  return start < 0.9 ? end < 0.99 : start > 1.1 ? end > 1.01 : true;
}
function growPanel(p, pn, axes = "both") {
  if (pn.locked) return false;
  const initial = clonePanel(pn),
    order =
      initial.w * (PAGE_PRESETS[p.preset] || PAGE_PRESETS.vaziri).width <
      initial.h * (PAGE_PRESETS[p.preset] || PAGE_PRESETS.vaziri).height
        ? ["top", "bottom", "left", "right"]
        : ["left", "right", "top", "bottom"];
  let changed = false;
  for (const side of order) {
    if (
      (axes === "height" && ["left", "right"].includes(side)) ||
      (axes === "width" && ["top", "bottom"].includes(side))
    )
      continue;
    const original = { x: pn.x, y: pn.y, w: pn.w, h: pn.h },
      room =
        side === "left"
          ? pn.x
          : side === "right"
            ? 100 - pn.x - pn.w
            : side === "top"
              ? pn.y
              : 100 - pn.y - pn.h;
    if (room < 0.15) continue;
    let low = 0,
      high = room,
      best = null;
    for (let i = 0; i < 18; i++) {
      const n = (low + high) / 2,
        box = { ...original };
      if (side === "left") {
        box.x -= n;
        box.w += n;
      } else if (side === "right") box.w += n;
      else if (side === "top") {
        box.y -= n;
        box.h += n;
      } else box.h += n;
      const q = scaledPanel(pn, box);
      if (
        keepOrientation(initial, q, p) &&
        panelFits({ ...p, panels: p.panels.filter(x => x !== pn) }, q, 0.0001)
      ) {
        low = n;
        best = q;
      } else high = n;
    }
    if (best && low > 0.15) {
      Object.assign(pn, {
        x: best.x,
        y: best.y,
        w: best.w,
        h: best.h,
        shape: best.shape,
        customPoly: best.customPoly
      });
      changed = true;
    }
  }
  return changed;
}
function inPage(poly) {
  return poly.every(([x, y]) => x >= -0.001 && y >= -0.001 && x <= 100.001 && y <= 100.001);
}
function snapToPage(poly) {
  const s = n => (n < 0.02 ? 0 : n > 99.98 ? 100 : n);
  return poly.map(([x, y]) => [s(x), s(y)]);
}
function lineHit(p1, d1, p2, d2) {
  const c = d1[0] * d2[1] - d1[1] * d2[0];
  if (Math.abs(c) < 1e-9) return null;
  const t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / c;
  return [p1[0] + d1[0] * t, p1[1] + d1[1] * t];
}
// Moves edge i of a polygon by `dist` along its outward normal. The two ends slide along the lines of the
// neighbouring edges, so the frame keeps its angles (a rectangle stays a rectangle, a slanted side stays slanted).
function offsetEdge(poly, i, dist) {
  const n = poly.length,
    a = poly[i],
    b = poly[(i + 1) % n],
    pv = poly[(i + n - 1) % n],
    nx = poly[(i + 2) % n],
    len = pointDistance(a, b);
  if (len < 1e-6) return null;
  const sign = signedArea(poly) > 0 ? 1 : -1,
    u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len],
    nrm = [u[1] * sign, -u[0] * sign],
    o = [a[0] + nrm[0] * dist, a[1] + nrm[1] * dist],
    slide = (from, dir) => {
      const l = Math.hypot(dir[0], dir[1]);
      if (l < 1e-6 || Math.abs(dir[0] * u[1] - dir[1] * u[0]) / l < 0.08) return null;
      return lineHit(o, u, from, dir);
    },
    na = slide(a, [a[0] - pv[0], a[1] - pv[1]]) || [a[0] + nrm[0] * dist, a[1] + nrm[1] * dist],
    nb = slide(b, [nx[0] - b[0], nx[1] - b[1]]) || [b[0] + nrm[0] * dist, b[1] + nrm[1] * dist],
    out = poly.map(v => [...v]);
  out[i] = na;
  out[(i + 1) % n] = nb;
  return out;
}
// "Fit edges": every free edge of the target frames is pushed outwards until it touches a frame or the page
// edge. All edges advance together in small steps so neighbouring frames meet in the middle. No vertex is added.
function pushEdges(p, targets = p.panels.filter(q => !q.locked)) {
  const blocked = new Set(),
    STEP = 4;
  let changed = false;
  const tryEdge = (pn, i, d) => {
    const moved = offsetEdge(globalPolygon(pn), i, d);
    if (!moved || !inPage(moved)) return null;
    const poly = snapToPage(moved);
    if (!polygonIsValid(poly)) return null;
    const trial = clonePanel(pn);
    applyGlobalPolygon(trial, poly);
    return panelFits(p, trial, 0.0001) ? trial : null;
  };
  for (let pass = 0; pass < 40; pass++) {
    let moved = false;
    for (const pn of targets) {
      if (pn.locked) continue;
      const n = shapePolygon(pn).length;
      for (let i = 0; i < n; i++) {
        const key = `${pn.id}:${i}`;
        if (blocked.has(key)) continue;
        let best = tryEdge(pn, i, STEP);
        if (!best) {
          let lo = 0,
            hi = STEP;
          for (let k = 0; k < 14; k++) {
            const m = (lo + hi) / 2,
              t = tryEdge(pn, i, m);
            if (t) {
              lo = m;
              best = t;
            } else hi = m;
          }
          blocked.add(key);
          if (lo < 0.02) best = null;
        }
        if (best) {
          copyGeometry(pn, best);
          moved = changed = true;
        }
      }
    }
    if (!moved) break;
  }
  return changed;
}
function splitCells(cells, axis, pos, slope = 0) {
  const low = [],
    high = [];
  for (const cell of cells) {
    const parts = splitPolygon(cell, axis, pos, slope);
    if (parts.neg.length >= 3 && polyArea(parts.neg) > 0.0001) low.push(cleanPolygon(parts.neg));
    if (parts.pos.length >= 3 && polyArea(parts.pos) > 0.0001) high.push(cleanPolygon(parts.pos));
  }
  return [low, high];
}
function cellComponents(cells) {
  const comp = [],
    remaining = new Set(cells.map((_, i) => i)),
    touch = (a, b) =>
      a.some((p, i) =>
        b.some((q, j) => {
          const r = a[(i + 1) % a.length],
            s = b[(j + 1) % b.length],
            d = projectPoint(p, q, s),
            e = projectPoint(r, q, s);
          return d.dist < 0.0002 && e.dist < 0.0002 && Math.abs(e.t - d.t) > 0.0001;
        })
      );
  while (remaining.size) {
    const start = remaining.values().next().value,
      queue = [start],
      group = [];
    remaining.delete(start);
    while (queue.length) {
      const i = queue.pop();
      group.push(cells[i]);
      for (const j of [...remaining])
        if (touch(cells[i], cells[j]) || touch(cells[j], cells[i])) {
          remaining.delete(j);
          queue.push(j);
        }
    }
    comp.push(group);
  }
  return comp;
}
function mergeCells(cells) {
  if (!cells.length) return null;
  const vertices = cells.flat(),
    key = v =>
      roundPoint(v)
        .map(n => n.toFixed(5))
        .join(","),
    edges = new Map();
  for (let poly of cells) {
    if (signedArea(poly) < 0) poly = [...poly].reverse();
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length],
        cuts = vertices
          .map(v => ({ v, t: projectPoint(v, a, b) }))
          .filter(x => x.t.dist < 0.0001)
          .sort((x, y) => x.t.t - y.t.t),
        points = [a, ...cuts.map(x => x.v), b].filter(
          (v, j, arr) => j === 0 || pointDistance(v, arr[j - 1]) > 0.00001
        );
      for (let j = 0; j < points.length - 1; j++) {
        const start = roundPoint(points[j]),
          end = roundPoint(points[j + 1]),
          id = key(start) + ">" + key(end),
          reverse = key(end) + ">" + key(start);
        if (edges.has(reverse)) edges.delete(reverse);
        else edges.set(id, { start, end });
      }
    });
  }
  if (!edges.size) return null;
  const outgoing = new Map();
  for (const e of edges.values()) {
    const k = key(e.start);
    if (!outgoing.has(k)) outgoing.set(k, []);
    outgoing.get(k).push(e);
  }
  const loops = [],
    used = new Set();
  for (const edge of edges.values()) {
    if (used.has(edge)) continue;
    const start = key(edge.start),
      poly = [];
    let current = edge;
    let guard = 0;
    while (current && !used.has(current) && guard++ < 2000) {
      used.add(current);
      poly.push(current.start);
      const next = key(current.end);
      if (next === start) break;
      const candidates = (outgoing.get(next) || []).filter(e => !used.has(e));
      current = candidates.length === 1 ? candidates[0] : null;
    }
    if (!current || key(current.end) !== start) return null;
    loops.push(cleanPolygon(poly));
  }
  if (loops.length !== 1) return null;
  const result = loops[0];
  return Math.abs(polyArea(result) - cells.reduce((s, c) => s + polyArea(c), 0)) < 0.04 ? result : null;
}
function fillPolygonGaps(p, mode = "corners", targets = p.panels.filter(q => !q.locked)) {
  let changed = false;
  const rejected = new Set();
  for (let step = 0; step < 110; step++) {
    const cells = freeCells(p.panels.map(globalPolygon));
    if (!cells?.length) break;
    cells.sort((a, b) => polyArea(a) - polyArea(b));
    let choice = null;
    for (const cell of cells) {
      const area = polyArea(cell);
      if (area < 0.02) continue;
      const signature = cell.map(v => v.map(n => n.toFixed(2)).join(",")).join(";");
      if (rejected.has(signature)) continue;
      for (const q of targets) {
        if (q.locked || (mode === "corners" && area > 300)) continue;
        const joined = mergeCells([globalPolygon(q), cell]);
        if (!joined || !polygonIsValid(joined)) continue;
        const next = clonePanel(q);
        applyGlobalPolygon(next, joined);
        const flips = !keepOrientation(q, next, p);
        if (
          (flips && mode === "corners") ||
          joined.length > 12 ||
          !panelFits({ ...p, panels: p.panels.filter(x => x !== q) }, next, 0.0001)
        )
          continue;
        const oldCenter = [q.x + q.w / 2, q.y + q.h / 2],
          newCenter = [next.x + next.w / 2, next.y + next.h / 2],
          score =
            pointDistance(oldCenter, newCenter) * 3 +
            Math.abs(Math.log(next.w / next.h / (q.w / q.h))) * 12 +
            (area / Math.max(1, polyArea(globalPolygon(q)))) * 20 +
            (flips ? 30 : 0);
        if (!choice || score < choice.score) choice = { q, next, score };
      }
      if (choice) break;
      rejected.add(signature);
    }
    if (!choice) break;
    Object.assign(choice.q, {
      x: choice.next.x,
      y: choice.next.y,
      w: choice.next.w,
      h: choice.next.h,
      shape: choice.next.shape,
      customPoly: choice.next.customPoly,
      fitBasePoly: null
    });
    changed = true;
    rejected.clear();
  }
  return changed;
}
function cellsArea(cells) {
  return cells.reduce((sum, cell) => sum + polyArea(cell), 0);
}
function cellCenter(cells) {
  let x = 0,
    y = 0,
    area = 0;
  for (const cell of cells) {
    const a = polyArea(cell),
      b = polygonBounds(cell);
    x += (b.x + b.w / 2) * a;
    y += (b.y + b.h / 2) * a;
    area += a;
  }
  return [area ? x / area : 50, area ? y / area : 50];
}
// A single convex fixed frame always has a simple, exact complement. Peel its
// outside half-planes in order instead of relying on the heuristic partitioner.
function singleFixedComplement(shape) {
  const poly = cleanPolygon(shape),
    sign = Math.sign(signedArea(poly));
  if (poly.length < 3 || !sign) return null;
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (poly.some((v, i) => poly.some(w => cross(v, poly[(i + 1) % poly.length], w) * sign < -0.001)))
    return null;
  let remainder = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100]
    ],
    regions = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length],
      outside = halfClip(remainder, a, b, sign < 0);
    if (outside.length >= 3 && polyArea(outside) > 0.8) regions.push(outside);
    remainder = halfClip(remainder, a, b, sign > 0);
    if (remainder.length < 3) break;
  }
  return Math.abs(regions.reduce((s, q) => s + polyArea(q), 0) + polyArea(shape) - 10000) < 0.08
    ? regions
    : null;
}
function assignComplement(regions, free, fixed, p) {
  if (!regions?.length || fixed.length + Math.max(regions.length, free.length) > MAX_PANELS) return null;
  regions = regions.map(cleanPolygon);
  free = free.map(clone);
  while (regions.length < free.length) {
    const i = regions.reduce((best, r, j) => (polyArea(r) > polyArea(regions[best]) ? j : best), 0),
      r = regions[i],
      b = polygonBounds(r),
      axis = b.w >= b.h ? "x" : "y",
      sp = splitPolygon(r, axis, axis === "x" ? b.x + b.w / 2 : b.y + b.h / 2);
    if (polyArea(sp.neg) < 1 || polyArea(sp.pos) < 1) return null;
    regions.splice(i, 1, cleanPolygon(sp.neg), cleanPolygon(sp.pos));
  }
  while (free.length < regions.length) {
    const c = cellCenter([regions[free.length]]),
      extra = newPanel(clamp(c[0] - 14, 0, 72), clamp(c[1] - 14, 0, 72), 28, 28);
    extra.autoAdded = true;
    free.push(extra);
  }
  let best = null;
  function search(index, remaining, chosen, score) {
    if (index === free.length) {
      if (!best || score < best.score) best = { chosen: [...chosen], score };
      return;
    }
    const q = free[index],
      center = [q.x + q.w / 2, q.y + q.h / 2];
    for (const i of remaining) {
      const r = regions[i],
        b = polygonBounds(r);
      if (!q.autoAdded && !keepOrientation(q, b, p)) continue;
      const rc = cellCenter([r]),
        cost = pointDistance(center, rc) + Math.abs(Math.log(b.w / b.h / (q.w / q.h))) * 14;
      if (best && score + cost >= best.score) continue;
      chosen.push(i);
      search(
        index + 1,
        remaining.filter(j => j !== i),
        chosen,
        score + cost
      );
      chosen.pop();
    }
  }
  search(
    0,
    regions.map((_, i) => i),
    [],
    0
  );
  if (!best) return null;
  free.forEach((q, i) => {
    applyGlobalPolygon(q, regions[best.chosen[i]]);
    q.fitBasePoly = null;
    delete q.autoAdded;
  });
  return [...fixed.map(clone), ...free];
}
function partitionCells(cells, items, budget = { tries: 0 }) {
  if (!cells.length || !items.length || ++budget.tries > 2400) return null;
  if (items.length === 1) {
    const shape = mergeCells(cells);
    if (!shape || polyArea(shape) <= 1) return null;
    const bounds = polygonBounds(shape);
    return budget.page && !items[0].autoAdded && !keepOrientation(items[0], bounds, budget.page)
      ? null
      : new Map([[items[0].id, shape]]);
  }
  const bounds = polygonBounds(cells.flat()),
    centers = items.map(q => [q.x + q.w / 2, q.y + q.h / 2]),
    spread = axis => Math.max(...centers.map(v => v[axis])) - Math.min(...centers.map(v => v[axis]));
  const axes =
    spread(0) / Math.max(1, bounds.w) > spread(1) / Math.max(1, bounds.h) ? ["x", "y"] : ["y", "x"];
  for (const axis of axes) {
    const coordinate = axis === "x" ? 0 : 1,
      ordered = [...items].sort(
        (a, b) =>
          (a.x + a.w / 2) * (1 - coordinate) +
          (a.y + a.h / 2) * coordinate -
          ((b.x + b.w / 2) * (1 - coordinate) + (b.y + b.h / 2) * coordinate)
      ),
      base = coordinate ? bounds.y : bounds.x,
      size = coordinate ? bounds.h : bounds.w;
    for (const k of [...Array(items.length - 1)]
      .map((_, i) => i + 1)
      .sort((a, b) => Math.abs(a - items.length / 2) - Math.abs(b - items.length / 2))) {
      const ratio = k / items.length,
        ca = ordered[k - 1],
        cb = ordered[k],
        mid = coordinate
          ? (ca.y + ca.h / 2 + (cb.y + cb.h / 2)) / 2
          : (ca.x + ca.w / 2 + (cb.x + cb.w / 2)) / 2;
      let lo = base,
        hi = base + size;
      for (let t = 0; t < 18; t++) {
        const m = (lo + hi) / 2,
          area = cellsArea(splitCells(cells, axis, m)[0]);
        if (area < cellsArea(cells) * ratio) lo = m;
        else hi = m;
      }
      const areaPos = (lo + hi) / 2,
        positions = [
          mid,
          areaPos,
          base + size * ratio,
          base + size * 0.5,
          base + size * 0.35,
          base + size * 0.65
        ].map(v => clamp(v, base + size * 0.07, base + size * 0.93));
      positions.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
      for (const pos of positions) {
        const [left, right] = splitCells(cells, axis, pos);
        if (cellsArea(left) < k * 3 || cellsArea(right) < (items.length - k) * 3) continue;
        const a = partitionCells(left, ordered.slice(0, k), budget);
        if (!a) continue;
        const b = partitionCells(right, ordered.slice(k), budget);
        if (b) return new Map([...a, ...b]);
      }
    }
  }
  return null;
}
function constrainedLayout(p, anchor = null) {
  const fixed = p.panels.filter(q => q.locked || q.id === anchor?.id),
    shapes = fixed.map(globalPolygon),
    cells = freeCells(shapes);
  if (!cells) return { error: "شکل یکی از قاب‌های ثابت برای جورچین معتبر نیست." };
  const available = cellsArea(cells),
    fixedArea = shapes.reduce((s, poly) => s + polyArea(poly), 0);
  if (Math.abs(available + fixedArea - 10000) > 0.08)
    return {
      error:
        anchor && !anchor.locked
          ? "قاب انتخاب‌شده با قاب قفل‌شده هم‌پوشانی دارد؛ آن را جابه‌جا کنید یا از بازچینی کامل استفاده کنید."
          : "دو قاب قفل‌شده روی هم افتاده‌اند؛ یکی را باز کنید تا بتوان صفحه را بدون هم‌پوشانی پُر کرد."
    };
  let free = p.panels.filter(q => !fixed.includes(q)).map(q => clonePanel(q));
  if (available < 0.05) {
    return free.length
      ? { error: "قاب‌های ثابت تمام صفحه را پوشانده‌اند؛ قاب‌های آزاد را حذف یا قفل‌ها را باز کنید." }
      : { panels: p.panels.map(clone) };
  }
  const components = cellComponents(cells);
  while (free.length < components.length) {
    if (fixed.length + free.length >= MAX_PANELS)
      return { error: "فضای آزاد چند بخش جدا دارد و سقف ۶ قاب اجازهٔ افزودن قاب مکمل نمی‌دهد." };
    const c = components[free.length],
      v = cellCenter(c),
      extra = newPanel(clamp(v[0] - 14, 0, 72), clamp(v[1] - 14, 0, 72), 28, 28);
    extra.autoAdded = true;
    free.push(extra);
  }
  if (!free.length) {
    if (p.panels.length >= MAX_PANELS)
      return { error: "برای فضای خالی به یک قاب دیگر نیاز است، اما صفحه به سقف ۶ قاب رسیده است." };
    const v = cellCenter(cells),
      extra = newPanel(clamp(v[0] - 14, 0, 72), clamp(v[1] - 14, 0, 72), 28, 28);
    extra.autoAdded = true;
    free.push(extra);
  }
  let result = null;
  while (fixed.length + free.length <= MAX_PANELS) {
    result = partitionCells(cells, free, { tries: 0, page: p });
    if (result) break;
    if (fixed.length + free.length === MAX_PANELS) break;
    const biggest = [...cells].sort((a, b) => polyArea(b) - polyArea(a))[0],
      b = polygonBounds(biggest),
      extra = newPanel(clamp(b.x + b.w * 0.55, 0, 85), clamp(b.y + b.h * 0.45, 0, 85), 15, 15);
    extra.autoAdded = true;
    free.push(extra);
  }
  if (!result) {
    const fallback =
      fixed.length === 1
        ? assignComplement(
            singleFixedComplement(shapes[0]),
            p.panels.filter(q => !fixed.includes(q)),
            fixed,
            p
          )
        : null;
    if (fallback && coverageOkay({ ...p, panels: fallback })) return { panels: fallback };
    return {
      error:
        "با قفل‌ها و جهت فعلی قاب‌ها، این فضای خالی با حداکثر ۶ قاب پُر نمی‌شود؛ یک قاب را باز یا جای قاب‌های آزاد را کمی تغییر دهید."
    };
  }
  free.forEach(q => {
    applyGlobalPolygon(q, result.get(q.id));
    q.fitBasePoly = null;
    delete q.autoAdded;
  });
  const next = { ...p, panels: [...fixed.map(clone), ...free] };
  if (!coverageOkay(next))
    return {
      error:
        "اتصال ضلع‌ها در این شکل پایدار نشد؛ زاویهٔ یکی از قاب‌های آزاد را کمی تغییر دهید و دوباره بزنید."
    };
  return { panels: next.panels };
}



// ───── Mesh editing: frames that share a border move it together ─────
const MESH_EPS = 0.08;
// Gives every free frame a vertex wherever another frame's corner touches the middle of one of its edges
// (T-junction), so the shared corner can later be moved in all frames at once. Returns the refined frames.
function meshRefine(panels) {
  const pts = panels.flatMap(q => globalPolygon(q)),
    touched = new Set();
  for (const pn of panels) {
    if (pn.locked) continue;
    const poly = globalPolygon(pn),
      out = [];
    let added = false;
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length],
        len = pointDistance(a, b),
        ins = [];
      for (const v of pts) {
        const h = projectPoint(v, a, b);
        if (h.dist >= MESH_EPS || pointDistance(v, a) <= MESH_EPS || pointDistance(v, b) <= MESH_EPS) continue;
        if (ins.some(q => Math.abs(q.t - h.t) * len < MESH_EPS)) continue;
        ins.push({ t: h.t, p: [a[0] + (b[0] - a[0]) * h.t, a[1] + (b[1] - a[1]) * h.t] });
      }
      ins.sort((x, y) => x.t - y.t);
      out.push(a, ...ins.map(q => q.p));
      added = added || ins.length > 0;
    });
    if (added && out.length <= 24) {
      applyGlobalPolygon(pn, out);
      touched.add(pn);
    }
  }
  return touched;
}
function meshClusters(panels) {
  const clusters = [];
  panels.forEach(pn =>
    globalPolygon(pn).forEach((pt, i) => {
      const c = clusters.find(c => pointDistance(c.pt, pt) < MESH_EPS);
      if (c) c.members.push({ pn, i });
      else clusters.push({ pt, members: [{ pn, i }] });
    })
  );
  return clusters;
}
function setVertex(pn, i, pt) {
  const poly = globalPolygon(pn);
  poly[i] = pt;
  applyGlobalPolygon(pn, poly);
}
// "Border variety": moves shared corners of free frames, in every frame that meets there, so the page stays
// exactly as covered as it was. strength 1..3; the same seed always gives the same result.
function varyBorders(p, strength = 2, seed = 1) {
  return withSeed(seed * 2654435761, () => {
    const d = draftOf(p),
      refined = meshRefine(d.panels),
      tiled = coverageOkay(d),
      lockedPolys = d.panels.filter(q => q.locked).map(globalPolygon),
      nearLocked = pt => lockedPolys.some(poly => poly.some((a, i) => projectPoint(pt, a, poly[(i + 1) % poly.length]).dist < 0.12)),
      edge = n => n < 0.05 || n > 99.95,
      pool = meshClusters(d.panels)
        .filter(c => c.members.length > 1 && c.members.every(m => !m.pn.locked) && !nearLocked(c.pt) && !(edge(c.pt[0]) && edge(c.pt[1])))
        .map(c => ({ c, k: rand() }))
        .sort((a, b) => a.k - b.k)
        .map(x => x.c),
      size = [1.5, 3, 6][clamp(strength, 1, 3) - 1],
      want = [1, 2, 3][clamp(strength, 1, 3) - 1];
    let moved = 0;
    for (const c of pool) {
      if (moved >= want) break;
      for (let attempt = 0; attempt < 6; attempt++) {
        const ang = rand() * Math.PI * 2,
          m = size * (0.6 + rand() * 0.4) * (attempt < 3 ? 1 : 0.5),
          to = [
            edge(c.pt[0]) ? c.pt[0] : clamp(c.pt[0] + Math.cos(ang) * m, 1, 99),
            edge(c.pt[1]) ? c.pt[1] : clamp(c.pt[1] + Math.sin(ang) * m, 1, 99)
          ],
          backup = c.members.map(mm => clonePanel(mm.pn));
        c.members.forEach(mm => setVertex(mm.pn, mm.i, to));
        const ok = c.members.every(mm => panelFits(d, mm.pn)) && (!tiled || coverageOkay(d));
        if (ok) {
          c.pt = to;
          moved++;
          break;
        }
        c.members.forEach((mm, k) => copyGeometry(mm.pn, backup[k]));
      }
    }
    if (!moved) return null;
    for (const pn of refined) {
      const clean = cleanPolygon(globalPolygon(pn));
      if (clean.length >= 3 && clean.length !== shapePolygon(pn).length) applyGlobalPolygon(pn, clean);
    }
    return d;
  });
}
// ───── The three "close the gaps" commands. Each computes a proposal; nothing changes until it is applied ─────
function solveTidy(d) {
  const targets = d.panels.filter(q => !q.locked && panelFits(d, q)),
    pushed = pushEdges(d, targets),
    corners = fillPolygonGaps(d, "corners", targets);
  return pushed || corners;
}
function gapCount(p) {
  const cells = freeCells(p.panels.map(globalPolygon));
  if (!cells) return 0;
  return cellComponents(cells.filter(c => polyArea(c) > 0.02)).filter(g => cellsArea(g) > 0.5).length;
}
function layoutSummary(p, panels) {
  let changed = 0,
    added = 0,
    maxShift = 0;
  for (const q of panels) {
    const o = p.panels.find(x => x.id === q.id);
    if (!o) {
      added++;
      continue;
    }
    if (frameKey(o) !== frameKey(q)) {
      changed++;
      maxShift = Math.max(maxShift, Math.hypot(q.x + q.w / 2 - o.x - o.w / 2, q.y + q.h / 2 - o.y - o.h / 2));
    }
  }
  return { changed, added, removed: p.panels.filter(o => !panels.some(q => q.id === o.id)).length, maxShift };
}
// Shows a proposal as dashed outlines over the page with "apply / another / cancel". Returns false when the
// proposal changes nothing.
function proposeLayout(panels, { title, done, note = "", again = null }) {
  const p = page(),
    sum = layoutSummary(p, panels);
  if (!sum.changed && !sum.added && !sum.removed) return false;
  const bits = [];
  if (sum.changed) bits.push(`${fa(sum.changed)} قاب تغییر می‌کند`);
  if (sum.added) bits.push(`${fa(sum.added)} قاب تازه`);
  if (sum.removed) bits.push(`${fa(sum.removed)} قاب حذف می‌شود`);
  if (note) bits.push(note);
  state.preview = { pageId: p.id, panels, title, text: bits.join(" · "), done, again };
  state.selectedPanelId = null;
  renderAll();
  return true;
}
function applyPreview() {
  const v = state.preview,
    p = page();
  if (!v || v.pageId !== p.id) return cancelPreview();
  state.preview = null;
  remember();
  p.panels = v.panels;
  p.targetCount = p.panels.length;
  p.isTiled = coverageOkay(p);
  p.boundaries = sharedEdges(p);
  state.selectedPanelId = null;
  renderAll();
  showToast(v.done, { undo: true });
}
function cancelPreview() {
  if (!state.preview) return;
  state.preview = null;
  renderAll();
}
function tidyFrames({ direct = false } = {}) {
  const p = page();
  if (!p.panels.length) return showToast("اول یک قاب بسازید.");
  if (coverageOkay(p)) return showToast("صفحه شکافی ندارد.");
  const d = draftOf(p);
  solveTidy(d);
  const left = coverageOkay(d) ? 0 : gapCount(d),
    opts = {
      title: "فیت لبه‌ها",
      note: left ? `${fa(left)} شکاف بزرگ می‌ماند` : "همهٔ شکاف‌ها بسته می‌شود",
      done: left ? "لبه‌ها تا قاب کناری کشیده شدند؛ برای فضای بزرگِ مانده «جورچین کامل» را بزنید." : "لبه‌ها فیت شدند و شکافی نماند."
    };
  if (!proposeLayout(d.panels, opts)) return showToast("لبهٔ آزادی برای کشیدن پیدا نشد؛ «جورچین کامل» را امتحان کنید.");
  if (direct) applyPreview();
}
function smartPuzzle() {
  const p = page();
  if (!p.panels.length) return showToast("اول یک تا شش قاب بسازید.");
  if (coverageOkay(p)) return showToast("صفحه شکافی ندارد.");
  const d = draftOf(p);
  let note = "شکل قاب‌ها حفظ می‌شود";
  if (d.panels.some(q => !panelFits(d, q))) resolveMagnetOverlaps(d);
  solveTidy(d);
  if (!coverageOkay(d)) fillPolygonGaps(d, "complete");
  if (!coverageOkay(d)) {
    const result = constrainedLayout(p);
    if (result.error) return showToast(result.error);
    d.panels = result.panels;
    note = "قاب‌های آزاد از نو تقسیم می‌شوند";
  }
  if (!proposeLayout(d.panels, { title: "جورچین کامل", note, done: "صفحه بدون شکاف بین قاب‌ها تقسیم شد." }))
    showToast("چیزی برای تغییر پیدا نشد.");
}
let varietySeed = 1;
function creativeReflow() {
  const p = page();
  if (p.panels.filter(q => !q.locked).length < 2) return showToast("برای تنوع مرزها دست‌کم دو قاب آزاد لازم است.");
  if (p.panels.some(q => !panelFits(p, q))) return showToast("اول هم‌پوشانی قاب‌ها را رفع کنید.");
  const make = () => {
    for (let tries = 0; tries < 8; tries++) {
      const d = varyBorders(p, state.varietyStrength, varietySeed++);
      if (d) return d;
    }
    return null;
  };
  const show = () => {
    const d = make();
    if (!d) return showToast("مرز مشترکِ آزادی برای تغییر پیدا نشد؛ قاب‌ها باید به هم چسبیده باشند.");
    proposeLayout(d.panels, { title: "تنوع مرزها", done: "مرزهای داخلی تغییر کردند؛ قفل‌ها ثابت ماندند.", again: show });
  };
  show();
}
function fixOverlaps() {
  const p = page();
  if (p.panels.every(q => panelFits(p, q))) return showToast("هیچ دو قابی روی هم نیستند.");
  const d = draftOf(p),
    all = resolveMagnetOverlaps(d);
  if (
    !proposeLayout(d.panels, {
      title: "رفع هم‌پوشانی",
      note: all ? "" : "بخشی از هم‌پوشانی می‌ماند",
      done: all ? "هم‌پوشانی قاب‌ها رفع شد." : "تا جای ممکن جدا شدند؛ یک قفل را باز کنید یا قابی را جابه‌جا کنید."
    })
  )
    showToast("با این قفل‌ها جایی برای جداکردن قاب‌ها نیست؛ یک قفل را باز کنید.");
}
// ───── Split and merge ─────
function splitPanel(dir) {
  const p = page(),
    pn = panel();
  if (!pn) return showToast("اول یک قاب را انتخاب کنید.");
  if (pn.locked) return showToast("این قاب قفل است؛ اول قفلش را باز کنید.");
  if (p.panels.length >= MAX_PANELS) return showToast("صفحه ۶ قاب دارد؛ برای قاب تازه یکی را حذف یا دو قاب را یکی کنید.");
  const poly = globalPolygon(pn),
    b = polygonBounds(poly),
    cx = b.x + b.w / 2,
    cy = b.y + b.h / 2,
    slope = 0.25,
    sp =
      dir === "h"
        ? splitPolygon(poly, "y", cy, 0)
        : dir === "v"
          ? splitPolygon(poly, "x", cx, 0)
          : b.w >= b.h
            ? splitPolygon(poly, "x", cx - slope * (cy - 50), slope)
            : splitPolygon(poly, "y", cy - slope * (cx - 50), slope),
    one = cleanPolygon(sp.neg),
    two = cleanPolygon(sp.pos);
  if (!polygonIsValid(one) || !polygonIsValid(two) || Math.abs(polyArea(one) + polyArea(two) - polyArea(poly)) > 0.05)
    return showToast("این شکل را نمی‌شود از این جهت دو نیم کرد.");
  remember();
  const fresh = newPanel(0, 0, 10, 10),
    keep = clonePanel(pn);
  applyGlobalPolygon(keep, one);
  applyGlobalPolygon(fresh, two);
  // The image stays in the half that comes first in reading order.
  const first = readingOrder({ panels: [keep, fresh] })[0];
  copyGeometry(pn, first === keep ? keep : fresh);
  copyGeometry(fresh, first === keep ? fresh : keep);
  p.panels.forEach(q => delete q.order);
  p.panels.push(fresh);
  p.targetCount = p.panels.length;
  p.isTiled = coverageOkay(p);
  p.boundaries = sharedEdges(p);
  renderAll();
  showToast("قاب دو نیم شد.", { undo: true });
}
async function mergeWithNeighbor() {
  const p = page(),
    pn = panel();
  if (!pn) return showToast("اول یک قاب را انتخاب کنید.");
  if (pn.locked) return showToast("این قاب قفل است؛ اول قفلش را باز کنید.");
  const mine = globalPolygon(pn),
    perim = poly => poly.reduce((s, v, i) => s + pointDistance(v, poly[(i + 1) % poly.length]), 0);
  let best = null;
  for (const q of p.panels) {
    if (q === pn || q.locked) continue;
    const other = globalPolygon(q),
      joined = mergeCells([mine, other]);
    if (!joined || joined.length > 12 || !polygonIsValid(joined)) continue;
    const shared = (perim(mine) + perim(other) - perim(joined)) / 2;
    if (shared > 1 && (!best || shared > best.shared)) best = { q, joined, shared };
  }
  if (!best) return showToast("قاب آزادِ هم‌مرزی پیدا نشد؛ دو قاب باید یک ضلع مشترک داشته باشند.");
  const n = fa(panelNumber(best.q.id, p));
  if (pn.image && best.q.image && !(await ask(`قاب ${n} با این قاب یکی می‌شود و تصویر قاب ${n} برداشته می‌شود. ادامه می‌دهید؟`, { ok: "یکی شود", title: "یکی‌کردن دو قاب" })))
    return;
  remember();
  applyGlobalPolygon(pn, best.joined);
  pn.fitBasePoly = null;
  if (!pn.image) pn.image = best.q.image;
  p.panels.splice(p.panels.indexOf(best.q), 1);
  p.panels.forEach(q => delete q.order);
  p.targetCount = p.panels.length;
  p.isTiled = coverageOkay(p);
  p.boundaries = sharedEdges(p);
  renderAll();
  showToast(`با قاب ${n} یکی شد.`, { undo: true });
}


function togglePanelLock(id = null) {
  const p = page();
  if (id) state.selectedPanelId = id;
  const pn = panel();
  if (!pn) return;
  remember();
  pn.locked = !pn.locked;
  renderAll();
  showToast(pn.locked ? "فقط همین قاب قفل شد؛ بقیهٔ قاب‌ها آزادند." : "قفل این قاب باز شد.");
}
function neighborsOf(p, anchor) {
  const free = p.panels.filter(q => !q.locked && q !== anchor),
    a = polygonBounds(globalPolygon(anchor)),
    m = 6,
    near = free.filter(q => {
      const b = polygonBounds(globalPolygon(q));
      return b.x < a.x + a.w + m && b.x + b.w > a.x - m && b.y < a.y + a.h + m && b.y + b.h > a.y - m;
    });
  return near.length ? near : free;
}
function fitPanelToNeighbors(id) {
  const p = page(),
    selected = p.panels.find(q => q.id === id);
  if (!selected) return;
  state.selectedPanelId = id;
  const targets = selected.locked ? neighborsOf(p, selected) : [selected],
    before = snapshot();
  if (!targets.length) return showToast("همهٔ قاب‌ها قفل‌اند؛ برای پرکردن فضا یکی را باز کنید.");
  const usable = targets.filter(q => panelFits(p, q)),
    pushed = pushEdges(p, usable),
    corners = fillPolygonGaps(p, "corners", usable);
  if (!pushed && !corners) return showToast("لبهٔ آزادی برای فیت این قاب پیدا نشد.");
  pushHistory(before);
  p.isTiled = coverageOkay(p);
  p.boundaries = sharedEdges(p);
  renderAll();
  showToast(selected.locked ? "قاب‌های آزاد کنار این قاب فیت شدند." : "لبه‌های این قاب تا قاب کناری کشیده شدند.", { undo: true });
}
