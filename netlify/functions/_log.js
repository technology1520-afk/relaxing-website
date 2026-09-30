// Netlify function: shared admin logging to Blobs. Best-effort: never blocks the response.
const { getStore } = require("@netlify/blobs");

// getStore auto-wires from env in normal deploys; fall back to explicit wiring
// when the bundle context lacks the Blobs env vars.
function openStore() {
  // 1) Normal auto-wiring (works when the runtime injects NETLIFY_BLOBS_CONTEXT)
  try {
    return getStore({ name: "stillwater-admin", consistency: "strong" });
  } catch {}
  // 2) Explicit wiring with a personal access token (full read/write)
  if (process.env.NETLIFY_BLOBS_TOKEN && process.env.SITE_ID) {
    return getStore({
      name: "stillwater-admin",
      consistency: "strong",
      siteID: process.env.SITE_ID,
      token: process.env.NETLIFY_BLOBS_TOKEN,
    });
  }
  // 3) Last resort: the functions token (read-only on some plans)
  return getStore({
    name: "stillwater-admin",
    consistency: "strong",
    siteID: process.env.SITE_ID,
    token: process.env.NETLIFY_FUNCTIONS_TOKEN,
  });
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
