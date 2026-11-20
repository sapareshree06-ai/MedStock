import { empty } from "./layout.js";

export function table(headers, rows, emptyMessage = "No records found.") {
  return `<div class="table-wrap"><table><thead><tr>${headers
    .map((h) => `<th>${h}</th>`)
    .join("")}</tr></thead><tbody>${
    rows || `<tr><td colspan="${headers.length}">${empty(emptyMessage)}</td></tr>`
  }</tbody></table></div>`;
}
