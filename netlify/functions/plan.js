// Netlify function: POST /api/plan { days, who, places: [keys] }
// Returns { days: [{day, title, plan}], budget } using OpenRouter free models.
// The API key never reaches the browser.

const NAMES = {
  iceland: "Blue Lagoon, Iceland",
  lofoten: "Reine, Lofoten, Norway",
  faroe: "Sørvágsvatn, Faroe Islands",
  whitehaven: "Hill Inlet, Whitsundays, Australia",
  napali: "Nāpali Coast, Kauai, Hawaii",
  wadirum: "Wadi Rum, Jordan",
  yasawa: "Naviti Island, Fiji",
  kyoto: "Ryōan-ji, Kyoto, Japan",
};
const BUDGETS = {
  iceland: "very expensive", lofoten: "expensive", faroe: "expensive",
  whitehaven: "expensive", napali: "very expensive", wadirum: "moderate",
  yasawa: "moderate", kyoto: "moderate",
};

exports.handler = async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors };

  let body = {};
  try { body = JSON.parse(req.body || "{}"); } catch {}
  const days = Math.min(21, Math.max(1, parseInt(body.days) || 7));
  const who = String(body.who || "a family with kids").slice(0, 300);
  const places = (Array.isArray(body.places) ? body.places : []).filter(k => NAMES[k]).slice(0, 8);
  if (!places.length) return json(400, { error: "Pick at least one place." }, cors);

  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return json(503, { error: "The planner is warming up. Add OPENROUTER_API_KEY in your deploy settings." }, cors);

  const list = places.map(k => NAMES[k]).join("; ");
  const budgetFeel = places.map(k => BUDGETS[k]).join(", ");
  const prompt =
`Plan a ${days}-day trip for ${who} visiting: ${list}.

Trip character: slow, restorative travel. Nature and quiet over shopping and nightlife.
Route logic: group geographically, do not zigzag across the planet twice. Suggest a sensible order and, if two places need a long flight between them, say so in that day's plan.

Reply ONLY with minified JSON:
{"days":[{"day":1,"title":"short title","plan":"2-3 sentences: what to do, one kid-friendly note, one practical note (transport, booking, weather)"}],"budget":"one sentence: which legs cost the most and the total feel for a mid-range ${who}, given these destinations are ${budgetFeel}"}`;

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
        max_tokens: 1600,
        temperature: 0.5,
      }),
    });
    if (!r.ok) return json(502, { error: "The planner is busy. Try again in a moment." }, cors);
    const data = await r.json();
    const text = (data.choices?.[0]?.message?.content || "").trim();
    const m = text.match(/\{[\s\S]*\}/);
    const parsed = m ? JSON.parse(m[0]) : null;
    if (!parsed || !Array.isArray(parsed.days)) {
      return json(502, { error: "The planner gave up. Try fewer places or days." }, cors);
    }
    const outDays = parsed.days.slice(0, days).map((d, i) => ({
      day: i + 1,
      title: String(d.title || "").slice(0, 80),
      plan: String(d.plan || "").slice(0, 700),
    }));
    return json(200, { days: outDays, budget: String(parsed.budget || "").slice(0, 400) }, cors);
  } catch {
    return json(502, { error: "The planner is busy. Try again in a moment." }, cors);
  }
};

function json(status, obj, cors) {
  return { statusCode: status, headers: { ...cors, "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}
