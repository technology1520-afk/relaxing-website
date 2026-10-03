// Netlify function: POST /api/plan { days, who, places: [keys], tier }
// tier: budget | mid | premium — shapes the daily plan and cost framing.
// Returns { days: [{day, title, plan}], budget, tier } using OpenRouter free models.
// The API key never reaches the browser.

const { logAdmin } = require("./_log.js");

const TIERS = {
  budget: {
    label: "budget",
    guidance: "Budget tier: hostels/guesthouses or budget hotels, street food and local eateries, public transport, free or cheap activities. Name the money-saving choice in each day's plan where relevant.",
  },
  mid: {
    label: "mid-range",
    guidance: "Mid-range tier: comfortable 3-4 star hotels, a mix of local and mid-range restaurants, one paid tour or activity per day, taxis where sensible.",
  },
  premium: {
    label: "premium",
    guidance: "Premium tier: design hotels or luxury resorts, private transfers, fine dining or the best table in town, private guides and skip-the-line access. Mention the splurge-worthy pick per day.",
  },
};

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
  const tier = TIERS[body.tier] ? body.tier : "mid";
  const T = TIERS[tier];

  const key = process.env.AI_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!key) return json(503, { error: "The planner is warming up. Add AI_API_KEY in your deploy settings." }, cors);

  const list = places.map(k => NAMES[k]).join("; ");
  const budgetFeel = places.map(k => BUDGETS[k]).join(", ");
  const prompt =
`Plan a ${days}-day ${T.label} trip for ${who} visiting: ${list}.

${T.guidance}
Trip character: slow, restorative travel. Nature and quiet over shopping and nightlife.
Route logic: group geographically, do not zigzag across the planet twice. Suggest a sensible order and, if two places need a long flight between them, say so in that day's plan.

Reply ONLY with minified JSON:
{"days":[{"day":1,"title":"short title","plan":"2-3 sentences at ${T.label} level: what to do, one kid-friendly note, one practical note (transport, booking, weather)"}],"budget":"one sentence: which legs cost the most and the total ${T.label} feel for ${who}, given these destinations are ${budgetFeel}"}
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
          "User-Agent": "RelaxDayOff/1.0 (+https://relaxdayoff.com)",
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
    if (!r.ok) return json(200, fallbackPlan(days, who, places, tier), cors);
    const data = await r.json();
    const text = (data.choices?.[0]?.message?.content || "").trim();
    const m = text.match(/\{[\s\S]*\}/);
    let parsed = null;
    try { parsed = m ? JSON.parse(m[0]) : null; } catch { parsed = null; }
    if (!parsed || !Array.isArray(parsed.days) || !parsed.days.length) {
      return json(200, fallbackPlan(days, who, places, tier), cors);
    }
    const outDays = parsed.days.slice(0, days).map((d, i) => ({
      day: i + 1,
      title: String(d.title || "").slice(0, 80),
      plan: String(d.plan || "").slice(0, 700),
    }));
    await logAdmin("trip", { at: Date.now(), days: outDays.length, who: who.slice(0, 60), places: places.map(k => NAMES[k]), budget: String(parsed.budget || "").slice(0, 120), tier });
    return json(200, { days: outDays, budget: String(parsed.budget || "").slice(0, 400), tier }, cors);
  } catch {
    return json(200, fallbackPlan(days, who, places, tier), cors);
  }
};

// Deterministic no-AI itinerary: always returns within the gateway window.
// Same response shape as the AI path, so the frontend needs no special casing.
function fallbackPlan(days, who, places, tier = "mid") {
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
  const TIER_NOTES = {
    budget: "Keep it cheap: guesthouses, street food, public transport, one paid activity.",
    mid: "Comfortable mid-range: 3-4 star stays, a mix of eateries, one tour a day.",
    premium: "Premium: design hotels, private transfers, the best table in town, private guides.",
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
      plan: `A gentle day in ${name}: one unhurried highlight in the morning, a long lunch, then free wandering. ${NOTES[places[i % places.length]]} ${TIER_NOTES[tier]} ${first ? "" : "Revisit yesterday's favourite spot if the weather turns."}`,
    });
  }
  return {
    days: out,
    budget: `Rough guide: these destinations feel ${feel} — for ${who}, ${BUDGET_LINES[BUDGETS[places[0]]]}. (Offline plan — Relaxagent was briefly unavailable; try planning again later for a richer itinerary.)`,
    tier,
    engine: "fallback",
  };
}

function json(status, obj, cors) {
  return { statusCode: status, headers: { ...cors, "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}
