// Shared JWT verification against Netlify Identity (GoTrue JWKs).
// Used by admin-data (role gate) and trips (per-user data ownership).
const crypto = require("node:crypto");

const b64url = (s) => Buffer.from(s, "base64url").toString("utf8");

const JWKS_CACHE = { keys: null, at: 0 };
const JWKS_TTL = 10 * 60 * 1000; // 10 min

function identityUrl() {
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

// Verifies a Bearer JWT. Returns { ok, email, payload } or { ok:false, reason }.
// opts.roles: when set, app_metadata.user_roles must include every listed role.
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
  if (header.alg !== "RS256" && header.alg !== "RS384" && header.alg !== "RS512") {
    return { ok: false, reason: "unsupported algorithm" }; // blocks alg=none / HS256 confusion
  }

  // Expiry (+60s clock skew) and issuance sanity
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now - 60) return { ok: false, reason: "expired token" };
  if (payload.nbf && payload.nbf > now + 60) return { ok: false, reason: "token not yet valid" };
  if (payload.iat && payload.iat > now + 60) return { ok: false, reason: "token issued in the future" };

  const expectedIss = identityUrl();
  if (payload.iss && payload.iss !== expectedIss && !payload.iss.startsWith(expectedIss)) {
    return { ok: false, reason: "wrong issuer" };
  }

  try {
    const jwks = await getJWKs();
    const jwk = jwks.find(k => k.kid === header.kid) || (jwks.length === 1 ? jwks[0] : null);
    if (!jwk) return { ok: false, reason: "unknown key id" };
    if (!verifyJwtSignature(token, jwk)) return { ok: false, reason: "bad signature" };
  } catch {
    return { ok: false, reason: "signature check failed" };
  }

  if (opts.roles && opts.roles.length) {
    const roles = payload.app_metadata?.user_roles || [];
    if (!Array.isArray(roles) || !opts.roles.every(r => roles.includes(r))) {
      return { ok: false, reason: "role required" };
    }
  }

  if (!payload.email) return { ok: false, reason: "no email claim" };
  return { ok: true, email: payload.email, payload };
}

module.exports = { verifyJwt, identityUrl };
