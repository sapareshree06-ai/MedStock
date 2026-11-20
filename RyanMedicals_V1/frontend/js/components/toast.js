import { TOAST_DURATION_MS } from "../config.js";
import { $ } from "../utils/dom.js";

let timer;

export function toast(message, error = false) {
  const el = $("toast");
  el.textContent = message;
  el.className = "toast show" + (error ? " error" : "");
  clearTimeout(timer);
  timer = setTimeout(() => (el.className = "toast"), TOAST_DURATION_MS);
}
