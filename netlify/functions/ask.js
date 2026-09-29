// Netlify function: POST /api/ask { question, context: {place, section} }
// The floating journey assistant. OpenRouter free models, key stays server-side.
// Injects curated place data so answers are grounded in the site's own facts.

const { logAdmin } = require("./_log.js");
const kb = require("./_kb.js");

// Featured places projected from the destination knowledge base (data/kb/*.json)
// — same facts the site serves, no hand-maintained copy.
const PLACE_DATA = Object.fromEntries(
  kb.featured().map(e => [e.key, e])
);


exports.handler = async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors };

  let body = {};
  try { body = JSON.parse(req.body || "{}"); } catch {}
  const question = String(body.question || "").slice(0, 500).trim();
  if (!question) return json(400, { error: "Ask me something about the trip." }, cors);
  const ctx = body.context || {};
  await logAdmin("ask", { q: question.slice(0, 80), place: ctx.place || null });
  let placeKey = PLACE_DATA[ctx.place] ? ctx.place : null;
  const section = String(ctx.section || "").slice(0, 60);

  // Trip memory: the visitor's planned trip (if any) grounds every answer.
  const trip = ctx.trip && typeof ctx.trip === "object" ? {
    who: String(ctx.trip.who || "").slice(0, 100),
    days: Math.min(21, Math.max(1, parseInt(ctx.trip.days) || 0)),
    places: Array.isArray(ctx.trip.places) ? ctx.trip.places.slice(0, 8).map(p => String(p).slice(0, 60)) : [],
    budget: String(ctx.trip.budget || "").slice(0, 120),
  } : null;
  const hasTrip = trip && trip.places.length > 0;

  const key = process.env.AI_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!key) {
    // No key configured: answer from the site's own data. Relaxagent never goes silent.
    const local = localAnswer(question, placeKey);
    return json(200, { answer: local, engine: "site-data" }, cors);
  }

  const placeBlock = placeKey
    ? `The visitor is looking at ${PLACE_DATA[placeKey].name}. Curated facts you may use: best view: ${PLACE_DATA[placeKey].bestView}; best months: ${PLACE_DATA[placeKey].bestMonths}; crowds: ${PLACE_DATA[placeKey].crowd}; with kids: ${PLACE_DATA[placeKey].kid}; local USD prices: ${PLACE_DATA[placeKey].prices}.`
    : `The site covers 8 quiet destinations: ${Object.values(PLACE_DATA).map(p => p.name).join("; ")}. Local USD prices per place are in the site data.`;

  const tripBlock = hasTrip
    ? `\nThe visitor has a planned trip on this site: ${trip.days} days for ${trip.who || "their group"}, visiting ${trip.places.join("; ")}. Budget feel: ${trip.budget || "not set"}. Answer with THIS trip in mind — use their places, group and day count when relevant; do not suggest other destinations unless they ask.`
    : "";

  const prompt =
`You are Relaxagent, the trip guide of relaxdayoff.com ("Relax Day Off"), a travel site about the world's quietest places. Your name is Relaxagent. When asked who you are, say you are Relaxagent, the day-off planner of relaxdayoff.com. A visitor asks: "${question}"

${placeBlock}
${tripBlock}
${section ? `They are currently in the site's "${section}" section.` : ""}

After answering their question, if they mention a specific place or seem unsure about preparation, add one short sentence pointing them to what to prepare (visa type, insurance, permits) and the site's Documents & visas section.

Answer in 2-4 short sentences, warm and concrete. Use the curated facts where they fit; if the question goes beyond them (visas, flights from a specific city), answer from general knowledge and say what to double-check with official sources. Never invent exact prices beyond the curated ones. No exclamation marks. Plain text only.`;

  try {
    const r = await fetch(`${process.env.AI_BASE_URL || "https://api.xkiro.com/v1"}/chat/completions`, {
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
        max_tokens: 300,
        temperature: 0.5,
      }),
    });
        if (!r.ok) return json(200, { answer: localAnswer(question, placeKey), engine: "site-data-fallback" }, cors);
    const data = await r.json();
    const text = (data.choices?.[0]?.message?.content || "").trim();
    if (!text) return json(200, { answer: localAnswer(question, placeKey), engine: "site-data-fallback" }, cors);
    return json(200, { answer: text.slice(0, 900), engine: "ai" }, cors);
  } catch {
    return json(200, { answer: localAnswer(question, placeKey), engine: "site-data-fallback" }, cors);
  }
}

// ---- Local answer engine: answers from the site's curated data, no API key ----
// Matches question topics (weather/price/view/kids/visa/documents/when/agency...)
// against destination facts and produces complete answers.
function localAnswer(q, placeKey) {
  const s = q.toLowerCase();
  const pick = (id) => PLACE_DATA[id];

  // Any destination mentioned by name?
  let place = placeKey ? PLACE_DATA[placeKey] : null;
  if (!place) {
    for (const [id, p] of Object.entries(PLACE_DATA)) {
      const nameWords = p.name.toLowerCase().replace(/[(),]/g, "").split(" ");
      if (nameWords.some(w => w.length > 4 && s.includes(w)) || s.includes(p.name.toLowerCase().split(",")[0])) {
        place = p; placeKey = id; break;
      }
    }
  }
  if (!place && placeKey && PLACE_DATA[placeKey]) place = PLACE_DATA[placeKey];

  const VISA = {
    iceland: "Schengen rules: 90 days in any 180 for visa-free passports; others need a Schengen visa.",
    lofoten: "Norway/Schengen rules: 90 days in any 180 for visa-free passports.",
    faroe: "Danish realm: some Schengen visas must be marked 'valid for Faroe Islands'. Check before booking.",
    whitehaven: "Australia: nearly everyone needs an ETA or eVisitor in advance - apply online before booking flights.",
    napali: "USA (Hawaii): ESTA for visa-waiver countries, 72h+ before flying; others need a B-2 visa interview.",
    wadirum: "Jordan: visa on arrival for most (~40 JOD), or free with a Jordan Pass bought in advance.",
    yasawa: "Fiji: visa-free for most Western nationals, 4 months on arrival.",
    kyoto: "Japan: visa-free 90 days for ~70 nationalities; eVisa available for others.",
  };
  const PRICES = {
    iceland: "mid-range day ~$395, budget day ~$220", lofoten: "mid-range day ~$330, budget ~$180",
    faroe: "mid-range ~$290/day", whitehaven: "mid-range ~$300/day", napali: "mid-range ~$370/day",
    wadirum: "mid-range ~$130/day, budget ~$80", yasawa: "mid-range ~$160/day, budget ~$90",
    kyoto: "mid-range ~$180/day, budget ~$90",
  };
  const ALL_NAMES = Object.values(PLACE_DATA).map(p => p.name).join("; ");

  const has = (...words) => words.some(w => s.includes(w));

  // topic: who/what are you
  if (has("who are you", "your name", "what are you"))
    return "I'm Relaxagent, the day-off guide of relaxdayoff.com. I know the eight quiet places on this site: their views, seasons, prices and paperwork. Ask me anything about them.";

  // topic: visa / documents / passport
  if (has("visa", "passport", "document", "paperwork", "entry")) {
    if (place) {
      const v = VISA[placeKey] || "Check the official source linked on the destination's Documents section.";
      return `${v} Pack: passport valid 6+ months, proof of onward ticket, and travel insurance. The Documents & visas section below the planner builds you a full checklist.`;
    }
    return `Visa rules depend on your passport and destination. Our Documents & visas section lists the rules for all eight places with official-source links - and the checklist generator builds your list automatically.`;
  }

  // topic: price / cost / budget
  if (has("price", "cost", "expensive", "budget", "cheap", "afford", "much")) {
    if (place) {
      const pr = PRICES[placeKey] || "see the price table on its card";
      return `${place.name}: ${pr} for a mid-range traveller. The World Explorer section breaks every item down - meals, hotels, taxis - and the fair-price checker tests any quote you get.`;
    }
    return `Daily mid-range budgets run from about $90 (Fiji, Hoi An, Pokhara) to $395 (Reykjavik). The World Explorer has full price tables for every city - and a search box that filters by budget.`;
  }

  // topic: weather / when to go / season
  if (has("weather", "when", "season", "month", "rain", "hot", "cold", "climate")) {
    if (place) {
      const SEASONS = {
        iceland: "Jun-Aug for midnight sun and hiking; Sep-Mar for northern lights. Always bring layers.",
        lofoten: "Jun-Jul midnight sun; Sep for aurora without crowds. Winter is dramatic but icy.",
        faroe: "May-Aug is mildest, but expect four seasons in a day. Rain is normal - pack a shell.",
        whitehaven: "May-Oct: dry, 24C, stinger-free swimming.",
        napali: "May-Sep has calm seas for boat tours; winter closes the coast.",
        wadirum: "Mar-May and Sep-Nov. Summer passes 40C. Nights are cold year-round.",
        yasawa: "May-Oct: dry, 26C, calm reef water.",
        kyoto: "Late Mar-Apr cherry blossom; Nov maple fire. Jun is rainy and quiet.",
      };
      return `${place.name}: ${SEASONS[placeKey] || "check the When to go panel on its card"} Live weather for every place is on its card in the planner.`;
    }
    return `Every destination card has a live 5-day forecast plus the best months to go. Tell me a place and I'll give you its season.`;
  }

  // topic: kids / family
  if (has("kid", "child", "family", "baby", "toddler", "son", "daughter", "-year-old", "years old", "young")) {
    if (place) return `${place.name} with kids: ${place.kid}. The planner's Kid picks list specific activities per place.`;
    return `All eight places work with kids - Fiji and Kyoto are the easiest (warm water, temples to count), Reykjavik needs older kids for the lagoon depth. Each destination card lists age notes and kid picks.`;
  }

  // topic: view
  if (has("view", "photo", "lookout", "sunset", "see")) {
    if (place) return `Best view at ${place.name}: ${place.bestView}`;
    return `Each destination card names its single best view and the exact time to be there - from Reinebringen at 23:00 in June to Oia's free sunset.`;
  }

  // topic: crowd / busy / quiet
  if (has("crowd", "busy", "quiet", "tourist", "people")) {
    if (place) return `Crowds at ${place.name}: ${place.crowd}`;
    return `Every destination card has a Crowds section naming the exact hours to avoid and the quiet loophole.`;
  }

  // topic: suggestion - what should I do / where to go
  if (has("where should", "suggest", "recommend", "which place", "what place", "don't know", "dont know", "first time")) {
    return `Tell me one true sentence about your week - tired, restless, dreamy - or try the World Explorer search box: type "quiet beach" or "foodie city under 100 a day" and it will match you. The calm finder does this too, with the globe.`;
  }

  // place mentioned but no topic: give an overview
  if (place) {
    return `${place.name}: best view - ${place.bestView}. Best months - ${place.bestMonths}. Prices: ${PRICES[placeKey] || "on its card"}. Ask me about visa, kids, crowds or weather for details.`;
  }

  // default: overview of what Relaxagent can do
  return `I can help with all eight quiet places on this site - views, seasons, crowds, prices, documents, and what works with kids. Name a place (Iceland, Kyoto, Wadi Rum...) or tell me how you want to feel, and I'll point you somewhere.`;
}

function json(status, obj, cors) {
  return { statusCode: status, headers: { ...cors, "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}
