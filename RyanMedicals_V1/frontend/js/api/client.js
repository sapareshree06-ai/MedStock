import { API } from "../config.js";

// Thin fetch wrapper: JSON in/out, readable error messages.
export async function request(path, options = {}) {
  const response = await fetch(API + path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });

  const raw = await response.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = raw;
  }

  if (!response.ok) {
    const detail = data?.detail || data?.message || raw || `HTTP ${response.status}`;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return data;
}

export const post = (path, payload) =>
  request(path, { method: "POST", body: JSON.stringify(payload) });
