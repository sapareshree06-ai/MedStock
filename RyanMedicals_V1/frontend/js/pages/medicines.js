import { state } from "../state.js";
import { $, esc } from "../utils/dom.js";
import { pageHeading } from "../components/layout.js";
import { table } from "../components/table.js";
import { field, formData } from "../components/forms.js";

export const title = "Medicines";

function medicineForm() {
  return `<form id="medicineForm"><div class="form-grid">
 ${field("name", "Medicine name", "text", "e.g. Paracetamol 500 mg", true)}
 ${field("generic_name", "Generic name", "text", "e.g. Paracetamol")}
 ${field("category", "Category", "text", "e.g. Analgesic")}
 ${field("manufacturer", "Manufacturer", "text", "Manufacturer name")}
 ${field("reorder_level", "Reorder level", "number", "10", false, "Minimum usable stock before alert", 10)}
 </div><div class="form-actions"><button class="btn btn-primary" type="submit">Save medicine</button></div></form>`;
}

export function render() {
  const rows = state.medicines
    .map(
      (m) =>
        `<tr><td class="primary-cell">${esc(m.name)}</td><td>${esc(
          m.generic_name || "—"
        )}</td><td>${esc(m.category || "—")}</td><td>${esc(
          m.manufacturer || "—"
        )}</td><td>${m.reorder_level}</td></tr>`
    )
    .join("");

  return (
    pageHeading(
      "CATALOGUE",
      "Medicines",
      "Maintain the medicine catalogue and its reorder thresholds.",
      `<button class="btn btn-primary" data-go="medicines">＋ Add medicine</button>`
    ) +
    `<div class="content-grid"><section class="panel"><div class="panel-head"><div><h2>Registered medicines</h2><p>${state.medicines.length} medicine records</p></div></div>
 ${table(
   ["Medicine", "Generic name", "Category", "Manufacturer", "Reorder level"],
   rows,
   "No medicines added yet."
 )}</section>
 <section class="panel form-panel"><div class="panel-head"><div><h2>Add a medicine</h2><p>Create a medicine record for batch tracking</p></div></div><div class="panel-body">${medicineForm()}</div></section></div>`
  );
}

export function bind({ submit }) {
  $("medicineForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = formData(e);
    await submit(
      "/api/medicines",
      {
        name: f.get("name"),
        generic_name: f.get("generic_name") || null,
        category: f.get("category") || null,
        manufacturer: f.get("manufacturer") || null,
        reorder_level: Number(f.get("reorder_level") || 10),
      },
      "Medicine saved."
    );
  });
}
