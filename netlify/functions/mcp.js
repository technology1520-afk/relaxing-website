// Netlify function: POST /api/mcp
// MCP (Model Context Protocol) JSON-RPC 2.0 endpoint for the owner's AI agent.
// Auth: Authorization: Bearer $MCP_SECRET (env var — only the owner knows it).
// The agent can list tools and call them to manage/read the site's data.
// Humans are NOT authenticated here — this is a machine-to-machine endpoint.

const { getStore } = require("@netlify/blobs");

const json = (status, obj) => ({
  statusCode: status,
  headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  body: JSON.stringify(obj),
});

async function readStore(key, fallback) {
  try {
    const store = getStore({ name: "stillwater-admin", consistency: "strong" });
    return (await store.get(key, { type: "json" })) || fallback;
  } catch { return fallback; }
}

// ---- Tools the agent can call ----
const TOOLS = [
  {
    name: "site.stats",
    description: "Overview stats: signups, trips planned, AI calls, price checks, with 7-day deltas. Plus top destinations and most-asked questions.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "trips.list",
    description: "List recent AI-planned trips (days, who, places, budget feel). Args: limit (1-50, default 20).",
    inputSchema: { type: "object", properties: { limit: { type: "number", minimum: 1, maximum: 50 } }, additionalProperties: false },
  },
  {
    name: "questions.list",
    description: "Recent visitor questions asked to Relaxagent. Args: limit (1-100, default 30).",
    inputSchema: { type: "object", properties: { limit: { type: "number", minimum: 1, maximum: 100 } }, additionalProperties: false },
  },
  {
    name: "signups.list",
    description: "Recent account signups (email, date). Args: limit (1-100, default 30).",
    inputSchema: { type: "object", properties: { limit: { type: "number", minimum: 1, maximum: 100 } }, additionalProperties: false },
  },
  {
    name: "pricechecks.list",
    description: "Recent fair-price checks: place, item, quoted price, verdict. Args: limit (1-100, default 30).",
    inputSchema: { type: "object", properties: { limit: { type: "number", minimum: 1, maximum: 100 } }, additionalProperties: false },
  },
];

async function toolData() {
  const [trips, aiCalls, priceChecks, signups] = await Promise.all([
    readStore("trips", []), readStore("ai_calls", []), readStore("price_checks", []), readStore("signups", []),
  ]);
  return { trips, aiCalls, priceChecks, signups };
}

function rank(arr) {
  const m = {};
  arr.filter(Boolean).forEach(x => { const k = String(x).slice(0, 40); m[k] = (m[k] || 0) + 1; });
  return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => ({ name: k, count: n }));
}

async function callTool(name, args) {
  const d = await toolData();
  const now = Date.now(), day = 86400000;
  switch (name) {
    case "site.stats": {
      const r = {
        signups: d.signups.length, signups7d: d.signups.filter(x => now - (x.at || 0) < 7 * day).length,
        trips: d.trips.length, trips7d: d.trips.filter(x => now - (x.at || 0) < 7 * day).length,
        aiCalls: d.aiCalls.length, aiCalls7d: d.aiCalls.filter(x => now - (x.at || 0) < 7 * day).length,
        priceChecks: d.priceChecks.length,
        topDestinations: rank(d.trips.flatMap(t => t.places || [])),
        topQuestions: rank(d.aiCalls.filter(c => c.kind === "ask").map(c => c.q)),
      };
      return JSON.stringify(r, null, 1);
    }
    case "trips.list": {
      const lim = Math.min(50, Math.max(1, (args && args.limit) || 20));
      return JSON.stringify(d.trips.slice(-lim).reverse().map(t => ({
        at: new Date(t.at).toISOString(), days: t.days, who: t.who, places: t.places, budget: t.budget,
      })), null, 1);
    }
    case "questions.list": {
      const lim = Math.min(100, Math.max(1, (args && args.limit) || 30));
      return JSON.stringify(d.aiCalls.filter(c => c.kind === "ask").slice(-lim).reverse()
        .map(c => ({ at: new Date(c.at).toISOString(), q: c.q, place: c.place })), null, 1);
    }
    case "signups.list": {
      const lim = Math.min(100, Math.max(1, (args && args.limit) || 30));
      return JSON.stringify(d.signups.slice(-lim).reverse()
        .map(u => ({ at: new Date(u.at).toISOString(), email: u.email })), null, 1);
    }
    case "pricechecks.list": {
      const lim = Math.min(100, Math.max(1, (args && args.limit) || 30));
      return JSON.stringify(d.priceChecks.slice(-lim).reverse()
        .map(c => ({ at: new Date(c.at).toISOString(), place: c.place, item: c.item, quote: c.quote, verdict: c.verdict })), null, 1);
    }
    default:
      throw new Error("Unknown tool: " + name);
  }
}

exports.handler = async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors };

  // ---- Auth: MCP secret only ----
  const secret = process.env.MCP_SECRET;
  if (!secret) return json(503, { jsonrpc: "2.0", id: null, error: { code: -32001, message: "MCP_SECRET not configured on the server." } });
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token || token !== secret) {
    return json(401, { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized. MCP requires the owner's secret token." } });
  }

  // ---- JSON-RPC 2.0 ----
  let msg;
  try { msg = JSON.parse(req.body || "{}"); } catch {
    return json(400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
  }
  const id = msg.id ?? null;
  const { method, params } = msg;

  try {
    if (method === "initialize") {
      return json(200, {
        jsonrpc: "2.0", id,
        result: {
          protocolVersion: "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: { name: "relaxdayoff-admin", version: "1.0.0" },
        },
      });
    }
    if (method === "tools/list") {
      return json(200, { jsonrpc: "2.0", id, result: { tools: TOOLS } });
    }
    if (method === "tools/call") {
      const name = params?.name;
      const result = await callTool(name, params?.arguments);
      return json(200, { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: result }] } });
    }
    if (method === "ping") return json(200, { jsonrpc: "2.0", id, result: {} });
    return json(400, { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found: " + method } });
  } catch (e) {
    return json(200, { jsonrpc: "2.0", id, error: { code: -32000, message: String(e.message || e).slice(0, 200) } });
  }
};
