import { NEAR_EXPIRY_DAYS } from "../config.js";
import { state } from "../state.js";
import { request } from "./client.js";

// Fetch everything the UI needs and store it in shared state.
export async function loadData() {
  const results = await Promise.all([
    request("/api/dashboard/summary"),
    request("/api/medicines"),
    request("/api/suppliers"),
    request("/api/batches"),
    request("/api/stock/movements"),
    request("/api/alerts/low-stock"),
    request(`/api/alerts/near-expiry?days=${NEAR_EXPIRY_DAYS}`),
  ]);

  [
    state.summary,
    state.medicines,
    state.suppliers,
    state.batches,
    state.movements,
    state.low,
    state.expiry,
  ] = results;
}
