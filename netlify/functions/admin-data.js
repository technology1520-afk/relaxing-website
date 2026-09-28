// Netlify function: GET /api/admin-data
// Server-side admin gate: verifies the caller's Netlify Identity JWT and the
// 'admin' user_roles app_metadata claim. Without both, no data leaves the server.

const { getStore } = require("@netlify/blobs");

const json = (status, obj) => ({
  statusCode: status,
  headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  body: JSON.stringify(obj),
});

async function verifyAdmin(context) {
  const token = (context.headers.authorization || "").replace("Bearer ", "");
  if (!token) return { ok: false, reason: "no token" };
  try {
    const r = await fetch("https://api.netlify.com/api/v1/user", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return { ok: false, reason: "invalid token" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "token check failed" };
  }
}

exports.handler = async (req, context) => {
  if (req.httpMethod === "OPTIONS") return { statusCode: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type" } };

  const v = await verifyAdmin(context);
  if (!v.ok) return json(401, { error: "Not authorized.", reason: v.reason });

  // Role gate: Identity JWT contains app_metadata.user_roles
  let roles = [];
  try {
    const token = (context.headers.authorization || "").replace("Bearer ", "");
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString("utf8"));
    roles = payload.app_metadata?.user_roles || payload.user_metadata?.user_roles || [];
  } catch {}
  if (!roles.includes("admin")) return json(403, { error: "Admin role required." });

  // ---- Data from Blobs ----
  let data = { trips: [], aiCalls: [], priceChecks: [], signups: [] };
  try {
    const store = getStore({ name: "stillwater-admin", consistency: "strong" });
    const read = async (k, fallback) => {
      try { const v = await store.get(k, { type: "json" }); return v || fallback; } catch { return fallback; }
    };
    data.trips = await read("trips", []);
    data.aiCalls = await read("ai_calls", []);
    data.priceChecks = await read("price_checks", []);
    data.signups = await read("signups", []);
  } catch (e) {
    return json(200, { ...data, note: "Blobs unavailable in this environment (" + String(e).slice(0, 80) + "). Showing empty state." });
  }

  // stats
  const now = Date.now();
  const dayMs = 86400000;
  const stats = {
    trips: data.trips.length,
    trips7d: data.trips.filter(t => now - (t.at || 0) < 7 * dayMs).length,
    aiCalls: data.aiCalls.length,
    aiCalls7d: data.aiCalls.filter(c => now - (c.at || 0) < 7 * dayMs).length,
    priceChecks: data.priceChecks.length,
    signups: data.signups.length,
    signups7d: data.signups.filter(s => now - (s.at || 0) < 7 * dayMs).length,
    popularPlaces: rank(data.trips.flatMap(t => t.places || [])),
    popularQuestions: rank(data.aiCalls.filter(c => c.kind === "ask").map(c => c.q || "")),
  };
  return json(200, { stats, trips: data.trips.slice(-50).reverse(), aiCalls: data.aiCalls.slice(-100).reverse(), signups: data.signups.slice(-50).reverse() });
};

function rank(arr) {
  const m = {};
  arr.filter(Boolean).forEach(x => { const k = String(x).slice(0, 40); m[k] = (m[k] || 0) + 1; });
  return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => ({ k, n }));
}
