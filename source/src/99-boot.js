// راه‌اندازی
bind();
renderAll();
registerWebMcp();
let workspaceExists = false;
try { workspaceExists = !!localStorage.getItem("qabchin-workspace-current"); } catch {}
window.QabchinEditor.ready = workspaceExists ? Promise.resolve() : restoreOffer();
// Theme: follows the system until the user picks one; the choice is remembered.
(() => {
  const root = document.documentElement,
    btn = $("#themeBtn"),
    meta = document.querySelector("meta[name=theme-color]"),
    media = matchMedia("(prefers-color-scheme: dark)"),
    isDark = () => (root.dataset.theme ? root.dataset.theme === "dark" : media.matches),
    paint = () => {
      const dark = isDark();
      root.dataset.mode = dark ? "dark" : "light";
      if (meta) meta.content = dark ? "#131a2c" : "#f6f7f9";
      btn?.setAttribute("aria-pressed", String(dark));
      btn?.setAttribute("title", dark ? "رفتن به حالت روشن" : "رفتن به حالت تیره");
    };
  paint();
  media.addEventListener?.("change", paint);
  btn?.addEventListener("click", () => {
    root.dataset.theme = isDark() ? "light" : "dark";
    try {
      localStorage.setItem("comic-theme", root.dataset.theme);
    } catch {}
    paint();
  });
})();
