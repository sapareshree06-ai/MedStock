const API = "http://127.0.0.1:8000";

async function getJSON(path) {
  const response = await fetch(API + path);
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function loadDashboard() {
  try {
    const summary = await getJSON("/api/dashboard/summary");
    document.getElementById("medicineCount").textContent = summary.medicine_count;
    document.getElementById("batchCount").textContent = summary.batch_count;
    document.getElementById("unitCount").textContent = summary.total_units;
    document.getElementById("inventoryValue").textContent = "₹" + summary.inventory_value;
    document.getElementById("expiryValue").textContent = "₹" + summary.near_expiry_value;

    const batches = await getJSON("/api/batches");
    document.getElementById("batchTable").innerHTML = batches.map(b => `
      <tr>
        <td>${b.medicine_id}</td>
        <td>${b.batch_number}</td>
        <td>${b.expiry_date}</td>
        <td>${b.quantity}</td>
        <td>₹${b.mrp}</td>
      </tr>
    `).join("");

    const low = await getJSON("/api/alerts/low-stock");
    document.getElementById("lowStock").innerHTML =
      low.length ? low.map(x => `<li>${x.medicine}: ${x.quantity} units (reorder ≤ ${x.reorder_level})</li>`).join("")
                 : "<li>No low-stock medicines.</li>";

    const expiry = await getJSON("/api/alerts/near-expiry");
    document.getElementById("nearExpiry").innerHTML =
      expiry.length ? expiry.map(x => `<li>${x.medicine} — ${x.batch_number}: ${x.quantity} units, expires ${x.expiry_date}</li>`).join("")
                     : "<li>No batches expiring within 90 days.</li>";
  } catch (error) {
    document.getElementById("result").textContent =
      "Could not connect to backend. Start FastAPI first.\n\n" + error;
  }
}

document.getElementById("stockOutForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const medicine_id = Number(document.getElementById("medicineId").value);
  const quantity = Number(document.getElementById("quantity").value);

  try {
    const response = await fetch(API + "/api/stock/out", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ medicine_id, quantity, notes: "Frontend test" })
    });

    const data = await response.json();
    document.getElementById("result").textContent =
      JSON.stringify(data, null, 2);

    if (response.ok) loadDashboard();
  } catch (error) {
    document.getElementById("result").textContent = String(error);
  }
});

loadDashboard();
