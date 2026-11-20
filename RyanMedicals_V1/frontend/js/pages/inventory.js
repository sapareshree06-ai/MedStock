import { state, supplierName, findMedicine } from "../state.js";
import { $, esc } from "../utils/dom.js";
import { money, dateText } from "../utils/format.js";
import { pageHeading } from "../components/layout.js";
import { table } from "../components/table.js";
import { expiryStatus } from "../components/status.js";

export const title = "Inventory";

const HEADERS = [
  "Medicine",
  "Batch number",
  "Supplier",
  "Expiry date",
  "Quantity",
  "Purchase price",
  "MRP",
  "Status",
];

function inventoryRows(list) {
  return list
    .map((b) => {
      const med = findMedicine(b.medicine_id);
      return `<tr>
 <td><span class="primary-cell">${esc(
   med?.name || "Medicine #" + b.medicine_id
 )}</span><span class="secondary-cell">${esc(
        med?.generic_name || med?.manufacturer || ""
      )}</span></td>
 <td>${esc(b.batch_number)}</td><td>${esc(supplierName(b.supplier_id))}</td><td>${dateText(
        b.expiry_date
      )}</td>
 <td class="number-cell">${b.quantity}</td><td>${money(b.purchase_price)}</td><td>${money(
        b.mrp
      )}</td><td>${expiryStatus(b.expiry_date)}</td></tr>`;
    })
    .join("");
}

export function render() {
  return (
    pageHeading(
      "INVENTORY",
      "Batch inventory",
      "Search and review stock by medicine, batch, expiry and quantity.",
      `<button class="btn btn-primary" data-go="batches">＋ Add batch</button>`
    ) +
    `<section class="panel"><div class="toolbar"><span class="toolbar-meta">${
      state.batches.length
    } batches tracked</span><div class="search-box"><span>⌕</span><input id="inventorySearch" placeholder="Search medicine, batch or manufacturer…"></div></div>
 <div id="inventoryTable">${table(HEADERS, inventoryRows(state.batches))}</div><div class="table-foot">Stock value is calculated using purchase price. Expiry status is based on today's date.</div></section>`
  );
}

export function bind() {
  const input = $("inventorySearch");
  if (!input) return;

  input.addEventListener("input", () => {
    const q = input.value.toLowerCase();
    const filtered = state.batches.filter((b) => {
      const m = findMedicine(b.medicine_id);
      return [m?.name, m?.generic_name, m?.manufacturer, b.batch_number, supplierName(b.supplier_id)]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
    $("inventoryTable").innerHTML = table(HEADERS, inventoryRows(filtered), "No matching batches.");
  });
}
