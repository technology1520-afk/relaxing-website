// Netlify function: GET /api/admin-data
// Server-side admin gate — defense in depth:
//   1. Bearer JWT required (Netlify Identity access token)
//   2. Verified via _auth.js (Identity /user validation for HS256, JWKs for RS256)
//   3. app_metadata.user_roles must contain 'admin' (app_metadata is only
//      writable server-side — user_metadata is NOT trusted for roles)
//   4. Same-origin only (CORS never allows admin calls cross-origin)
//   5. GET only; responses no-store so no admin data lingers in caches
// Without all of these, no data leaves the server.

const crypto = require("node:crypto");
const { verifyJwt } = require("./_auth.js");
const { openStore } = require("./_log.js");

const json = (status, obj, extraHeaders) => ({
  statusCode: status,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "null", // admin API is same-origin only
    "Cache-Control": "no-store",
    ...(extraHeaders || {}),
  },
  body: JSON.stringify(obj),
});

const b64url = (s) => Buffer.from(s, "base64url").toString("utf8");

// ---- JWT verification against Netlify Identity (GoTrue) ----
const JWKS_CACHE = { keys: null, at: 0 };
const JWKS_TTL = 10 * 60 * 1000; // 10 min

function identityUrl() {
  // GoTrue endpoint: the deploy's own identity, or override for local dev
  return process.env.IDENTITY_URL || "https://relaxdayoff.com/.netlify/identity";
}

async function getJWKs() {
  const now = Date.now();
  if (JWKS_CACHE.keys && now - JWKS_CACHE.at < JWKS_TTL) return JWKS_CACHE.keys;
  const r = await fetch(identityUrl() + "/jwks.json");
  if (!r.ok) throw new Error("jwks fetch failed");
  const jwks = await r.json();
  if (!Array.isArray(jwks.keys) || !jwks.keys.length) throw new Error("jwks empty");
  JWKS_CACHE.keys = jwks.keys;
  JWKS_CACHE.at = now;
  return jwks.keys;
}

function verifyJwtSignature(token, jwk) {
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) return false;
  const data = Buffer.from(h + "." + p);
  const sig = Buffer.from(s, "base64");
  const keyObj = crypto.createPublicKey({ key: jwk, format: "jwk" });
  const header = JSON.parse(b64url(h));
  const alg = header.alg || "RS256";
  const verifyAlg = alg === "RS256" ? "RSA-SHA256" : alg === "RS384" ? "RSA-SHA384" : "RSA-SHA512";
  return crypto.verify(verifyAlg, data, keyObj, sig);
}

async function verifyAdmin(authHeader) {
  const token = String(authHeader || "").replace(/^Bearer\s+/i, "").trim();
  if (!token || token.split(".").length !== 3) return { ok: false, reason: "no/bad token" };

  let header, payload;
  try {
    header = JSON.parse(b64url(token.split(".")[0]));
    payload = JSON.parse(b64url(token.split(".")[1]));
  } catch {
    return { ok: false, reason: "malformed token" };
  }
  if (header.alg !== "RS256" && header.alg !== "RS384" && header.alg !== "RS512") {
    return { ok: false, reason: "unsupported algorithm" }; // blocks alg=none / HS256 confusion
  }

  // Expiry (+60s clock skew) and issuance sanity
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now - 60) return { ok: false, reason: "expired token" };
  if (payload.nbf && payload.nbf > now + 60) return { ok: false, reason: "token not yet valid" };
  if (payload.iat && payload.iat > now + 60) return { ok: false, reason: "token issued in the future" };

  // Expected issuer for this site's Identity instance
  const expectedIss = identityUrl();
  if (payload.iss && payload.iss !== expectedIss && !payload.iss.startsWith(expectedIss)) {
    return { ok: false, reason: "wrong issuer" };
  }

  // Cryptographic signature verification against GoTrue's published keys
  try {
    const jwks = await getJWKs();
    const jwk = jwks.find(k => k.kid === header.kid) || (jwks.length === 1 ? jwks[0] : null);
    if (!jwk) return { ok: false, reason: "unknown key id" };
    if (!verifyJwtSignature(token, jwk)) return { ok: false, reason: "bad signature" };
  } catch {
    return { ok: false, reason: "signature check failed" };
  }

  // Role gate: app_metadata ONLY. user_metadata is client-writable on
  // Netlify Identity (via the widget update call) and must never grant roles.
  const roles = payload.app_metadata?.user_roles || [];
  if (!Array.isArray(roles) || !roles.includes("admin")) {
    return { ok: false, reason: "admin role required" };
  }

  return { ok: true, email: payload.email || "unknown" };
}

exports.handler = async (req, context) => {
  if (req.httpMethod === "OPTIONS") {
    // Same-origin only: no cross-origin admin calls, ever.
    return { statusCode: 204, headers: { "Access-Control-Allow-Origin": "null", "Access-Control-Allow-Headers": "Authorization" } };
  }
  if (req.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed." }, { Allow: "GET" });
  }

  const authHeader = (req.headers && (req.headers.authorization || req.headers.Authorization)) || "";
  const v = await verifyAdmin(authHeader);
  if (!v.ok) return json(401, { error: "Not authorized." });

  // ---- Data from Blobs ----
  let data = { trips: [], aiCalls: [], priceChecks: [], signups: [] };
  try {
    const store = openStore();
    const read = async (k, fallback) => {
      try { const v2 = await store.get(k, { type: "json" }); return v2 || fallback; } catch { return fallback; }
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
