// Netlify function: POST /api/ask { question, context: {place, section} }
// The floating journey assistant. OpenRouter free models, key stays server-side.
// Injects curated place data so answers are grounded in the site's own facts.

const { logAdmin } = require("./_log.js");
const kb = require("./_kb.js");

// Full destination knowledge base projected for AI prompts (featured + city
// entries) — same facts the site serves, no hand-maintained copy.
const ALL_PLACES = kb.featured().concat(
  kb.all() && Object.values(kb.all())
    .filter(e => e.kind === "city")
    .map(e => kb.get(e.key))
    .filter(Boolean)
);
const PLACE_DATA = Object.fromEntries(ALL_PLACES.map(e => [e.key, e]));
const PLACE_NAMES = ALL_PLACES.map(p => p.name);

// Tag/topic → human phrase, for the fallback engine and prompt hints.
const TAG_HINTS = {
  camping: "camping", beach: "beach", foodie: "food", mountain: "mountains",
  hiking: "hiking", stargazing: "stargazing", wildlife: "wildlife",
  romantic: "romantic getaways", quiet: "quiet spots", adventure: "adventure",
  surf: "surfing", dive: "diving", culture: "culture",
};

function tagMatches(s) {
  return Object.keys(TAG_HINTS).filter(t => s.includes(t));
}

// Places the assistant is recommending in this reply, for photo cards in the
// widget: ones actually named in the AI text, else the tag matches, else the
// place whose card the visitor is reading. Max 3, each with an image if one
// exists on the site.
function buildPicks(text, detectedKey, tags) {
  const s = (text || "").toLowerCase();
  const named = ALL_PLACES.filter(p =>
    p.key !== detectedKey && (s.includes(String(p.name || "").toLowerCase()) ||
      s.includes(String(p.key || "").replace(/-/g, " ")))
  );
  const ordered = [];
  const push = (p) => { if (p && !ordered.find(o => o.key === p.key) && ordered.length < 3) ordered.push(p); };
  if (detectedKey) push(PLACE_DATA[detectedKey]);
  named.forEach(push);
  if (ordered.length < 3) {
    for (const t of tags || []) {
      for (const p of ALL_PLACES) {
        if ((p.tags || []).includes(t)) push(p);
        if (ordered.length >= 3) break;
      }
      if (ordered.length >= 3) break;
    }
  }
  return ordered.map(p => ({
    key: p.key, name: p.name, country: p.country || "", flag: p.flag || "",
    image: p.image || null,
    tagline: p.bestMonths ? String(p.bestMonths).split(/[,.;]/)[0].trim() : "",
    daily_mid: p.daily_mid || null,
  }));
}

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
    return json(200, { answer: local, picks: buildPicks(local, placeKey, tagMatches(question.toLowerCase())), engine: "site-data" }, cors);
  }

  const placeBlock = placeKey
    ? `The visitor is looking at ${PLACE_DATA[placeKey].name}. Curated facts you may use: best view: ${PLACE_DATA[placeKey].bestView}; best months: ${PLACE_DATA[placeKey].bestMonths}; crowds: ${PLACE_DATA[placeKey].crowd}; with kids: ${PLACE_DATA[placeKey].kid}; local USD prices: ${PLACE_DATA[placeKey].prices}.`
    : `The site covers ${ALL_PLACES.length} destinations. Featured (deepest data): ${ALL_PLACES.filter(p => p.kind === "featured").map(p => p.name).join("; ")}. Others include ${PLACE_NAMES.filter(n => !["Faroe Islands","Iceland","Kyoto","Lofoten","Na Pali Coast","Wadi Rum","Whitehaven Beach","Yasawa Islands"].includes(n)).slice(0, 12).join(", ")}, and more. Tag topics you can match: ${Object.keys(TAG_HINTS).join(", ")}. When the visitor wants a vibe or activity (camping, beach, food...), recommend the best-matching destinations by tag.`;

  const tripBlock = hasTrip
    ? `\nThe visitor has a planned trip on this site: ${trip.days} days for ${trip.who || "their group"}, visiting ${trip.places.join("; ")}. Budget feel: ${trip.budget || "not set"}. Answer with THIS trip in mind — use their places, group and day count when relevant; do not suggest other destinations unless they ask.`
    : "";

  // Ground the AI with the actual matching entries for any detected vibe/tag.
  const tags = tagMatches(question.toLowerCase());
  const tagBlock = tags.length
    ? `\nDestinations tagged "${tags.join('" or "')}": ${tags.map(t =>
        ALL_PLACES.filter(p => (p.tags || []).includes(t)).map(p => `${p.name} (${p.country}) — ${p.bestMonths}. Prices per day: mid $${p.daily_mid || "?"}${p.prices && p.prices.campsite ? `, campsite $${p.prices.campsite}` : ""}.`).join("; ")
      ).join(" | ")}. Recommend from these unless they fit poorly.`
    : "";

  const prompt =
`You are Relaxagent, the trip guide of relaxdayoff.com ("Relax Day Off"), a travel site about the world's quietest places. Your name is Relaxagent. When asked who you are, say you are Relaxagent, the day-off planner of relaxdayoff.com. A visitor asks: "${question}"

${placeBlock}
${tripBlock}${tagBlock}
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
        if (!r.ok) return json(200, { answer: localAnswer(question, placeKey), picks: buildPicks(localAnswer(question, placeKey), placeKey, tags), engine: "site-data-fallback" }, cors);
    const data = await r.json();
    const text = (data.choices?.[0]?.message?.content || "").trim();
    if (!text) return json(200, { answer: localAnswer(question, placeKey), picks: buildPicks(localAnswer(question, placeKey), placeKey, tags), engine: "site-data-fallback" }, cors);
    return json(200, { answer: text.slice(0, 900), picks: buildPicks(text, placeKey, tags), engine: "ai" }, cors);
  } catch {
    const local = localAnswer(question, placeKey);
    return json(200, { answer: local, picks: buildPicks(local, placeKey, tags), engine: "site-data-fallback" }, cors);
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
  const ALL_NAMES = ALL_PLACES.map(p => p.name).join("; ");

  const has = (...words) => words.some(w => s.includes(w));

  // topic: who/what are you
  if (has("who are you", "your name", "what are you"))
    return "I'm Relaxagent, the day-off guide of relaxdayoff.com. I know every place on this site - featured spots like Iceland, Kyoto and Wadi Rum, plus 20+ more cities and islands. Ask me about any of them.";

  // topic: vibe / activity match — "camping place", "beach vibe", "foodie city"
  const tags = tagMatches(s);
  if (tags.length) {
    const matches = [];
    for (const t of tags) for (const p of ALL_PLACES) {
      if ((p.tags || []).includes(t) && !matches.includes(p)) matches.push(p);
    }
    if (matches.length) {
      const top = matches.slice(0, 4).map(p => {
        const campsite = p.prices && p.prices.campsite ? `, campsites about $${p.prices.campsite} a night` : "";
        return `${p.name} (${p.country}) - ${p.bestMonths}${campsite}`;
      });
      return `For ${tags.map(t => TAG_HINTS[t]).join(" and ")}: ${top.join("; ")}. ${place ? `${place.name} fits too - ask me about it for details.` : "Ask me about any of them for views, crowds or visas."}`;
    }
  }

  // topic: country mentioned but no place matched (e.g. "japan", "canada")
  if (!place) {
    const byCountry = ALL_PLACES.find(p => s.includes(String(p.country || "").toLowerCase()));
    if (byCountry) { place = byCountry; placeKey = byCountry.key; }
  }
  if (!place) {
    for (const [id, p] of Object.entries(PLACE_DATA)) {
      const nameWords = p.name.toLowerCase().replace(/[(),]/g, "").split(" ");
      if (nameWords.some(w => w.length > 4 && s.includes(w)) || s.includes(p.name.toLowerCase().split(",")[0])) {
        place = p; placeKey = id; break;
      }
    }
  }
  if (!place && placeKey && PLACE_DATA[placeKey]) place = PLACE_DATA[placeKey];

  // topic: visa / documents / passport
  if (has("visa", "passport", "document", "paperwork", "entry")) {
    if (place) {
      const v = VISA[placeKey] || (place.visa ? place.visa : "Check the official source linked on the destination's Documents section.");
      return `${v} Pack: passport valid 6+ months, proof of onward ticket, and travel insurance. The Documents & visas section below the planner builds you a full checklist.`;
    }
    return `Visa rules depend on your passport and destination. Our Documents & visas section lists the rules for all featured places with official-source links - and the checklist generator builds your list automatically.`;
  }

  // topic: price / cost / budget
  if (has("price", "cost", "expensive", "budget", "cheap", "afford", "much")) {
    if (place) {
      const pr = PRICES[placeKey] || (place.daily_mid ? `mid-range ~$${place.daily_mid}/day` : "see the price table on its card");
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
      return `${place.name}: ${SEASONS[placeKey] || place.bestMonths || "check the When to go panel on its card"} Live weather for every place is on its card in the planner.`;
    }
    return `Every destination card has a live 5-day forecast plus the best months to go. Tell me a place and I'll give you its season.`;
  }

  // topic: kids / family
  if (has("kid", "child", "family", "baby", "toddler", "son", "daughter", "-year-old", "years old", "young")) {
    if (place) return `${place.name} with kids: ${place.kid || "family-friendly with easy trails and calm activities"}. The planner's Kid picks list specific activities per place.`;
    return `Most places on the site work with kids - Fiji and Kyoto are the easiest (warm water, temples to count). Each destination card lists age notes and kid picks.`;
  }

  // topic: view
  if (has("view", "photo", "lookout", "sunset", "see")) {
    if (place) return `Best view at ${place.name}: ${place.bestView || "named on its card"}`;
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
    return `${place.name}: best view - ${place.bestView || "on its card"}. Best months - ${place.bestMonths}. Prices: ${PRICES[placeKey] || (place.daily_mid ? `mid-range ~$${place.daily_mid}/day` : "on its card")}. Ask me about visa, kids, crowds or weather for details.`;
  }

  // default: overview of what Relaxagent can do
  return `I can help with every place on this site - the eight featured spots (Iceland, Kyoto, Wadi Rum and more) plus 20+ cities and islands. Ask about views, seasons, crowds, prices, camping, beaches, documents, or what works with kids. Name a place or tell me how you want to feel, and I'll point you somewhere.`;
}

function json(status, obj, cors) {
  return { statusCode: status, headers: { ...cors, "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}
