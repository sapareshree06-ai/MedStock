// Single shared application state. Import and read/mutate from anywhere.
export const state = {
  page: "overview",
  medicines: [],
  suppliers: [],
  batches: [],
  movements: [],
  summary: null,
  low: [],
  expiry: [],
};

// Lookup helpers that depend on state
export function medicineName(id) {
  return state.medicines.find((m) => m.id === Number(id))?.name || `Medicine #${id}`;
}

export function supplierName(id) {
  return (
    state.suppliers.find((s) => s.id === Number(id))?.name ||
    (id ? `Supplier #${id}` : "Not assigned")
  );
}

export function findBatch(id) {
  return state.batches.find((b) => b.id === id);
}

export function findMedicine(id) {
  return state.medicines.find((m) => m.id === id);
}
