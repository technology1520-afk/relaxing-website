// Netlify function: POST /api/plan { days, who, places: [keys] }
// Returns { days: [{day, title, plan}], budget } using OpenRouter free models.
// The API key never reaches the browser.

const { logAdmin } = require("./_log.js");

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

  const key = process.env.AI_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!key) return json(503, { error: "The planner is warming up. Add AI_API_KEY in your deploy settings." }, cors);

  const list = places.map(k => NAMES[k]).join("; ");
  const budgetFeel = places.map(k => BUDGETS[k]).join(", ");
  const prompt =
`Plan a ${days}-day trip for ${who} visiting: ${list}.

Trip character: slow, restorative travel. Nature and quiet over shopping and nightlife.
Route logic: group geographically, do not zigzag across the planet twice. Suggest a sensible order and, if two places need a long flight between them, say so in that day's plan.

Reply ONLY with minified JSON:
{"days":[{"day":1,"title":"short title","plan":"2-3 sentences: what to do, one kid-friendly note, one practical note (transport, booking, weather)"}],"budget":"one sentence: which legs cost the most and the total feel for a mid-range ${who}, given these destinations are ${budgetFeel}"}
Keep each "plan" under 45 words and the whole reply under 900 tokens.`;

  try {
    // Netlify sync functions die at ~30s with a gateway timeout, so cap the AI
    // call well inside it and fall back to a deterministic itinerary.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    let r;
    try {
      r = await fetch(`${process.env.AI_BASE_URL || "https://api.xkiro.com/v1"}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.SITE_URL || "https://relaxdayoff.com",
          "X-Title": "Relax Day Off",
        },
        body: JSON.stringify({
          model: process.env.AI_MODEL || "openai/gpt-6-luna",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 900,
          temperature: 0.5,
        }),
        signal: ctrl.signal,
      });
    } finally { clearTimeout(timer); }
    if (!r.ok) return json(200, fallbackPlan(days, who, places), cors);
    const data = await r.json();
    const text = (data.choices?.[0]?.message?.content || "").trim();
    const m = text.match(/\{[\s\S]*\}/);
    let parsed = null;
    try { parsed = m ? JSON.parse(m[0]) : null; } catch { parsed = null; }
    if (!parsed || !Array.isArray(parsed.days) || !parsed.days.length) {
      return json(200, fallbackPlan(days, who, places), cors);
    }
    const outDays = parsed.days.slice(0, days).map((d, i) => ({
      day: i + 1,
      title: String(d.title || "").slice(0, 80),
      plan: String(d.plan || "").slice(0, 700),
    }));
    await logAdmin("trip", { at: Date.now(), days: outDays.length, who: who.slice(0, 60), places: places.map(k => NAMES[k]), budget: String(parsed.budget || "").slice(0, 120) });
    return json(200, { days: outDays, budget: String(parsed.budget || "").slice(0, 400) }, cors);
  } catch {
    return json(200, fallbackPlan(days, who, places), cors);
  }
};

// Deterministic no-AI itinerary: always returns within the gateway window.
// Same response shape as the AI path, so the frontend needs no special casing.
function fallbackPlan(days, who, places) {
  const NOTES = {
    iceland: "Book lagoon entry ahead; layers and a waterproof shell matter more than the forecast app suggests.",
    lofoten: "Rent a car — the villages are spread out; groceries close early in the shoulder season.",
    faroe: "Hire a car and check the tunnel tolls; weather can close mountain roads without warning.",
    whitehaven: "Book the boat tour at least a day ahead; tide times decide whether the inlet swirls show.",
    napali: "Kalalau viewpoints need an early start; seasickness tablets if you take the boat option.",
    wadirum: "Go with a licensed Bedouin camp; nights are cold even when days are scorching.",
    yasawa: "Island transfers run on island time — confirm your boat the evening before.",
    kyoto: "Temples quiet out after 4pm; carry cash, lots of small places don't take cards.",
  };
  const BUDGET_LINES = {
    "very expensive": "expect $250-400 a day mid-range before flights",
    expensive: "expect $150-300 a day mid-range before flights",
    moderate: "expect $70-150 a day mid-range before flights",
  };
  const names = places.map(k => NAMES[k]);
  const feel = places.map(k => BUDGETS[k]).join(", ");
  const out = [];
  for (let i = 0; i < days; i++) {
    const name = names[i % names.length];
    const first = i < names.length;
    out.push({
      day: i + 1,
      title: first ? `${name.split(",")[0]} at ease` : `${name.split(",")[0]}, slower`,
      plan: `A gentle day in ${name}: one unhurried highlight in the morning, a long lunch, then free wandering. ${NOTES[places[i % places.length]]} ${first ? "" : "Revisit yesterday's favourite spot if the weather turns."}`,
    });
  }
  return {
    days: out,
    budget: `Rough guide: these destinations feel ${feel} — for ${who}, ${BUDGET_LINES[BUDGETS[places[0]]]}. (Offline plan — Relaxagent was briefly unavailable; try planning again later for a richer itinerary.)`,
    engine: "fallback",
  };
}

function json(status, obj, cors) {
  return { statusCode: status, headers: { ...cors, "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}
