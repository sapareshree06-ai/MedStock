import { THEME_KEY } from "./config.js";

const root = document.documentElement;

function readSaved() {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

function applyTheme(theme, button, save = true) {
  const selected = theme === "dark" ? "dark" : "light";
  root.dataset.theme = selected;

  if (save) {
    try {
      localStorage.setItem(THEME_KEY, selected);
    } catch {
      /* storage unavailable: ignore */
    }
  }

  const icon = button?.querySelector(".theme-toggle-icon");
  const label = button?.querySelector(".theme-toggle-label");

  // The button shows the mode you will switch TO.
  if (icon) icon.textContent = selected === "dark" ? "☀" : "☾";
  if (label) label.textContent = selected === "dark" ? "Light mode" : "Dark mode";

  button?.setAttribute(
    "aria-label",
    selected === "dark" ? "Switch to light mode" : "Switch to dark mode"
  );
  button?.setAttribute("aria-pressed", String(selected === "dark"));

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = selected === "dark" ? "#111915" : "#173b32";
}

export function initTheme() {
  const button = document.getElementById("themeToggle");
  const saved =
    readSaved() ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

  applyTheme(saved, button, false);

  button?.addEventListener("click", () => {
    applyTheme(root.dataset.theme === "dark" ? "light" : "dark", button);
  });
}
