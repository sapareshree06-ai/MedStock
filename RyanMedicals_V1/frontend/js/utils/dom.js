export const $ = (id) => document.getElementById(id);

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

// Escape any value before putting it inside an HTML string.
export const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);
