import { state } from "../state.js";
import { $, esc } from "../utils/dom.js";
import { pageHeading } from "../components/layout.js";
import { table } from "../components/table.js";
import { field, formData } from "../components/forms.js";

export const title = "Suppliers";

export function render() {
  const rows = state.suppliers
    .map(
      (s) =>
        `<tr><td class="primary-cell">${esc(s.name)}</td><td>${esc(s.phone || "—")}</td><td>${esc(
          s.email || "—"
        )}</td></tr>`
    )
    .join("");

  return (
    pageHeading(
      "PARTNERS",
      "Suppliers",
      "Keep supplier contact details alongside your batch records."
    ) +
    `<div class="content-grid"><section class="panel"><div class="panel-head"><div><h2>Supplier directory</h2><p>${
      state.suppliers.length
    } suppliers</p></div></div>
 ${table(["Supplier", "Phone", "Email"], rows, "No suppliers added yet.")}</section>
 <section class="panel form-panel"><div class="panel-head"><div><h2>Add supplier</h2><p>Save a supplier for future batch entries</p></div></div><div class="panel-body">
 <form id="supplierForm"><div class="form-grid">${field("name", "Supplier name", "text", "Business or distributor name", true)}${field("phone", "Phone number", "tel", "Contact number")}${field("email", "Email address", "email", "name@example.com")}</div><div class="form-actions"><button class="btn btn-primary" type="submit">Save supplier</button></div></form>
 </div></section></div>`
  );
}

export function bind({ submit }) {
  $("supplierForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = formData(e);
    await submit(
      "/api/suppliers",
      {
        name: f.get("name"),
        phone: f.get("phone") || null,
        email: f.get("email") || null,
      },
      "Supplier saved."
    );
  });
}
