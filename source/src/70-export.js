// خروجی PNG با ۳۰۰dpi، ZIP و PDF
// Safari before 18 ignores ctx.filter, which silently dropped colour looks from exports.
// Feature-detect it; the pixel path below follows the CSS filter formulas (sRGB, clamped after each step).
function canvasFilterWorks(ctx) {
  if (document.documentElement.dataset.testPixelLook === "1") return false;
  if (!("filter" in ctx)) return false;
  const old = ctx.filter;
  ctx.filter = "brightness(50%)";
  const ok = ctx.filter === "brightness(50%)";
  ctx.filter = old;
  return ok;
}
function lookMatrix(look) {
  const x = normalizeLook(look),
    mul = (a, b) => a.map((row, i) => [0, 1, 2].map(j => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j])),
    s = x.saturation / 100,
    th = (x.hue * Math.PI) / 180,
    c = Math.cos(th),
    n = Math.sin(th),
    g = 1 - x.mono / 100;
  const sat = [
      [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s],
      [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s],
      [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s]
    ],
    hue = [
      [0.213 + c * 0.787 - n * 0.213, 0.715 - c * 0.715 - n * 0.715, 0.072 - c * 0.072 + n * 0.928],
      [0.213 - c * 0.213 + n * 0.143, 0.715 + c * 0.285 + n * 0.14, 0.072 - c * 0.072 - n * 0.283],
      [0.213 - c * 0.213 - n * 0.787, 0.715 - c * 0.715 + n * 0.715, 0.072 + c * 0.928 + n * 0.072]
    ],
    gray = [
      [0.2126 + 0.7874 * g, 0.7152 - 0.7152 * g, 0.0722 - 0.0722 * g],
      [0.2126 - 0.2126 * g, 0.7152 + 0.2848 * g, 0.0722 - 0.0722 * g],
      [0.2126 - 0.2126 * g, 0.7152 - 0.7152 * g, 0.0722 + 0.9278 * g]
    ];
  return { b: x.brightness / 100, k: x.contrast / 100, sat, hue, gray, mul };
}
function lookedImage(im, look) {
  const w = im.naturalWidth || im.width,
    h = im.naturalHeight || im.height,
    c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(im, 0, 0);
  const m = lookMatrix(look),
    identity = m.b === 1 && m.k === 1 && m.sat[0][0] === 1 && m.hue[0][0] === 1 && m.gray[0][0] === 1;
  if (identity) return c;
  const data = ctx.getImageData(0, 0, w, h),
    d = data.data,
    kb = 0.5 - 0.5 * m.k,
    cl = v => (v < 0 ? 0 : v > 1 ? 1 : v),
    apply = (M, r, g, b) => [cl(M[0][0] * r + M[0][1] * g + M[0][2] * b), cl(M[1][0] * r + M[1][1] * g + M[1][2] * b), cl(M[2][0] * r + M[2][1] * g + M[2][2] * b)];
  for (let i = 0; i < d.length; i += 4) {
    let r = cl((d[i] / 255) * m.b),
      g = cl((d[i + 1] / 255) * m.b),
      b = cl((d[i + 2] / 255) * m.b);
    r = cl(r * m.k + kb);
    g = cl(g * m.k + kb);
    b = cl(b * m.k + kb);
    [r, g, b] = apply(m.sat, r, g, b);
    [r, g, b] = apply(m.hue, r, g, b);
    [r, g, b] = apply(m.gray, r, g, b);
    d[i] = Math.round(r * 255);
    d[i + 1] = Math.round(g * 255);
    d[i + 2] = Math.round(b * 255);
  }
  ctx.putImageData(data, 0, 0);
  return c;
}
async function drawPage(p, outW = null) {
  const pr = PAGE_PRESETS[p.preset] || PAGE_PRESETS.a4,
    w = outW || pr.width,
    h = Math.round((w * pr.height) / pr.width),
    c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.fillStyle = p.paper;
  ctx.fillRect(0, 0, w, h);
  for (const pn of drawOrder(p)) {
    const x = (pn.x / 100) * w,
      y = (pn.y / 100) * h,
      pw = (pn.w / 100) * w,
      ph = (pn.h / 100) * h,
      poly = shapePolygon(pn);
    ctx.save();
    ctx.beginPath();
    poly.forEach(([px, py], i) =>
      i ? ctx.lineTo(x + px * pw, y + py * ph) : ctx.moveTo(x + px * pw, y + py * ph)
    );
    ctx.closePath();
    ctx.clip();
    // Under a photo the frame shows the paper colour (transparent PNG/WebP), exactly like the preview.
    ctx.fillStyle = pn.image || state.exportEmpty !== "dark" ? p.paper : "#121820";
    ctx.fillRect(x, y, pw, ph);
    if (pn.image) {
      const im = await loadImage(pn.image.dataUrl),
        pl = mediaPlacement(pn.image, pw, ph),
        look = effectiveLook(p, pn),
        source = canvasFilterWorks(ctx) ? im : lookedImage(im, look);
      ctx.save();
      if (source === im) ctx.filter = lookFilter(look);
      ctx.translate(x + pl.x + pl.drawW / 2, y + pl.y + pl.drawH / 2);
      ctx.rotate((pl.rotation * Math.PI) / 180);
      ctx.scale(pn.image.flipX ? -1 : 1, pn.image.flipY ? -1 : 1);
      ctx.drawImage(source, -pl.drawW / 2, -pl.drawH / 2, pl.drawW, pl.drawH);
      ctx.restore();
      if (source !== im) source.width = source.height = 0;
    }
    ctx.restore();
  }
  paintGutters(ctx, gutterPrims(p, w, h, w / pageBase(pr)));
  return c;
}
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
// Writes a pHYs chunk so print software reads the real resolution instead of assuming 72 dpi.
function pngWithDpi(bytes, dpi) {
  const ok =
    bytes.length > 33 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (!ok) return bytes;
  const ppm = Math.round(dpi / 0.0254),
    chunk = new Uint8Array(21),
    dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4);
  dv.setUint32(8, ppm);
  dv.setUint32(12, ppm);
  chunk[16] = 1;
  dv.setUint32(17, crc32(chunk.subarray(4, 17)));
  const out = new Uint8Array(bytes.length + 21);
  out.set(bytes.subarray(0, 33));
  out.set(chunk, 33);
  out.set(bytes.subarray(33), 54);
  return out;
}
async function canvasBlob(c, p, web = false) {
  const raw = await new Promise(r => c.toBlob(r, "image/png", 1));
  if (!raw) return null;
  const dpi = web || p?.preset === "webtoon" ? 96 : 300;
  return new Blob([pngWithDpi(new Uint8Array(await raw.arrayBuffer()), dpi)], { type: "image/png" });
}
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function pagesForExport() {
  return $("#exportScope").value === "book" ? state.pages : [page()];
}
function zipPngs(files) {
  const parts = [],
    central = [],
    enc = new TextEncoder();
  let offset = 0;
  const u16 = n => [n & 255, (n >>> 8) & 255],
    u32 = n => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
  for (const f of files) {
    const name = enc.encode(f.name),
      bytes = f.bytes;
    const crc = crc32(bytes);
    const local = new Uint8Array([
      ...u32(0x04034b50),
      ...u16(20),
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      ...u32(crc),
      ...u32(bytes.length),
      ...u32(bytes.length),
      ...u16(name.length),
      0,
      0
    ]);
    parts.push(local, name, bytes);
    central.push(
      new Uint8Array([
        ...u32(0x02014b50),
        ...u16(20),
        ...u16(20),
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        ...u32(crc),
        ...u32(bytes.length),
        ...u32(bytes.length),
        ...u16(name.length),
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        ...u32(offset)
      ]),
      name
    );
    offset += local.length + name.length + bytes.length;
  }
  const centralSize = central.reduce((n, x) => n + x.length, 0),
    end = new Uint8Array([
      ...u32(0x06054b50),
      0,
      0,
      0,
      0,
      ...u16(files.length),
      ...u16(files.length),
      ...u32(centralSize),
      ...u32(offset),
      0,
      0
    ]);
  return new Blob([...parts, ...central, end], { type: "application/zip" });
}
function pdfFromImages(items) {
  const enc = new TextEncoder(),
    chunks = [],
    offsets = [0];
  let length = 0;
  const put = v => {
      const bytes = typeof v === "string" ? enc.encode(v) : v;
      chunks.push(bytes);
      length += bytes.length;
    },
    obj = (id, body, stream = null) => {
      offsets[id] = length;
      put(`${id} 0 obj\n${body}`);
      if (stream) {
        put("\nstream\n");
        put(stream);
        put("\nendstream");
      }
      put("\nendobj\n");
    };
  put("%PDF-1.4\n");
  const kids = items.map((_, i) => `${3 + i * 3} 0 R`).join(" ");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${items.length} >>`);
  items.forEach(({ width, height, jpeg, page: p, full }, i) => {
    const id = 3 + i * 3,
      // a reduced (web-size) image still fills the real page size
      scale = (p.preset === "webtoon" ? 72 / 96 : 72 / 300) * (full ? full / width : 1),
      w = +(width * scale).toFixed(3),
      h = +(height * scale).toFixed(3),
      draw = enc.encode(`q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q\n`);
    obj(
      id,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`
    );
    obj(id + 1, `<< /Length ${draw.length} >>`, draw);
    obj(
      id + 2,
      `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`,
      jpeg
    );
  });
  const at = length;
  put(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  for (let i = 1; i < offsets.length; i++) put(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  put(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${at}\n%%EOF`);
  return new Blob(chunks, { type: "application/pdf" });
}
function exportStatus(text, kind = "") {
  const el = $("#exportStatus");
  if (!el) return text && showToast(text);
  el.textContent = text;
  el.dataset.kind = kind;
  el.hidden = !text;
}
// What the printed result would get wrong: frames without a picture and pictures too small for their frame.
function preflight(pages) {
  const out = [];
  for (const p of pages) {
    const n = state.pages.indexOf(p) + 1;
    if (!p.panels.length) {
      out.push({ pageId: p.id, text: `صفحهٔ ${fa(n)} قابی ندارد.` });
      continue;
    }
    for (const pn of readingOrder(p)) {
      const k = fa(panelNumber(pn.id, p));
      if (!pn.image) out.push({ pageId: p.id, panelId: pn.id, text: `صفحهٔ ${fa(n)}، قاب ${k}: بدون تصویر` });
      else if (p.preset !== "webtoon") {
        const dpi = effectiveDpi(p, pn);
        if (dpi < 200) out.push({ pageId: p.id, panelId: pn.id, text: `صفحهٔ ${fa(n)}، قاب ${k}: کیفیت چاپ کم (حدود ${fa(Math.round(dpi))}dpi)` });
      }
    }
  }
  return out;
}
function renderPreflight() {
  const root = $("#preflight");
  if (!root) return;
  const list = preflight(pagesForExport());
  root.hidden = !list.length;
  root.replaceChildren();
  if (!list.length) return;
  const head = document.createElement("b");
  head.textContent = `پیش از خروجی: ${fa(list.length)} مورد`;
  root.append(head);
  for (const w of list.slice(0, 8)) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = w.text;
    b.addEventListener("click", () => {
      els.exportDialog.close();
      state.activePageId = w.pageId;
      state.selectedPanelId = w.panelId || null;
      setEditorTab(w.panelId ? "image" : "layout");
      renderAll();
    });
    root.append(b);
  }
  if (list.length > 8) {
    const more = document.createElement("small");
    more.textContent = `و ${fa(list.length - 8)} مورد دیگر`;
    root.append(more);
  }
}
async function exportArtwork(type) {
  const pages = pagesForExport();
  if (!pages.some(p => p.panels.length)) return exportStatus("صفحه هنوز قاب ندارد؛ اول قاب بسازید.", "error");
  const buttons = [$("#downloadPngBtn"), $("#printBookBtn")],
    web = $("#exportSize")?.value === "web",
    base = fileBase() || "comic",
    no = p => String(state.pages.indexOf(p) + 1).padStart(2, "0"),
    render = p => drawPage(p, web ? Math.min(1080, (PAGE_PRESETS[p.preset] || PAGE_PRESETS.a4).width) : null);
  buttons.forEach(x => (x.disabled = true));
  exportStatus(pages.length > 1 ? `در حال ساخت ${fa(pages.length)} صفحه…` : "در حال ساخت فایل…", "busy");
  try {
    if (type === "pdf") {
      const items = [];
      for (const p of pages) {
        const canvas = await render(p),
          blob = await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.94));
        if (!blob) throw Error("canvas");
        items.push({ page: p, width: canvas.width, height: canvas.height, jpeg: new Uint8Array(await blob.arrayBuffer()), full: (PAGE_PRESETS[p.preset] || PAGE_PRESETS.a4).width });
        canvas.width = 0;
        canvas.height = 0;
      }
      downloadBlob(pdfFromImages(items), pages.length === 1 ? `${base}-page-${no(pages[0])}.pdf` : `${base}-book.pdf`);
    } else if (pages.length === 1) {
      const canvas = await render(pages[0]),
        blob = await canvasBlob(canvas, pages[0], web);
      canvas.width = 0;
      canvas.height = 0;
      if (!blob) throw Error("canvas");
      downloadBlob(blob, `${base}-page-${no(pages[0])}.png`);
    } else {
      const files = [];
      for (const p of pages) {
        const canvas = await render(p),
          blob = await canvasBlob(canvas, p, web);
        canvas.width = 0;
        canvas.height = 0;
        if (!blob) throw Error("canvas");
        files.push({ name: `${base}-page-${no(p)}.png`, bytes: new Uint8Array(await blob.arrayBuffer()) });
      }
      downloadBlob(zipPngs(files), `${base}-pages.zip`);
    }
    exportStatus("");
    els.exportDialog.close();
    showToast("خروجی آماده شد و دانلود شروع شد.");
  } catch (e) {
    console.error(e);
    exportStatus("ساخت فایل ممکن نشد؛ حافظهٔ مرورگر کم است یا یکی از تصویرها خراب است.", "error");
  } finally {
    buttons.forEach(x => (x.disabled = false));
  }
}
function downloadPng() {
  return exportArtwork("png");
}
function printBook() {
  return exportArtwork("pdf");
}
function jalaliStamp(d = new Date()) {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      })
        .formatToParts(d)
        .map(x => [x.type, x.value])
    );
    return `${parts.year}-${parts.month}-${parts.day}`;
  } catch {
    return d.toISOString().slice(0, 10);
  }
}
