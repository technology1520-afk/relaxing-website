// Netlify function: POST /api/suggest  { mood: string }
// Returns { ids: [...], line: string } using OpenRouter's free models router.
// The API key never reaches the browser.

const { logAdmin } = require("./_log.js");

const DESTINATIONS = [
  { id: "iceland",    name: "Blue Lagoon, Iceland" },
  { id: "whitehaven", name: "Hill Inlet, Whitehaven Beach, Australia" },
  { id: "napali",     name: "Nāpali Coast, Kauai, Hawaii" },
  { id: "yasawa",     name: "Naviti Island, Yasawa Islands, Fiji" },
  { id: "kyoto",      name: "Ryōan-ji zen garden, Kyoto, Japan" },
];

exports.handler = async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors };

  let mood = "";
  try { mood = String(JSON.parse(req.body || "{}").mood || "").slice(0, 200); }
  catch { /* fall through */ }
  if (!mood) return json(400, { error: "Say one true sentence about your week." }, cors);

  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return json(503, { error: "The suggester is warming up. Add OPENROUTER_API_KEY in your deploy settings." }, cors);

  const list = DESTINATIONS.map(d => `- ${d.id}: ${d.name}`).join("\n");
  const prompt =
`A traveller writes: "${mood}"

Match their mood to the 1-3 quietest-fitting destinations from this list:
${list}

Reply ONLY with minified JSON: {"ids":["one_or_two_ids"],"line":"one short warm sentence (max 18 words) telling them why, second person, no exclamation marks"}`;

  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.SITE_URL || "https://stillwater.netlify.app",
        "X-Title": "Stillwater",
      },
      body: JSON.stringify({
        model: "openrouter/free",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 120,
        temperature: 0.6,
      }),
    });
    if (!r.ok) return json(502, { error: "The globe stayed quiet. Try again in a moment." }, cors);
    const data = await r.json();
    const text = (data.choices?.[0]?.message?.content || "").trim();
    const m = text.match(/\{[\s\S]*\}/);
    const parsed = m ? JSON.parse(m[0]) : null;
    const valid = new Set(DESTINATIONS.map(d => d.id));
    const ids = (parsed?.ids || []).filter(id => valid.has(id)).slice(0, 3);
    await logAdmin("suggest", { q: mood.slice(0, 80), ids });
    return json(200, { ids, line: String(parsed?.line || "").slice(0, 160) }, cors);
  } catch {
    return json(502, { error: "The globe stayed quiet. Try again in a moment." }, cors);
  }
};

function json(status, obj, cors) {
  return { statusCode: status, headers: { ...cors, "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}
