import { esc } from "../utils/dom.js";

export function field(
  name,
  label,
  type = "text",
  placeholder = "",
  required = false,
  hint = "",
  value = ""
) {
  return `<div class="field"><label for="${name}">${label}${
    required ? "" : ' <span class="optional">(optional)</span>'
  }</label><input id="${name}" name="${name}" type="${type}" placeholder="${esc(
    placeholder
  )}" ${required ? "required" : ""} ${type === "number" ? 'min="0"' : ""} ${
    value !== "" ? `value="${value}"` : ""
  }>${hint ? `<span class="field-hint">${hint}</span>` : ""}</div>`;
}

export function selectField(
  name,
  label,
  options,
  required = false,
  emptyLabel = "Select an option"
) {
  return `<div class="field"><label for="${name}">${label}${
    required ? "" : ' <span class="optional">(optional)</span>'
  }</label><select id="${name}" name="${name}" ${
    required ? "required" : ""
  }><option value="">${emptyLabel}</option>${options
    .map(([v, t]) => `<option value="${v}">${esc(t)}</option>`)
    .join("")}</select></div>`;
}

export function textareaField(name, label, placeholder = "") {
  return `<div class="field full"><label for="${name}">${label} <span class="optional">(optional)</span></label><textarea id="${name}" name="${name}" placeholder="${esc(
    placeholder
  )}"></textarea></div>`;
}

// Read a submitted <form> into a FormData for convenience.
export const formData = (event) => new FormData(event.currentTarget);
