// Netlify function: POST /api/track { kind, ...record }
// Lightweight public telemetry: price checks from the fair-price tool.
const { logAdmin } = require("./_log.js");

exports.handler = async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors };
  let b = {};
  try { b = JSON.parse(req.body || "{}"); } catch {}
  const kind = b.kind === "price" ? "price" : null;
  if (!kind) return { statusCode: 400, headers: cors, body: "{}" };
  await logAdmin("price", {
    place: String(b.place || "").slice(0, 20),
    item: String(b.item || "").slice(0, 12),
    quote: Number(b.quote) || 0,
    verdict: String(b.verdict || "").slice(0, 20),
  });
  return { statusCode: 200, headers: { ...cors, "Content-Type": "application/json" }, body: "{}" };
};
