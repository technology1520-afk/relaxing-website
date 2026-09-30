// Shared Netlify Identity auth for functions.
//
// The current Netlify Identity service (identity.services.netlify.com) signs
// user JWTs with HS256 + kid "nf-ident" and publishes no JWKS. The only
// correct validator is the Identity service itself, so we validate the Bearer
// token server-side by calling GET {identity}/user and reading the verified
// user from the response. Legacy GoTrue instances publish RS256 JWKs at
// /.netlify/identity/jwks.json; both paths are supported here.
const crypto = require("node:crypto");

const b64url = (s) => Buffer.from(s, "base64url").toString("utf8");

function identityUrl() {
  return process.env.IDENTITY_URL || "https://relaxdayoff.com/.netlify/identity";
}

// ---- legacy RS256 path (GoTrue instances that publish JWKs) ----
const JWKS_CACHE = { keys: null, at: 0 };
const JWKS_TTL = 10 * 60 * 1000; // 10 min

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

// ---- verified-user cache (token -> user) ----
const USER_CACHE = new Map();
const USER_TTL = 5 * 60 * 1000; // 5 min
const USER_CACHE_MAX = 500;

function cachePut(token, user) {
  if (USER_CACHE.size >= USER_CACHE_MAX) USER_CACHE.delete(USER_CACHE.keys().next().value);
  USER_CACHE.set(token, { user, at: Date.now() });
}

function cacheGet(token) {
  const hit = USER_CACHE.get(token);
  if (hit && Date.now() - hit.at < USER_TTL) return hit.user;
  if (hit) USER_CACHE.delete(token);
  return null;
}

// Verifies a Bearer JWT issued by Netlify Identity.
// Returns { ok, email, user, payload } or { ok:false, reason }.
// opts.roles: when set, the user's app_metadata.user_roles must include them.
async function verifyJwt(authHeader, opts = {}) {
  const token = String(authHeader || "").replace(/^Bearer\s+/i, "").trim();
  if (!token || token.split(".").length !== 3) return { ok: false, reason: "no/bad token" };

  let header, payload;
  try {
    header = JSON.parse(b64url(token.split(".")[0]));
    payload = JSON.parse(b64url(token.split(".")[1]));
  } catch {
    return { ok: false, reason: "malformed token" };
  }

  // Expiry (+60s clock skew) checked locally first — cheap and authoritative.
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now - 60) return { ok: false, reason: "expired token" };
  if (payload.nbf && payload.nbf > now + 60) return { ok: false, reason: "token not yet valid" };
  if (payload.iat && payload.iat > now + 60) return { ok: false, reason: "token issued in the future" };

  const cached = cacheGet(token);
  if (cached) return checkRoles(cached, opts);

  let user = null;

  if (header.alg === "HS256" && header.kid === "nf-ident") {
    // Current Netlify Identity service: the /user endpoint IS the validator.
    // It 401s on any invalid or forged token, so this is a real check.
    try {
      const r = await fetch(identityUrl() + "/user", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.status === 401) return { ok: false, reason: "invalid token" };
      if (!r.ok) return { ok: false, reason: "identity unreachable" };
      user = await r.json();
      if (!user || !user.email) return { ok: false, reason: "invalid token" };
    } catch {
      return { ok: false, reason: "identity unreachable" };
    }
  } else if (header.alg === "RS256" || header.alg === "RS384" || header.alg === "RS512") {
    // Legacy GoTrue: verify the signature locally against published JWKs.
    try {
      const jwks = await getJWKs();
      const jwk = jwks.find(k => k.kid === header.kid) || (jwks.length === 1 ? jwks[0] : null);
      if (!jwk) return { ok: false, reason: "unknown key id" };
      if (!verifyJwtSignature(token, jwk)) return { ok: false, reason: "bad signature" };
      user = { email: payload.email, app_metadata: payload.app_metadata || {}, ...payload };
    } catch {
      return { ok: false, reason: "signature check failed" };
    }
  } else {
    // alg=none, HS256 with a foreign kid, etc. — never trusted.
    return { ok: false, reason: "unsupported algorithm" };
  }

  cachePut(token, user);
  return checkRoles(user, opts);
}

function checkRoles(user, opts) {
  if (opts.roles && opts.roles.length) {
    const roles = user.app_metadata?.user_roles || [];
    if (!Array.isArray(roles) || !opts.roles.every(r => roles.includes(r))) {
      return { ok: false, reason: "role required" };
    }
  }
  if (!user.email) return { ok: false, reason: "no email claim" };
  return { ok: true, email: user.email, user, payload: user };
}

module.exports = { verifyJwt, identityUrl };
