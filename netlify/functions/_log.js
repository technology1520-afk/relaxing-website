// Netlify function: shared admin logging to Blobs. Best-effort: never blocks the response.
const { getStore } = require("@netlify/blobs");

// getStore auto-wires from env in normal deploys; fall back to explicit wiring
// when the bundle context lacks the Blobs env vars.
function openStore() {
  try {
    return getStore({ name: "stillwater-admin", consistency: "strong" });
  } catch {
    return getStore({
      name: "stillwater-admin",
      consistency: "strong",
      siteID: process.env.SITE_ID,
      token: process.env.NETLIFY_FUNCTIONS_TOKEN,
    });
  }
}

async function logAdmin(kind, record) {
  try {
    const store = openStore();
    const key = { ask: "ai_calls", suggest: "ai_calls", plan: "ai_calls", signup: "signups", price: "price_checks", trip: "trips" }[kind] || "misc";
    const list = (await store.get(key, { type: "json" })) || [];
    list.push({ kind, at: Date.now(), ...record });
    await store.setJSON(key, list.slice(-500));
  } catch { /* logging must never break the response */ }
}

module.exports = { logAdmin, openStore };
