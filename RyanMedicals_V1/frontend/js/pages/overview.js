import { state, medicineName, findBatch } from "../state.js";
import { esc } from "../utils/dom.js";
import { money, dateText, dateTimeText } from "../utils/format.js";
import { pageHeading, metric, empty } from "../components/layout.js";
import { table } from "../components/table.js";
import { expiryStatus, movementBadge } from "../components/status.js";

export const title = "Overview";


function reorderWidget() {
  const rs = state.reorderSummary;

  if (!rs || rs.needs_action === 0) return "";

  return `
    <section class="panel reorder-widget">
      <div class="panel-head">
        <div>
          <h2>Reorder recommendations</h2>
          <p>
            ${rs.needs_action} medicine${rs.needs_action !== 1 ? "s" : ""}
            require attention · Estimated cost ${money(rs.total_estimated_cost)}
          </p>
        </div>

        <button class="text-link" data-go="reorder">
          View recommendations →
        </button>
      </div>

      <div class="panel-body" style="padding: 16px 20px;">
        <div class="metric-grid" style="margin: 0;">
          ${metric("Critical", rs.critical, "!", "Stockout imminent")}
          ${metric("Reorder now", rs.reorder_now, "↗", "Within safety buffer")}
          ${metric("Adequate", rs.adequate, "✓", "Sufficient runway")}
          ${metric("Total medicines", rs.total_medicines, "✚", "Analysed")}
        </div>
      </div>
    </section>
  `;
}


export function batchRows(batches) {
  return batches
    .map(
      (b) => `<tr>
    <td><span class="primary-cell">${esc(medicineName(b.medicine_id))}</span><span class="secondary-cell">Medicine ID: ${b.medicine_id}</span></td>
    <td class="primary-cell">${esc(b.batch_number)}</td><td>${dateText(b.expiry_date)}</td>
    <td class="number-cell">${b.quantity.toLocaleString("en-IN")}</td><td>${money(b.mrp)}</td>
    <td>${expiryStatus(b.expiry_date)}</td></tr>`
    )
    .join("");
}

function alertRowsData() {
  return [
    ...state.low.map((x) => ({
      kind: "warn",
      title: x.medicine,
      detail: `${x.quantity} usable units · Reorder level ${x.reorder_level}`,
      count: "LOW",
    })),
    ...state.expiry.slice(0, 5).map((x) => ({
      kind: "danger",
      title: `${x.medicine} · ${x.batch_number}`,
      detail: `${x.quantity} units · Expires ${dateText(x.expiry_date)}`,
      count: "EXP",
    })),
  ].slice(0, 7);
}

function alertList(alerts) {
  if (!alerts.length) return empty("All clear", "No low-stock or near-expiry alerts.");
  return alerts
    .map(
      (a) =>
        `<div class="alert-row"><span class="alert-symbol ${a.kind}">${
          a.kind === "warn" ? "!" : "⌛"
        }</span><div class="alert-copy"><strong>${esc(a.title)}</strong><small>${esc(
          a.detail
        )}</small></div><span class="alert-count">${a.count}</span></div>`
    )
    .join("");
}

function recentMovementRows() {
  return state.movements
    .slice(0, 6)
    .map((m) => {
      const b = findBatch(m.batch_id);
      return `<tr><td>${movementBadge(m.movement_type)}</td><td><span class="primary-cell">${esc(
        b ? medicineName(b.medicine_id) : "Batch #" + m.batch_id
      )}</span><span class="secondary-cell">${esc(
        b?.batch_number || ""
      )}</span></td><td class="number-cell">${m.quantity}</td><td>${dateTimeText(m.timestamp, {
        withYear: false,
      })}</td><td>${esc(m.notes || "—")}</td></tr>`;
    })
    .join("");
}

export function render() {
  const s = state.summary;
  const alerts = alertRowsData();

  return (
    pageHeading(
      "YOUR WORKSPACE",
      "Inventory overview",
      "A clear picture of your pharmacy stock, at a glance.",
      `<button class="btn btn-secondary" data-go="stock-in">＋ Receive stock</button><button class="btn btn-primary" data-go="stock-out">Issue stock ↗</button>`
    ) +
    `<div class="metric-grid">
    ${metric("Total medicines", s.medicine_count, "✚", "Registered medicine types")}
    ${metric("Active batches", s.batch_count, "▦", "Tracked inventory batches")}
    ${metric("Units in inventory", s.total_units.toLocaleString("en-IN"), "▤", "Across all batches")}
    ${metric("Inventory purchase value", money(s.inventory_value), "₹", "Based on purchase price")}
  </div>
  ${reorderWidget()}
  <div class="content-grid">
    <section class="panel"><div class="panel-head"><div><h2>Inventory at a glance</h2><p>Latest batches ordered by expiry date</p></div><button class="text-link" data-go="inventory">View inventory →</button></div>
      ${table(
        ["Medicine", "Batch number", "Expiry date", "Units", "MRP", "Status"],
        batchRows(state.batches.slice(0, 7)),
        "No batches have been added yet."
      )}</section>
    <section class="panel"><div class="panel-head"><div><h2>Needs attention</h2><p>Stock and expiry alerts</p></div><span class="status ${
      alerts.length ? "status-warn" : "status-good"
    }">${alerts.length} alerts</span></div>
      <div class="panel-body"><div class="alert-list">${alertList(alerts)}</div></div></section>
  </div>
  <section class="panel"><div class="panel-head"><div><h2>Recent stock movements</h2><p>Latest stock receipts and issues</p></div><button class="text-link" data-go="movements">View history →</button></div>
  ${table(
    ["Movement", "Medicine / batch", "Quantity", "Date", "Notes"],
    recentMovementRows(),
    "No stock movements recorded yet."
  )}</section>`
  );
}
