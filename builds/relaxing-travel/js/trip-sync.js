// Trip sync: keeps a visitor's trips on the server (per-user, via /api/trips)
// so they follow the account across devices. Local storage stays as cache +
// offline fallback. Every call is best-effort: sync failures never break UX.

function authHeaders(extra = {}) {
  const token = window.netlifyIdentity?.currentUser()?.jwt?.();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : { ...extra };
}

export function loggedIn() {
  return !!window.netlifyIdentity?.currentUser();
}

// Push one trip to the server. Resolves with the server id, or null offline.
export async function pushTrip(trip) {
  try {
    if (!loggedIn()) return null;
    const r = await fetch("/api/trips", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ trip }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d.id || null;
  } catch { return null; }
}

// Fetch the account's trips from the server. Falls back to local cache.
export async function fetchTrips() {
  const local = (() => {
    try { return JSON.parse(localStorage.getItem("sw_trips") || "[]"); } catch { return []; }
  })();
  try {
    if (!loggedIn()) return local;
    const r = await fetch("/api/trips", { headers: authHeaders() });
    if (!r.ok) return local;
    const d = await r.json();
    const remote = Array.isArray(d.trips) ? d.trips : [];
    // Merge: remote is source of truth; keep any local-only trips not yet synced.
    const ids = new Set(remote.map(t => t.id));
    const localOnly = local.filter(t => !t.id || !ids.has(t.id));
    const merged = [...remote, ...localOnly];
    try { localStorage.setItem("sw_trips", JSON.stringify(merged.slice(-50))); } catch {}
    return merged;
  } catch {
    return local;
  }
}

// Remove one trip on the server (and locally).
export async function deleteTrip(id) {
  try {
    const store = JSON.parse(localStorage.getItem("sw_trips") || "[]");
    localStorage.setItem("sw_trips", JSON.stringify(store.filter(t => t.id !== id)));
  } catch {}
  try {
    if (!loggedIn()) return false;
    const r = await fetch("/api/trips", {
      method: "DELETE",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id }),
    });
    return r.ok;
  } catch { return false; }
}
