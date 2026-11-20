import { state } from "../state.js";
import { $, esc } from "../utils/dom.js";
import { todayISO } from "../utils/format.js";
import { request } from "../api/client.js";
import { pageHeading } from "../components/layout.js";
import { table } from "../components/table.js";
import { field, selectField, textareaField, formData } from "../components/forms.js";
import { toast } from "../components/toast.js";

export const title = "Issue stock";

function usableStockRows() {
  const today = todayISO();
  return state.medicines
    .map((m) => {
      const q = state.batches
        .filter((b) => b.medicine_id === m.id && b.expiry_date >= today)
        .reduce((n, b) => n + b.quantity, 0);
      return `<tr><td class="primary-cell">${esc(m.name)}</td><td>${q}</td></tr>`;
    })
    .join("");
}

export function render() {
  return (
    pageHeading(
      "STOCK OPERATIONS",
      "Issue stock",
      "Record an issue by medicine. The backend automatically allocates eligible batches using FEFO."
    ) +
    `<div class="content-grid"><section class="panel form-panel"><div class="panel-head"><div><h2>Stock issue</h2><p>Earliest expiry, first out</p></div><span class="status status-good">FEFO enabled</span></div><div class="panel-body">
 <div class="notice"><strong>Automatic batch allocation.</strong> The system uses unexpired batches with available stock, starting with the earliest expiry date. If usable stock is insufficient, no stock is changed.</div>
 <form id="stockOutForm"><div class="form-grid">${selectField("medicine_id", "Medicine", state.medicines.map((m) => [m.id, m.name]), true)}
 ${field("quantity", "Quantity to issue", "number", "Enter units", true)}
 ${textareaField("notes", "Notes", "Prescription, sale or issue reference")}</div>
 <div class="form-actions"><button class="btn btn-primary" type="submit">Issue stock using FEFO</button></div></form><div id="stockResult"></div></div></section>
 <section class="panel"><div class="panel-head"><div><h2>Usable stock</h2><p>Unexpired stock available by medicine</p></div></div>
 ${table(["Medicine", "Usable units"], usableStockRows(), "No medicines available.")}</section></div>`
  );
}

export function bind({ refresh }) {
  $("stockOutForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = formData(e);
    const result = $("stockResult");

    try {
      const data = await request("/api/stock/out", {
        method: "POST",
        body: JSON.stringify({
          medicine_id: Number(f.get("medicine_id")),
          quantity: Number(f.get("quantity")),
          notes: f.get("notes") || null,
        }),
      });
      result.innerHTML = `<div class="stock-result">${esc(JSON.stringify(data, null, 2))}</div>`;
      toast("Stock issued successfully.");
      await refresh();
    } catch (err) {
      result.innerHTML = `<div class="stock-result">${esc(err.message)}</div>`;
      toast(err.message, true);
    }
  });
}
