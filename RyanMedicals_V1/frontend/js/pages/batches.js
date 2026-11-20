import { state, medicineName } from "../state.js";
import { $, esc } from "../utils/dom.js";
import { dateText, todayISO } from "../utils/format.js";
import { pageHeading } from "../components/layout.js";
import { table } from "../components/table.js";
import { field, selectField, formData } from "../components/forms.js";
import { toast } from "../components/toast.js";

export const title = "Batches";

export function render() {
  const recent = state.batches
    .slice(-6)
    .reverse()
    .map(
      (b) =>
        `<tr><td class="primary-cell">${esc(medicineName(b.medicine_id))}</td><td>${esc(
          b.batch_number
        )}</td><td>${dateText(b.expiry_date)}</td><td>${b.quantity}</td></tr>`
    )
    .join("");

  return (
    pageHeading("INVENTORY SETUP", "Batches", "Add medicine batches and record their initial stock.") +
    `<div class="content-grid"><section class="panel form-panel"><div class="panel-head"><div><h2>Create a batch</h2><p>Batch number must be unique for its medicine</p></div></div><div class="panel-body">
 <form id="batchForm"><div class="form-grid">
 ${selectField("medicine_id", "Medicine", state.medicines.map((m) => [m.id, m.name]), true)}
 ${selectField("supplier_id", "Supplier (optional)", state.suppliers.map((s) => [s.id, s.name]), false, "No supplier")}
 ${field("batch_number", "Batch number", "text", "e.g. PCM2408", true)}
 ${field("manufacturing_date", "Manufacturing date", "date")}
 ${field("expiry_date", "Expiry date", "date", "", true)}
 ${field("quantity", "Initial quantity", "number", "0", false, "Set to zero if the batch has not arrived yet", 0)}
 ${field("purchase_price", "Purchase price (₹)", "number", "0", false, "Per unit", 0)}
 ${field("mrp", "MRP (₹)", "number", "0", false, "Per unit", 0)}
 </div><div class="form-actions"><button class="btn btn-primary" type="submit">Create batch</button></div></form></div></section>
 <section class="panel"><div class="panel-head"><div><h2>Recent batches</h2><p>Recently added to inventory</p></div></div>${table(
   ["Medicine", "Batch", "Expiry", "Quantity"],
   recent,
   "No batches yet."
 )}</section></div>
 <div class="notice"><strong>Initial stock is recorded automatically.</strong> When you create a batch with a quantity greater than zero, the backend records the corresponding stock-in movement in the same transaction.</div>`
  );
}

export function bind({ submit }) {
  $("batchForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = formData(e);
    const payload = {
      medicine_id: Number(f.get("medicine_id")),
      supplier_id: f.get("supplier_id") ? Number(f.get("supplier_id")) : null,
      batch_number: f.get("batch_number"),
      manufacturing_date: f.get("manufacturing_date") || null,
      expiry_date: f.get("expiry_date"),
      quantity: Number(f.get("quantity") || 0),
      purchase_price: Number(f.get("purchase_price") || 0),
      mrp: Number(f.get("mrp") || 0),
    };

    if (payload.expiry_date < todayISO()) {
      toast("Expiry date cannot be in the past.", true);
      return;
    }
    await submit("/api/batches", payload, "Batch created.");
  });
}
