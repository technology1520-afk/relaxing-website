// Test harness: exercises verifyAdmin logic from admin-data.js without Netlify.
// Generates its own RSA JWKs, spins a fake JWKS endpoint, signs real JWTs.
const crypto = require("node:crypto");
const http = require("node:http");
const path = require("node:path");

// ---- import the function under test ----
const modPath = path.resolve(__dirname, "../netlify/functions/admin-data.js");
const adminData = require(modPath);

// ---- generate RSA keypair -> JWK ----
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwkPub = publicKey.export({ format: "jwk" });
jwkPub.kid = "test-key-1";
jwkPub.alg = "RS256";
jwkPub.use = "sig";

// ---- fake GoTrue JWKS server ----
const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ keys: [jwkPub] }));
});

const b64u = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");

function sign(payload, alg = "RS256", key = privateKey) {
  const header = { alg, typ: "JWT", kid: "test-key-1" };
  const data = b64u(header) + "." + b64u(payload);
  const sigAlg = { RS256: "RSA-SHA256", RS384: "RSA-SHA384", RS512: "RSA-SHA512" }[alg];
  const sig = crypto.sign(sigAlg, Buffer.from(data), key).toString("base64url");
  return data + "." + sig;
}

const now = Math.floor(Date.now() / 1000);
const basePayload = {
  sub: "user-123",
  email: "admin@relaxdayoff.com",
  iss: process.env.IDENTITY_URL,
  iat: now - 100,
  exp: now + 3600,
  app_metadata: { user_roles: ["admin"] },
};

async function run(handler, authHeader, method = "GET") {
  const req = { httpMethod: method, headers: authHeader ? { authorization: authHeader } : {} };
  const res = await handler(req, {});
  return res;
}

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log("PASS " + name); }
  else { fail++; console.log("FAIL " + name + (extra ? "  -> " + JSON.stringify(extra) : "")); }
}

(async () => {
  process.env.IDENTITY_URL = "http://127.0.0.1:18080";
  await new Promise(r => server.listen(18080, r));

  // 1. valid admin token -> 200
  let r = await run(adminData.handler, "Bearer " + sign(basePayload));
  check("valid admin token -> 200", r.statusCode === 200, r);

  // 2. no token -> 401
  r = await run(adminData.handler, null);
  check("no token -> 401", r.statusCode === 401, r);

  // 3. expired token -> 401
  r = await run(adminData.handler, "Bearer " + sign({ ...basePayload, exp: now - 120 }));
  check("expired token -> 401", r.statusCode === 401, r);

  // 4. admin role missing -> 401 (403 folded into 401, fine as long as blocked)
  r = await run(adminData.handler, "Bearer " + sign({ ...basePayload, app_metadata: { user_roles: ["user"] } }));
  check("non-admin role blocked", r.statusCode === 401 || r.statusCode === 403, r);

  // 5. role smuggled in user_metadata only -> blocked (the old vuln)
  r = await run(adminData.handler, "Bearer " + sign({ ...basePayload, app_metadata: {}, user_metadata: { user_roles: ["admin"] } }));
  check("user_metadata role escalation blocked", r.statusCode === 401 || r.statusCode === 403, r);

  // 6. tampered payload -> 401
  const good = sign(basePayload).split(".");
  const forgedPayload = b64u({ ...basePayload, app_metadata: { user_roles: ["admin"], email: "evil@x.com" } });
  r = await run(adminData.handler, `Bearer ${good[0]}.${forgedPayload}.${good[2]}`);
  check("tampered payload -> 401", r.statusCode === 401, r);

  // 7. alg=none -> 401
  const noneToken = b64u({ alg: "none", typ: "JWT" }) + "." + b64u(basePayload) + ".";
  r = await run(adminData.handler, "Bearer " + noneToken);
  check("alg=none -> 401", r.statusCode === 401, r);

  // 8. HS256 confusion (signs with public key data as HMAC secret) -> 401
  const hmacSecret = JSON.stringify(jwkPub);
  const hsData = b64u({ alg: "HS256", typ: "JWT", kid: "test-key-1" }) + "." + b64u(basePayload);
  const hsSig = crypto.createHmac("sha256", hmacSecret).update(hsData).digest("base64url");
  r = await run(adminData.handler, `Bearer ${hsData}.${hsSig}`);
  check("HS256 confusion -> 401", r.statusCode === 401, r);

  // 9. wrong issuer -> 401
  r = await run(adminData.handler, "Bearer " + sign({ ...basePayload, iss: "https://evil.example/.netlify/identity" }));
  check("wrong issuer -> 401", r.statusCode === 401, r);

  // 10. POST -> 405
  r = await run(adminData.handler, "Bearer " + sign(basePayload), "POST");
  check("POST -> 405", r.statusCode === 405, r);

  // 11. garbage token -> 401
  r = await run(adminData.handler, "Bearer not.a.jwt");
  check("garbage token -> 401", r.statusCode === 401, r);

  // 12. token signed by a different key (unknown kid) -> 401
  const { privateKey: otherKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  r = await run(adminData.handler, "Bearer " + sign(basePayload, "RS256", otherKey));
  check("foreign key signature -> 401", r.statusCode === 401, r);

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("HARNESS ERROR", e); process.exit(2); });
