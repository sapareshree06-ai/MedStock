const API = "http://127.0.0.1:8000";

const state = {
  medicines: [],
  batches: [],
  lowStock: [],
  nearExpiry: [],
  movements: [],
  activeView: "overview",
  batchFilter: "",
};

const VIEW_META = {
  overview: { title: "Store Overview", eyebrow: "Daily Pharmacy Snapshot" },
  counter: { title: "Receive & Dispense", eyebrow: "Stock Receipt & FEFO Counter" },
  inventory: { title: "Batches & Alerts", eyebrow: "Stock Lots, Expiry & Reorder Watch" },
  movements: { title: "Stock Ledger", eyebrow: "Immutable IN / OUT Audit Trail" },
};

function formatDateLabel() {
  return new Date().toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTimestamp(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function setApiStatus(statusClass, label) {
  const badge = document.getElementById("apiStatus");
  badge.classList.remove("is-idle", "is-online", "is-offline");
  badge.classList.add(statusClass);
  const textNode = badge.querySelector("span:last-child");
  if (textNode) textNode.textContent = label;
}

function showToast(kind, message) {
  const bar = document.getElementById("toastBar");
  bar.className = `toast ${kind === "err" ? "toast-err" : "toast-ok"}`;
  bar.textContent = message;
  bar.classList.remove("hidden");
}

function hideToast() {
  const bar = document.getElementById("toastBar");
  bar.classList.add("hidden");
  bar.textContent = "";
}

function parseErrorText(status, rawText) {
  try {
    const data = JSON.parse(rawText);
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail)) {
      return data.detail
        .map((err) => {
          const field = Array.isArray(err.loc) ? err.loc[err.loc.length - 1] : "";
          return field ? `${field}: ${err.msg}` : err.msg;
        })
        .join(" • ");
    }
    return JSON.stringify(data, null, 2);
  } catch {
    return rawText || `Request failed (${status})`;
  }
}

async function fetchJSON(path, options = {}) {
  const response = await fetch(API + path, options);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(parseErrorText(response.status, text));
  }
  return text ? JSON.parse(text) : null;
}

function switchView(viewName) {
  if (!VIEW_META[viewName]) return;
  state.activeView = viewName;

  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.view === viewName);
  });

  document.querySelectorAll(".view-pane").forEach((pane) => {
    pane.classList.toggle("is-active", pane.id === `view-${viewName}`);
  });

  document.getElementById("viewTitle").textContent = VIEW_META[viewName].title;
  document.getElementById("todayLabel").textContent =
    `${VIEW_META[viewName].eyebrow} • ${formatDateLabel()}`;
}

function getMedicineName(medicineId) {
  const med = state.medicines.find((m) => Number(m.id) === Number(medicineId));
  return med ? `${med.name} (#${med.id})` : `Medicine #${medicineId}`;
}

function getBatchLabel(batchId) {
  const batch = state.batches.find((b) => Number(b.id) === Number(batchId));
  if (!batch) return `Batch #${batchId}`;
  return `${batch.batch_number} (Batch #${batch.id}, Med #${batch.medicine_id})`;
}

function getExpiryStatus(expiryDateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const exp = new Date(`${expiryDateStr}T00:00:00`);
  if (Number.isNaN(exp.getTime())) {
    return { label: expiryDateStr, cls: "expiry-ok" };
  }

  const diffDays = Math.round((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) {
    return { label: `${expiryDateStr} • Expired`, cls: "expiry-expired" };
  }
  if (diffDays <= 90) {
    return { label: `${expiryDateStr} • ${diffDays}d left`, cls: "expiry-soon" };
  }
  return { label: expiryDateStr, cls: "expiry-ok" };
}

function renderPickerOptions() {
  const medSelect = document.getElementById("medicineSelect");
  const currentMedVal = medSelect.value;
  medSelect.innerHTML = '<option value="">Select medicine (or enter ID below)</option>';

  for (const med of state.medicines) {
    const opt = document.createElement("option");
    opt.value = String(med.id);
    opt.textContent = `${med.name} — ID #${med.id} (reorder ≤ ${med.reorder_level})`;
    medSelect.appendChild(opt);
  }
  if (currentMedVal) medSelect.value = currentMedVal;

  const batchSelect = document.getElementById("batchSelect");
  const currentBatchVal = batchSelect.value;
  batchSelect.innerHTML = '<option value="">Select batch (or enter Batch ID below)</option>';

  for (const batch of state.batches) {
    const opt = document.createElement("option");
    opt.value = String(batch.id);
    opt.textContent = `${batch.batch_number} — Batch #${batch.id} • ${batch.quantity} units • exp ${batch.expiry_date}`;
    batchSelect.appendChild(opt);
  }
  if (currentBatchVal) batchSelect.value = currentBatchVal;
}

function renderAlerts() {
  const lowCount = state.lowStock.length;
  const expiryCount = state.nearExpiry.length;
  const totalAlerts = lowCount + expiryCount;

  document.getElementById("alertNavCount").textContent = String(totalAlerts);
  document.getElementById("lowStockBadge").textContent = `${lowCount} ${lowCount === 1 ? "item" : "items"}`;
  document.getElementById("nearExpiryBadge").textContent = `${expiryCount} ${expiryCount === 1 ? "batch" : "batches"}`;
  document.getElementById("lowStockCountPill").textContent = String(lowCount);
  document.getElementById("nearExpiryCountPill").textContent = String(expiryCount);

  const overviewLow = document.getElementById("overviewLowStock");
  const fullLow = document.getElementById("lowStock");
  overviewLow.innerHTML = "";
  fullLow.innerHTML = "";

  if (!lowCount) {
    const emptyA = document.createElement("li");
    emptyA.className = "empty-note";
    emptyA.textContent = "All medicines are above reorder level.";
    overviewLow.appendChild(emptyA);

    const emptyB = document.createElement("li");
    emptyB.className = "empty-note";
    emptyB.textContent = "No low-stock medicines right now.";
    fullLow.appendChild(emptyB);
  } else {
    for (const item of state.lowStock) {
      const text = `${item.medicine} (#${item.medicine_id})`;
      const right = `${item.quantity} / ≤ ${item.reorder_level} units`;

      for (const target of [overviewLow, fullLow]) {
        const li = document.createElement("li");
        const leftSpan = document.createElement("span");
        leftSpan.textContent = text;
        const rightSpan = document.createElement("span");
        rightSpan.className = "mono";
        rightSpan.textContent = right;
        li.appendChild(leftSpan);
        li.appendChild(rightSpan);
        target.appendChild(li);
      }
    }
  }

  const overviewExpiry = document.getElementById("overviewNearExpiry");
  const fullExpiry = document.getElementById("nearExpiry");
  overviewExpiry.innerHTML = "";
  fullExpiry.innerHTML = "";

  if (!expiryCount) {
    const emptyA = document.createElement("li");
    emptyA.className = "empty-note";
    emptyA.textContent = "No batches expiring in the next 90 days.";
    overviewExpiry.appendChild(emptyA);

    const emptyB = document.createElement("li");
    emptyB.className = "empty-note";
    emptyB.textContent = "No near-expiry batches within 90 days.";
    fullExpiry.appendChild(emptyB);
  } else {
    for (const item of state.nearExpiry) {
      const leftText = `${item.medicine} • ${item.batch_number}`;
      const riskPart = item.value_at_risk !== undefined ? ` • ₹${item.value_at_risk} risk` : "";
      const rightText = `${item.quantity}u • exp ${item.expiry_date}${riskPart}`;

      for (const target of [overviewExpiry, fullExpiry]) {
        const li = document.createElement("li");
        const leftSpan = document.createElement("span");
        leftSpan.textContent = leftText;
        const rightSpan = document.createElement("span");
        rightSpan.className = "mono";
        rightSpan.textContent = rightText;
        li.appendChild(leftSpan);
        li.appendChild(rightSpan);
        target.appendChild(li);
      }
    }
  }
}

function renderRecentActivity() {
  const stream = document.getElementById("recentActivityList");
  stream.innerHTML = "";

  const recent = state.movements.slice(0, 6);
  if (!recent.length) {
    const li = document.createElement("li");
    li.className = "empty-note";
    li.textContent = "No stock movements recorded yet.";
    stream.appendChild(li);
    return;
  }

  for (const m of recent) {
    const li = document.createElement("li");

    const main = document.createElement("div");
    main.className = "activity-main";

    const typeUpper = String(m.movement_type || "").toUpperCase();
    const badge = document.createElement("span");
    badge.className = `move-badge ${typeUpper === "IN" ? "move-in" : "move-out"}`;
    badge.textContent = typeUpper || "LOG";

    const summary = document.createElement("span");
    const sign = typeUpper === "IN" ? "+" : "-";
    summary.textContent = `${sign}${m.quantity} units on ${getBatchLabel(m.batch_id)}`;

    main.appendChild(badge);
    main.appendChild(summary);

    if (m.notes) {
      const note = document.createElement("span");
      note.className = "activity-note";
      note.textContent = m.notes;
      note.title = m.notes;
      main.appendChild(note);
    }

    const time = document.createElement("span");
    time.className = "activity-time";
    time.textContent = formatTimestamp(m.timestamp);

    li.appendChild(main);
    li.appendChild(time);
    stream.appendChild(li);
  }
}

function renderBatchTable() {
  const tbody = document.getElementById("batchTable");
  tbody.innerHTML = "";

  const q = state.batchFilter.trim().toLowerCase();
  const filtered = q
    ? state.batches.filter((b) => {
        const medName = getMedicineName(b.medicine_id).toLowerCase();
        return (
          String(b.batch_number).toLowerCase().includes(q) ||
          String(b.id).includes(q) ||
          String(b.medicine_id).includes(q) ||
          medName.includes(q)
        );
      })
    : state.batches;

  if (!filtered.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.className = "empty-note";
    td.textContent = q ? "No matching batches for your filter." : "No batches available.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  for (const b of filtered) {
    const tr = document.createElement("tr");

    const batchTd = document.createElement("td");
    batchTd.className = "mono";
    batchTd.textContent = `${b.batch_number} (#${b.id})`;

    const medTd = document.createElement("td");
    medTd.textContent = getMedicineName(b.medicine_id);

    const expTd = document.createElement("td");
    const expInfo = getExpiryStatus(b.expiry_date);
    const expSpan = document.createElement("span");
    expSpan.className = `expiry-pill ${expInfo.cls}`;
    expSpan.textContent = expInfo.label;
    expTd.appendChild(expSpan);

    const qtyTd = document.createElement("td");
    qtyTd.className = "num mono";
    qtyTd.textContent = String(b.quantity);

    const mrpTd = document.createElement("td");
    mrpTd.className = "num mono";
    mrpTd.textContent = `₹${b.mrp}`;

    tr.appendChild(batchTd);
    tr.appendChild(medTd);
    tr.appendChild(expTd);
    tr.appendChild(qtyTd);
    tr.appendChild(mrpTd);
    tbody.appendChild(tr);
  }
}

function renderMovementTable() {
  const tbody = document.getElementById("movementTable");
  tbody.innerHTML = "";

  if (!state.movements.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.className = "empty-note";
    td.textContent = "No stock movements recorded yet.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  for (const m of state.movements) {
    const tr = document.createElement("tr");

    const whenTd = document.createElement("td");
    whenTd.textContent = formatTimestamp(m.timestamp);

    const typeTd = document.createElement("td");
    const typeUpper = String(m.movement_type || "").toUpperCase();
    const badge = document.createElement("span");
    badge.className = `move-badge ${typeUpper === "IN" ? "move-in" : "move-out"}`;
    badge.textContent = typeUpper || "LOG";
    typeTd.appendChild(badge);

    const batchTd = document.createElement("td");
    batchTd.className = "mono";
    batchTd.textContent = getBatchLabel(m.batch_id);

    const qtyTd = document.createElement("td");
    qtyTd.className = "num mono";
    qtyTd.textContent = String(m.quantity);

    const noteTd = document.createElement("td");
    noteTd.textContent = m.notes || "—";

    tr.appendChild(whenTd);
    tr.appendChild(typeTd);
    tr.appendChild(batchTd);
    tr.appendChild(qtyTd);
    tr.appendChild(noteTd);
    tbody.appendChild(tr);
  }
}

function renderReceipt(headline, chips, rawPayload) {
  document.getElementById("receiptHeadline").textContent = headline;
  const container = document.getElementById("receiptBreakdown");
  container.innerHTML = "";

  for (const label of chips) {
    const chip = document.createElement("span");
    chip.className = "receipt-chip";
    chip.textContent = label;
    container.appendChild(chip);
  }

  document.getElementById("result").textContent =
    typeof rawPayload === "string" ? rawPayload : JSON.stringify(rawPayload, null, 2);
}

async function syncWorkspace() {
  try {
    const [summary, medicines, batches, lowStock, nearExpiry, movements] = await Promise.all([
      fetchJSON("/api/dashboard/summary"),
      fetchJSON("/api/medicines"),
      fetchJSON("/api/batches"),
      fetchJSON("/api/alerts/low-stock"),
      fetchJSON("/api/alerts/near-expiry"),
      fetchJSON("/api/stock/movements"),
    ]);

    state.medicines = medicines || [];
    state.batches = batches || [];
    state.lowStock = lowStock || [];
    state.nearExpiry = nearExpiry || [];
    state.movements = movements || [];

    document.getElementById("medicineCount").textContent = String(summary.medicine_count);
    document.getElementById("batchCount").textContent = String(summary.batch_count);
    document.getElementById("unitCount").textContent = String(summary.total_units);
    document.getElementById("inventoryValue").textContent = `₹${summary.inventory_value}`;
    document.getElementById("expiryValue").textContent = `₹${summary.near_expiry_value}`;

    renderPickerOptions();
    renderAlerts();
    renderRecentActivity();
    renderBatchTable();
    renderMovementTable();

    setApiStatus("is-online", "Backend Connected");
    hideToast();
  } catch (err) {
    setApiStatus("is-offline", "Backend Offline");
    showToast("err", `Could not sync with FastAPI (${API}): ${err.message}`);
    renderReceipt(
      "Unable to reach FastAPI server.",
      [`API: ${API}`, "Start uvicorn to refresh store figures"],
      err.message
    );
  }
}

// Navigation handlers
document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

document.querySelectorAll("[data-jump-view]").forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.jumpView));
});

// Quick-pick select <-> numeric ID synchronization
document.getElementById("medicineSelect").addEventListener("change", (e) => {
  if (e.target.value) {
    document.getElementById("medicineId").value = e.target.value;
  }
});

document.getElementById("medicineId").addEventListener("input", (e) => {
  const select = document.getElementById("medicineSelect");
  const match = Array.from(select.options).some((opt) => opt.value === e.target.value);
  select.value = match ? e.target.value : "";
});

document.getElementById("batchSelect").addEventListener("change", (e) => {
  if (e.target.value) {
    document.getElementById("inBatchId").value = e.target.value;
  }
});

document.getElementById("inBatchId").addEventListener("input", (e) => {
  const select = document.getElementById("batchSelect");
  const match = Array.from(select.options).some((opt) => opt.value === e.target.value);
  select.value = match ? e.target.value : "";
});

// Stock-Out (FEFO) submission
document.getElementById("stockOutForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const medicine_id = Number(document.getElementById("medicineId").value);
  const quantity = Number(document.getElementById("quantity").value);
  const notes = document.getElementById("outNotes").value.trim();

  try {
    const body = { medicine_id, quantity };
    if (notes) body.notes = notes;

    const data = await fetchJSON("/api/stock/out", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const allocs = Array.isArray(data.allocations) ? data.allocations : [];
    const chips = allocs.map(
      (a) => `${a.batch_number} (Batch #${a.batch_id}): −${a.quantity_used} units (exp ${a.expiry_date})`
    );

    renderReceipt(
      `Issued ${quantity} units of ${getMedicineName(medicine_id)} via FEFO.`,
      chips.length ? chips : [`Requested: ${quantity} units`],
      data
    );
    showToast("ok", `Dispensed ${quantity} units for ${getMedicineName(medicine_id)}.`);

    document.getElementById("quantity").value = "";
    document.getElementById("outNotes").value = "";
    await syncWorkspace();
  } catch (err) {
    renderReceipt("Stock-out could not be completed.", [`Error: ${err.message}`], err.message);
    showToast("err", err.message);
  }
});

// Stock-In submission
document.getElementById("stockInForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const batch_id = Number(document.getElementById("inBatchId").value);
  const quantity = Number(document.getElementById("inQuantity").value);
  const notes = document.getElementById("inNotes").value.trim();

  try {
    const body = { batch_id, quantity };
    if (notes) body.notes = notes;

    const data = await fetchJSON("/api/stock/in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    renderReceipt(
      `Received +${quantity} units into ${getBatchLabel(batch_id)}.`,
      [`New Batch Stock: ${data.new_quantity ?? "updated"} units`, notes ? `Note: ${notes}` : "Logged as IN"],
      data
    );
    showToast("ok", `Added +${quantity} units to Batch #${batch_id}.`);

    document.getElementById("inQuantity").value = "";
    document.getElementById("inNotes").value = "";
    await syncWorkspace();
  } catch (err) {
    renderReceipt("Stock-in could not be completed.", [`Error: ${err.message}`], err.message);
    showToast("err", err.message);
  }
});

document.getElementById("batchSearch").addEventListener("input", (e) => {
  state.batchFilter = e.target.value;
  renderBatchTable();
});

document.getElementById("toggleRawBtn").addEventListener("click", () => {
  const pre = document.getElementById("result");
  const isHidden = pre.classList.toggle("hidden");
  document.getElementById("toggleRawBtn").textContent = isHidden ? "Show API JSON" : "Hide API JSON";
});

document.getElementById("refreshBtn").addEventListener("click", () => {
  syncWorkspace();
});

document.getElementById("todayLabel").textContent =
  `${VIEW_META.overview.eyebrow} • ${formatDateLabel()}`;

syncWorkspace();