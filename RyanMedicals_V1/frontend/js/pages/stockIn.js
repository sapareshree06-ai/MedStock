import { state, medicineName } from "../state.js";
import { $ } from "../utils/dom.js";
import { pageHeading } from "../components/layout.js";
import { field, selectField, textareaField, formData } from "../components/forms.js";

export const title = "Receive stock";

export function render() {
  const batchOptions = state.batches.map((b) => [
    b.id,
    `${medicineName(b.medicine_id)} · ${b.batch_number} · ${b.quantity} units`,
  ]);

  return (
    pageHeading("STOCK OPERATIONS", "Receive stock", "Add incoming units to an existing batch.") +
    `<section class="panel form-panel"><div class="panel-head"><div><h2>Stock receipt</h2><p>Choose the batch that has physically arrived</p></div></div><div class="panel-body">
 <form id="stockInForm"><div class="form-grid">${selectField("batch_id", "Medicine batch", batchOptions, true)}
 ${field("quantity", "Quantity received", "number", "Enter units received", true)}
 ${textareaField("notes", "Notes", "Invoice reference or receipt details")}</div>
 <div class="form-actions"><button class="btn btn-primary" type="submit">Record stock receipt</button></div></form></div></section>`
  );
}

export function bind({ submit }) {
  $("stockInForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = formData(e);
    await submit(
      "/api/stock/in",
      {
        batch_id: Number(f.get("batch_id")),
        quantity: Number(f.get("quantity")),
        notes: f.get("notes") || null,
      },
      "Stock receipt recorded."
    );
  });
}
