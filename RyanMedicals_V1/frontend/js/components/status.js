import { todayISO } from "../utils/format.js";

export function stockStatus(qty, level = 0) {
  if (qty <= 0) return '<span class="status status-danger">Out of stock</span>';
  if (qty <= level) return '<span class="status status-warn">Low stock</span>';
  return '<span class="status status-good">In stock</span>';
}

export function expiryStatus(date) {
  const days = Math.ceil(
    (new Date(date + "T00:00:00") - new Date(todayISO() + "T00:00:00")) / 86400000
  );
  if (days < 0) return '<span class="status status-danger">Expired</span>';
  if (days <= 30) return '<span class="status status-warn">Critical</span>';
  if (days <= 90) return '<span class="status status-warn">Near expiry</span>';
  return '<span class="status status-good">Good</span>';
}

export function movementBadge(type) {
  return type === "IN"
    ? '<span class="status status-good">Stock in</span>'
    : '<span class="status status-neutral">Stock out</span>';
}
