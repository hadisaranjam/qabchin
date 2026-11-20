// جای‌گذاری تصویر داخل قاب (فیت، زوم، چرخش)
function solveFocus(frame, drawn, focus) {
  const travel = frame - drawn;
  if (Math.abs(travel) < 0.01) return 50;
  return clamp(((frame / 2 - (drawn * focus) / 100) / travel) * 100, 0, 100);
}
function mediaPlacement(image, w, h) {
  let drawW, drawH;
  if (image.fit === "stretch") {
    drawW = w;
    drawH = h;
  } else {
    const cover = image.fit !== "contain",
      scale = cover
        ? Math.max(w / image.width, h / image.height)
        : Math.min(w / image.width, h / image.height);
    drawW = image.width * scale;
    drawH = image.height * scale;
  }
  const zoom =
    image.fit === "smart" || image.fit === "cover" ? Math.max(100, image.zoom || 100) : image.zoom || 100;
  drawW *= zoom / 100;
  drawH *= zoom / 100;
  const rotation = clamp(Number(image.rotation) || 0, -180, 180),
    r = (rotation * Math.PI) / 180,
    c = Math.abs(Math.cos(r)),
    s = Math.abs(Math.sin(r)),
    cover = image.fit !== "contain";
  if (cover) {
    const factor = Math.max(1, (w * c + h * s) / drawW, (w * s + h * c) / drawH);
    drawW *= factor;
    drawH *= factor;
  }
  const slackX = Math.max(0, (drawW - w * c - h * s) / 2),
    slackY = Math.max(0, (drawH - w * s - h * c) / 2),
    auto = image.fit === "smart" && image.panMode !== "manual";
  let panX = image.panX ?? 50,
    panY = image.panY ?? 50;
  if (auto) {
    if (!rotation && !image.flipX && !image.flipY) {
      panX = solveFocus(w, drawW, image.focusX);
      panY = solveFocus(h, drawH, image.focusY);
    } else {
      const fx = ((image.focusX ?? 50) / 100 - 0.5) * drawW * (image.flipX ? -1 : 1),
        fy = ((image.focusY ?? 50) / 100 - 0.5) * drawH * (image.flipY ? -1 : 1);
      panX = slackX > 0.01 ? clamp(50 + (fx / slackX) * 50, 0, 100) : 50;
      panY = slackY > 0.01 ? clamp(50 + (fy / slackY) * 50, 0, 100) : 50;
    }
  }
  const spanX = cover ? -2 * slackX : w - drawW,
    spanY = cover ? -2 * slackY : h - drawH;
  const localX = slackX * (1 - (2 * panX) / 100),
    localY = slackY * (1 - (2 * panY) / 100),
    x = cover ? w / 2 + Math.cos(r) * localX - Math.sin(r) * localY - drawW / 2 : (spanX * panX) / 100,
    y = cover ? h / 2 + Math.sin(r) * localX + Math.cos(r) * localY - drawH / 2 : (spanY * panY) / 100;
  return { drawW, drawH, panX, panY, x, y, rotation, cover, spanX, spanY };
}
function imageTransform(image, placement) {
  return `rotate(${placement.rotation}deg) scale(${image.flipX ? -1 : 1},${image.flipY ? -1 : 1})`;
}
