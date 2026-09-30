// Netlify function: /api/trips — per-user trip sync (the account's server side).
//   GET            -> { trips: [...] }   the caller's saved trips
//   POST {trip}    -> { id }             add/update a trip (owner = JWT email)
//   DELETE {id}    -> {}                 remove one trip (owner must match)
// Auth: Netlify Identity JWT, verified cryptographically (_auth.js).
// Storage: one Blobs key per user (trips:<email>), max 50 trips each.
const { getStore } = require("@netlify/blobs");
const { verifyJwt } = require("./_auth.js");

const MAX_TRIPS = 50;

const cors = {
  "Access-Control-Allow-Origin": "*", // public site; auth is the gate, not origin
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};
const json = (status, obj) => ({
  statusCode: status,
  headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(obj),
});

// Sanitize a client trip record to a fixed shape (never trust the payload).
function cleanTrip(t) {
  return {
    id: String(t.id || "").slice(0, 40) || null,
    at: Number(t.at) || Date.now(),
    days: Math.min(21, Math.max(1, parseInt(t.days) || 1)),
    who: String(t.who || "").slice(0, 60),
    places: Array.isArray(t.places) ? t.places.slice(0, 8).map(p => String(p).slice(0, 60)) : [],
    budget: String(t.budget || "").slice(0, 120),
    daysPlan: Array.isArray(t.daysPlan)
      ? t.daysPlan.slice(0, 21).map(d => ({
          day: parseInt(d.day) || 0,
          title: String(d.title || "").slice(0, 120),
          plan: String(d.plan || "").slice(0, 1200),
        }))
      : [],
    placeKeys: Array.isArray(t.placeKeys) ? t.placeKeys.slice(0, 8).map(k => String(k).slice(0, 40)) : [],
  };
}

async function readTrips(store, email) {
  const key = "trips:" + email.toLowerCase();
  return (await store.get(key, { type: "json" })) || [];
}

exports.handler = async (req) => {
  if (req.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors };

  const v = await verifyJwt(req.headers && (req.headers.authorization || req.headers.Authorization));
  if (!v.ok) return json(401, { error: "Log in to sync trips." });

  let store;
  try {
    const { openStore } = require("./_log.js");
    store = openStore();
  } catch {
    return json(500, { error: "Storage unavailable." });
  }

  const email = v.email;

  // GET: list my trips
  if (req.httpMethod === "GET") {
    try {
      const trips = await readTrips(store, email);
      return json(200, { trips });
    } catch {
      return json(200, { trips: [] });
    }
  }

  let body = {};
  try { body = JSON.parse(req.body || "{}"); } catch {}

  // POST: add or update one of my trips
  if (req.httpMethod === "POST") {
    if (!body.trip || typeof body.trip !== "object") return json(400, { error: "trip required" });
    const trip = cleanTrip(body.trip);
    trip.id = trip.id || `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    let trips = [];
    try { trips = await readTrips(store, email); } catch { trips = []; }
    const i = trips.findIndex(t => t.id === trip.id);
    if (i >= 0) trips[i] = trip; else trips.push(trip);
    if (trips.length > MAX_TRIPS) trips = trips.slice(-MAX_TRIPS);
    await store.setJSON("trips:" + email.toLowerCase(), trips);
    return json(200, { id: trip.id, count: trips.length });
  }

  // DELETE: remove one of my trips by id
  if (req.httpMethod === "DELETE") {
    const id = String(body.id || "").slice(0, 40);
    if (!id) return json(400, { error: "id required" });
    let trips = [];
    try { trips = await readTrips(store, email); } catch { trips = []; }
    const next = trips.filter(t => t.id !== id);
    await store.setJSON("trips:" + email.toLowerCase(), next);
    return json(200, { removed: trips.length - next.length });
  }

  return json(405, { error: "Method not allowed." }, { Allow: "GET, POST, DELETE" });
};
