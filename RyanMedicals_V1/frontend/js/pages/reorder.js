import { state } from "../state.js";
import { esc } from "../utils/dom.js";
import { money, dateText } from "../utils/format.js";
import { pageHeading, metric, empty } from "../components/layout.js";
import { table } from "../components/table.js";

export const title = "Reorder advice";

// ── Urgency badge ───────────────────────────────────────────────────
function urgencyBadge(urgency) {
  const map = {
    CRITICAL: { cls: "status-danger", label: "Critical" },
    REORDER_NOW: { cls: "status-warn", label: "Reorder now" },
    ADEQUATE: { cls: "status-good", label: "Adequate" },
    OVERSTOCKED: { cls: "status-info", label: "Overstocked" },
    NO_SALES: { cls: "status-neutral", label: "No sales data" },
  };
  const { cls, label } = map[urgency] || { cls: "status-neutral", label: urgency };
  return `<span class="status ${cls}">${label}</span>`;
}

// ── Days remaining (human readable) ──────────────────────────────
function daysLabel(days) {
  if (days === null || days === undefined) return "—";
  if (days < 1) return "<1 day";
  return `${Math.round(days)} days`;
}

// ── Summary metrics at the top ───────────────────────────────────
function summaryMetrics() {
  const rs = state.reorderSummary;
  if (!rs) return "";
  return `<div class="metric-grid">
    ${metric("Critical", rs.critical, "!", "Stockout imminent")}
          ${metric("Reorder now", rs.reorder_now, "↗", "Within safety buffer")}
          ${metric("Adequate", rs.adequate, "✓", "Sufficient runway")}
          ${metric("Total medicines", rs.total_medicines, "✚", "Analysed")}
  </div>`;
}

// ── Build table rows ─────────────────────────────────────────────
function reorderRows(recs) {
  return recs
    .map(
      (r) => `<tr class="reorder-row reorder-${r.urgency.toLowerCase()}">
    <td>
      <span class="primary-cell">${esc(r.medicine_name)}</span>
      <span class="secondary-cell">${esc(r.category || "—")}</span>
    </td>
    <td>${urgencyBadge(r.urgency)}</td>
    <td class="number-cell">${r.usable_stock.toLocaleString("en-IN")}</td>
    <td class="number-cell">${r.avg_daily_sales.toFixed(1)}</td>
    <td class="number-cell">${daysLabel(r.days_of_stock_remaining)}</td>
    <td class="number-cell">${r.stockout_date ? dateText(r.stockout_date) : "—"}</td>
    <td class="number-cell"><strong>${r.recommended_qty.toLocaleString("en-IN")}</strong></td>
    <td class="number-cell">${money(r.estimated_cost)}</td>
    <td>
      <span class="secondary-cell">${esc(r.supplier_name || "N/A")}</span>
      <span class="secondary-cell">${r.lead_time_days}d lead</span>
    </td>
  </tr>`
    )
    .join("");
}

// ── Filter bar ───────────────────────────────────────────────────
function filterBar() {
  return `<div class="reorder-filters">
    <label>
      <span>Urgency</span>
      <select id="reorderFilterUrgency">
        <option value="ALL">All</option>
        <option value="CRITICAL">Critical</option>
        <option value="REORDER_NOW">Reorder now</option>
        <option value="ADEQUATE">Adequate</option>
        <option value="OVERSTOCKED">Overstocked</option>
        <option value="NO_SALES">No sales data</option>
      </select>
    </label>
    <label>
      <span>Lookback window</span>
      <select id="reorderFilterWindow">
        <option value="14">14 days</option>
        <option value="30" selected>30 days</option>
        <option value="60">60 days</option>
        <option value="90">90 days</option>
      </select>
    </label>
    <label>
      <span>Target coverage</span>
      <select id="reorderFilterTarget">
        <option value="14">14 days</option>
        <option value="30" selected>30 days</option>
        <option value="45">45 days</option>
        <option value="60">60 days</option>
      </select>
    </label>
  </div>`;
}

// ── Main render ──────────────────────────────────────────────────
export function render() {
  const recs = state.reorderRecs || [];

  return (
    pageHeading(
      "MEDSTOCK IQ",
      "Reorder advice",
      "Intelligent purchase recommendations based on sales velocity, inventory, and supplier lead times.",
      ""
    ) +
    summaryMetrics() +
    `<section class="panel">
      <div class="panel-head">
        <div>
          <h2>Reorder recommendations</h2>
          <p>Sorted by urgency — most critical first</p>
        </div>
      </div>
      ${filterBar()}
      <div id="reorderTableWrap">
      ${table(
        ["Medicine", "Urgency", "Stock", "Sales/day", "Runway", "Stockout", "Order qty", "Est. cost", "Supplier"],
        reorderRows(recs),
        "No medicines found. Add medicines and record stock movements to generate recommendations."
      )}
      </div>
    </section>`
  );
}

// ── Bind interactive filters ─────────────────────────────────────
export function bind(ctx) {
  const urgencySelect = document.getElementById("reorderFilterUrgency");
  const windowSelect = document.getElementById("reorderFilterWindow");
  const targetSelect = document.getElementById("reorderFilterTarget");

  function applyFilter() {
    const urgency = urgencySelect.value;
    const recs = state.reorderRecs || [];
    const filtered =
      urgency === "ALL" ? recs : recs.filter((r) => r.urgency === urgency);

    document.getElementById("reorderTableWrap").innerHTML = table(
      ["Medicine", "Urgency", "Stock", "Sales/day", "Runway", "Stockout", "Order qty", "Est. cost", "Supplier"],
      reorderRows(filtered),
      "No medicines match this filter."
    );
  }

  async function reloadWithParams() {
    const params = new URLSearchParams({
      window_days: windowSelect.value,
      target_days: targetSelect.value,
    });
    try {
      const { request } = await import("../api/client.js");
      const [recs, summary] = await Promise.all([
        request(`/api/reorder/recommendations?${params}`),
        request(`/api/reorder/summary?${params}`),
      ]);
      state.reorderRecs = recs;
      state.reorderSummary = summary;

      // Re-render entire page to update metrics.
      const { navigate } = await import("../router.js");
      navigate("reorder");
    } catch (err) {
      const { toast } = await import("../components/toast.js");
      toast("Failed to reload recommendations: " + err.message, true);
    }
  }

  urgencySelect?.addEventListener("change", applyFilter);
  windowSelect?.addEventListener("change", reloadWithParams);
  targetSelect?.addEventListener("change", reloadWithParams);
}
