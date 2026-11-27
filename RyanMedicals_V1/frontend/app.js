const API = "http://127.0.0.1:8000";
const state = { medicines: [], batches: [], lowStock: [], nearExpiry: [], movements: [], batchFilter: "" };

const VIEW_META = {
  overview: "Store overview",
  counter: "Receive and dispense",
  inventory: "Shelves and alerts",
  movements: "Stock ledger",
};

const $ = (id) => document.getElementById(id);
const rupee = (v) => `₹${Number(v ?? 0).toLocaleString("en-IN")}`;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

const fmtDate = () =>
  new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

function fmtTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? String(ts) : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function setApiStatus(cls, label) {
  const b = $("apiStatus");
  b.classList.remove("is-idle", "is-online", "is-offline");
  b.classList.add(cls);
  b.querySelector("span").textContent = label;
}

let toastTimer;
function showToast(kind, msg) {
  const t = $("toastBar");
  t.className = `toast ${kind === "err" ? "toast-err" : "toast-ok"}`;
  t.textContent = msg;
  clearTimeout(toastTimer);
  if (kind !== "err") toastTimer = setTimeout(hideToast, 3500);
}
function hideToast() { $("toastBar").classList.add("hidden"); }

function parseErrorText(status, raw) {
  try {
    const d = JSON.parse(raw);
    if (typeof d.detail === "string") return d.detail;
    if (Array.isArray(d.detail))
      return d.detail.map((e) => {
        const f = Array.isArray(e.loc) ? e.loc[e.loc.length - 1] : "";
        return f ? `${f}: ${e.msg}` : e.msg;
      }).join(" • ");
    return JSON.stringify(d, null, 2);
  } catch {
    return raw || `Request failed (${status})`;
  }
}

async function fetchJSON(path, options = {}) {
  const res = await fetch(API + path, options);
  const text = await res.text();
  if (!res.ok) throw new Error(parseErrorText(res.status, text));
  return text ? JSON.parse(text) : null;
}

const postJSON = (path, body) =>
  fetchJSON(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

function switchView(name) {
  if (!VIEW_META[name]) return;
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("is-active", b.dataset.view === name));
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("is-active", v.id === `view-${name}`));
  $("viewTitle").textContent = VIEW_META[name];
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function medName(id) {
  const m = state.medicines.find((x) => Number(x.id) === Number(id));
  return m ? `${m.name} (#${m.id})` : `Medicine #${id}`;
}

function batchLabel(id) {
  const b = state.batches.find((x) => Number(x.id) === Number(id));
  return b ? `${b.batch_number} (Batch #${b.id}, Med #${b.medicine_id})` : `Batch #${id}`;
}

function expiryStatus(dateStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const exp = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(exp.getTime())) return { label: dateStr, cls: "" };
  const d = Math.round((exp - today) / 864e5);
  if (d < 0) return { label: `${dateStr} · Expired`, cls: "gone" };
  if (d <= 90) return { label: `${dateStr} · ${d}d left`, cls: "soon" };
  return { label: dateStr, cls: "" };
}

/* A row: title + optional subtitle on the left, amount on the right */
function row(title, sub, amount, amtCls = "") {
  const li = el("li");
  const left = el("div");
  left.append(el("span", "", title));
  if (sub) left.append(el("span", "sub", sub));
  li.append(left, el("span", `amt ${amtCls}`, amount));
  return li;
}

function fillList(ids, items, emptyText, build) {
  for (const id of ids) {
    const ul = $(id);
    ul.innerHTML = "";
    if (!items.length) { ul.append(el("li", "empty", emptyText)); continue; }
    items.forEach((it) => ul.append(build(it)));
  }
}

function renderPickers() {
  const ms = $("medicineSelect"), mv = ms.value;
  ms.innerHTML = "";
  ms.append(new Option("Choose a medicine", ""));
  state.medicines.forEach((m) => ms.append(new Option(`${m.name} · #${m.id} · reorder at ${m.reorder_level}`, m.id)));
  if (mv) ms.value = mv;

  const bs = $("batchSelect"), bv = bs.value;
  bs.innerHTML = "";
  bs.append(new Option("Choose a batch", ""));
  state.batches.forEach((b) =>
    bs.append(new Option(`${b.batch_number} · #${b.id} · ${b.quantity} units · exp ${b.expiry_date}`, b.id)));
  if (bv) bs.value = bv;
}

function renderAlerts() {
  const low = state.lowStock, exp = state.nearExpiry;
  $("alertNavCount").textContent = String(low.length + exp.length);
  $("lowStockCountPill").textContent = String(low.length);
  $("nearExpiryCountPill").textContent = String(exp.length);

  fillList(["overviewLowStock", "lowStock"], low, "Everything is above its reorder level.", (i) =>
    row(`${i.medicine} (#${i.medicine_id})`, `Reorder at ${i.reorder_level} units`, `${i.quantity} left`, "warn"));

  fillList(["overviewNearExpiry", "nearExpiry"], exp, "Nothing expires in the next 90 days.", (i) =>
    row(`${i.medicine} · ${i.batch_number}`,
        `${i.quantity} units · expires ${i.expiry_date}`,
        i.value_at_risk !== undefined ? `${rupee(i.value_at_risk)} at risk` : "", "bad"));
}

function moveBadge(type) {
  const t = String(type || "").toUpperCase();
  return el("span", `tag ${t === "IN" ? "in" : "out"}`, t === "IN" ? "In" : t === "OUT" ? "Out" : "Log");
}

function renderActivity() {
  fillList(["recentActivityList"], state.movements.slice(0, 6), "No stock movements yet.", (m) => {
    const isIn = String(m.movement_type).toUpperCase() === "IN";
    const li = el("li");
    const left = el("div");
    const top = el("span");
    top.append(moveBadge(m.movement_type), `${isIn ? "+" : "−"}${m.quantity} units`);
    left.append(top, el("span", "sub", `${batchLabel(m.batch_id)}${m.notes ? " · " + m.notes : ""}`));
    li.append(left, el("span", "amt", fmtTime(m.timestamp)));
    return li;
  });
}

function emptyRow(tbody, cols, text) {
  const tr = el("tr"), td = el("td", "empty", text);
  td.colSpan = cols;
  tr.append(td);
  tbody.append(tr);
}

function renderBatches() {
  const tb = $("batchTable");
  tb.innerHTML = "";
  const q = state.batchFilter.trim().toLowerCase();
  const list = q
    ? state.batches.filter((b) =>
        [b.batch_number, b.id, b.medicine_id, medName(b.medicine_id)].some((v) => String(v).toLowerCase().includes(q)))
    : state.batches;
  if (!list.length) return emptyRow(tb, 5, q ? "No batches match your search." : "No batches yet.");

  for (const b of list) {
    const tr = el("tr");
    const e = expiryStatus(b.expiry_date);
    const exp = el("td"); exp.append(el("span", `exp ${e.cls}`, e.label));
    tr.append(el("td", "", `${b.batch_number} (#${b.id})`), el("td", "", medName(b.medicine_id)), exp,
      el("td", "r", String(b.quantity)), el("td", "r", rupee(b.mrp)));
    tb.append(tr);
  }
}

function renderMovements() {
  const tb = $("movementTable");
  tb.innerHTML = "";
  if (!state.movements.length) return emptyRow(tb, 5, "No stock movements yet.");
  for (const m of state.movements) {
    const tr = el("tr");
    const type = el("td"); type.append(moveBadge(m.movement_type));
    tr.append(el("td", "", fmtTime(m.timestamp)), type, el("td", "", batchLabel(m.batch_id)),
      el("td", "r", String(m.quantity)), el("td", "", m.notes || "—"));
    tb.append(tr);
  }
}

function renderReceipt(headline, chips, raw) {
  $("receiptHeadline").textContent = headline;
  const box = $("receiptBreakdown");
  box.innerHTML = "";
  chips.forEach((c) => box.append(el("span", "", c)));
  $("result").textContent = typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
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
    Object.assign(state, {
      medicines: medicines || [], batches: batches || [], lowStock: lowStock || [],
      nearExpiry: nearExpiry || [], movements: movements || [],
    });

    $("medicineCount").textContent = String(summary.medicine_count);
    $("batchCount").textContent = String(summary.batch_count);
    $("unitCount").textContent = Number(summary.total_units).toLocaleString("en-IN");
    $("inventoryValue").textContent = rupee(summary.inventory_value);
    $("expiryValue").textContent = rupee(summary.near_expiry_value);

    renderPickers(); renderAlerts(); renderActivity(); renderBatches(); renderMovements();
    setApiStatus("is-online", "Connected");
    hideToast();
  } catch (err) {
    setApiStatus("is-offline", "Offline");
    showToast("err", `Can't reach the server at ${API}. Start uvicorn, then refresh. (${err.message})`);
    renderReceipt("The server isn't responding.", [`API: ${API}`], err.message);
  }
}

/* Navigation */
document.querySelectorAll(".nav-item").forEach((b) => b.addEventListener("click", () => switchView(b.dataset.view)));
document.querySelectorAll("[data-jump-view]").forEach((b) =>
  b.addEventListener("click", (e) => { e.preventDefault(); switchView(b.dataset.jumpView); }));

/* Select <-> ID sync */
function link(selectId, inputId) {
  $(selectId).addEventListener("change", (e) => { if (e.target.value) $(inputId).value = e.target.value; });
  $(inputId).addEventListener("input", (e) => {
    const s = $(selectId);
    s.value = Array.from(s.options).some((o) => o.value === e.target.value) ? e.target.value : "";
  });
}
link("medicineSelect", "medicineId");
link("batchSelect", "inBatchId");

/* Dispense (FEFO) */
$("stockOutForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const medicine_id = Number($("medicineId").value);
  const quantity = Number($("quantity").value);
  const notes = $("outNotes").value.trim();
  try {
    const body = { medicine_id, quantity };
    if (notes) body.notes = notes;
    const data = await postJSON("/api/stock/out", body);
    const chips = (Array.isArray(data.allocations) ? data.allocations : []).map(
      (a) => `${a.batch_number} (Batch #${a.batch_id}): −${a.quantity_used} units, exp ${a.expiry_date}`);
    renderReceipt(`Dispensed ${quantity} units of ${medName(medicine_id)}, oldest expiry first.`,
      chips.length ? chips : [`Requested: ${quantity} units`], data);
    showToast("ok", `Dispensed ${quantity} units of ${medName(medicine_id)}.`);
    $("quantity").value = ""; $("outNotes").value = "";
    await syncWorkspace();
  } catch (err) {
    renderReceipt("Couldn't dispense that stock.", [err.message], err.message);
    showToast("err", err.message);
  }
});

/* Receive */
$("stockInForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const batch_id = Number($("inBatchId").value);
  const quantity = Number($("inQuantity").value);
  const notes = $("inNotes").value.trim();
  try {
    const body = { batch_id, quantity };
    if (notes) body.notes = notes;
    const data = await postJSON("/api/stock/in", body);
    renderReceipt(`Received ${quantity} units into ${batchLabel(batch_id)}.`,
      [`New batch total: ${data.new_quantity ?? "updated"} units`, notes ? `Note: ${notes}` : "Logged as In"], data);
    showToast("ok", `Received ${quantity} units into Batch #${batch_id}.`);
    $("inQuantity").value = ""; $("inNotes").value = "";
    await syncWorkspace();
  } catch (err) {
    renderReceipt("Couldn't receive that stock.", [err.message], err.message);
    showToast("err", err.message);
  }
});

$("batchSearch").addEventListener("input", (e) => { state.batchFilter = e.target.value; renderBatches(); });
$("toggleRawBtn").addEventListener("click", () => {
  const hidden = $("result").classList.toggle("hidden");
  $("toggleRawBtn").textContent = hidden ? "Show API JSON" : "Hide API JSON";
});
$("refreshBtn").addEventListener("click", syncWorkspace);

$("todayLabel").textContent = fmtDate();
syncWorkspace();
