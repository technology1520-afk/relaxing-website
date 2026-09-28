// Netlify function: shared admin logging to Blobs. Best-effort: never blocks the response.
const { getStore } = require("@netlify/blobs");

async function logAdmin(kind, record) {
  try {
    const store = getStore({ name: "stillwater-admin", consistency: "strong" });
    const key = { ask: "ai_calls", suggest: "ai_calls", plan: "ai_calls", signup: "signups", price: "price_checks", trip: "trips" }[kind] || "misc";
    const list = (await store.get(key, { type: "json" })) || [];
    list.push({ kind, at: Date.now(), ...record });
    await store.setJSON(key, list.slice(-500));
  } catch { /* logging must never break the response */ }
}

module.exports = { logAdmin };
