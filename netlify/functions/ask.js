// Netlify function: POST /api/ask { question, context: {place, section} }
// The floating journey assistant. OpenRouter free models, key stays server-side.
// Injects curated place data so answers are grounded in the site's own facts.

const { logAdmin } = require("./_log.js");

const PLACE_DATA = {
  iceland: { name: "Blue Lagoon, Iceland", lat: 63.88, lng: -22.45, bestMonths: "June-Aug light, Feb-Apr northern lights",
    prices: "meal $28, coffee $5.5, taxi $22, hotel $240, lagoon entry $65", crowd: "busy 11:00-16:00, book first/last slot",
    kid: "kids 8+, water 38C", view: "north edge at sunset, steam over water, Mt Thorbjorn behind" },
  lofoten: { name: "Reine, Lofoten, Norway", lat: 67.93, lng: 13.09, bestMonths: "June-July midnight sun, Sept aurora",
    prices: "meal $24, coffee $5, taxi $18, hotel $185, Reinebringen free", crowd: "steps queue midday, village empties 18:00",
    kid: "kayak, troll-fjord boats, midnight beach", view: "Reinebringen summit, 1971 steps, best at 23:00 in June" },
  faroe: { name: "Sørvágsvatn, Faroe Islands", lat: 62.06, lng: -7.35, bestMonths: "May-Aug, 4 seasons any day",
    prices: "meal $26, coffee $5, taxi $16, hotel $150, trail fee $20", crowd: "800 hikers/day in summer, go before 10:00",
    kid: "puffins at Mykines, grass-roof villages", view: "Traelanipa cliff, lake above ocean, stand 200m back" },
  whitehaven: { name: "Hill Inlet, Whitsundays, Australia", lat: -20.28, lng: 149.05, bestMonths: "May-Oct dry, 24C, stinger-free",
    prices: "meal $18, coffee $4.5, taxi $14, hotel $190, boat day-trip $120", crowd: "boats 09:30-14:00, sailing trips after 15:00 empty",
    kid: "shallow warm lagoon, squeaky sand", view: "Hill Inlet lookout at mid-tide, sharpest swirls" },
  napali: { name: "Nāpali Coast, Kauai, Hawaii", lat: 22.17, lng: -159.60, bestMonths: "May-Sep calm seas, winter closes boats",
    prices: "meal $22, coffee $5, taxi $15, hotel $320, boat tour $140", crowd: "Kalalau permits sell out months ahead; boat tours are the quiet loophole",
    kid: "boat from age 5, turtle snorkel stops", view: "sunset catamaran past the cliffs, or Puu O Kila lookout" },
  wadirum: { name: "Wadi Rum, Jordan", lat: 29.58, lng: 35.42, bestMonths: "Mar-May, Sep-Nov; summer 40C+",
    prices: "meal $8, coffee $1.5, taxi $6, camp $90, jeep tour $20-40pp", crowd: "tours bunch at rock bridges 16:00-18:00, overnight camps empty after 19:00",
    kid: "camels, sandboarding, stargazing, Bedouin camp", view: "Um Frouth rock bridge 30 min before sunset" },
  yasawa: { name: "Naviti Island, Fiji", lat: -17.42, lng: 177.19, bestMonths: "May-Oct dry, 26C",
    prices: "meal $10, coffee $2.5, taxi $5, resort $130 incl meals, caves $15", crowd: "day-trips at Sawa-i-Lau caves mid-morning, villages empty all day",
    kid: "hermit crab races, warm water, village visits", view: "north end at low tide, walkable reef flat" },
  kyoto: { name: "Ryōan-ji, Kyoto, Japan", lat: 35.03, lng: 135.72, bestMonths: "late Mar-Apr blossom, Nov maple",
    prices: "meal $9, coffee $4, taxi $12, hotel $110, temple $5", crowd: "buses 10:00-14:00, at 08:00 you hear the gravel",
    kid: "count-the-stones challenge, monkey park, trains", view: "hojo veranda far right end, arrive 08:00" },
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
  const question = String(body.question || "").slice(0, 500).trim();
  if (!question) return json(400, { error: "Ask me something about the trip." }, cors);
  const ctx = body.context || {};
  await logAdmin("ask", { q: question.slice(0, 80), place: ctx.place || null });
  const placeKey = PLACE_DATA[ctx.place] ? ctx.place : null;
  const section = String(ctx.section || "").slice(0, 60);

  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return json(503, {
    error: "The assistant needs OPENROUTER_API_KEY in the deploy settings (free key at openrouter.ai/keys). Until then it cannot answer.",
    fallback: fallbackAnswer(question, placeKey),
  }, cors);

  const placeBlock = placeKey
    ? `The visitor is looking at ${PLACE_DATA[placeKey].name}. Curated facts you may use: view: ${PLACE_DATA[placeKey].view}; best months: ${PLACE_DATA[placeKey].bestMonths}; crowds: ${PLACE_DATA[placeKey].crowd}; with kids: ${PLACE_DATA[placeKey].kid}; local USD prices: ${PLACE_DATA[placeKey].prices}.`
    : `The site covers 8 quiet destinations: ${Object.values(PLACE_DATA).map(p => p.name).join("; ")}. Local USD prices per place are in the site data.`;

  const prompt =
`You are Dayo, the trip guide of relaxdayoff.com, a travel site about the world's quietest places. Your name is Dayo (like "day off"). When asked who you are, say you are Dayo. A visitor asks: "${question}"

${placeBlock}
${section ? `They are currently in the site's "${section}" section.` : ""}

Answer in 2-4 short sentences, warm and concrete. Use the curated facts where they fit; if the question goes beyond them (visas, flights from a specific city), answer from general knowledge and say what to double-check. Never invent exact prices beyond the curated ones. No exclamation marks. Plain text only.`;

  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.SITE_URL || "https://relaxdayoff.com",
        "X-Title": "Stillwater",
      },
      body: JSON.stringify({
        model: "openrouter/free",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300,
        temperature: 0.5,
      }),
    });
    if (!r.ok) return json(502, { error: "Dayo is busy. Try again in a moment." }, cors);
    const data = await r.json();
    const text = (data.choices?.[0]?.message?.content || "").trim();
    if (!text) return json(502, { error: "Dayo is busy. Try again in a moment." }, cors);
    return json(200, { answer: text.slice(0, 900) }, cors);
  } catch {
    return json(502, { error: "Dayo is busy. Try again in a moment." }, cors);
  }
};

// Works with zero API key for the most common questions.
function fallbackAnswer(q, placeKey) {
  const s = q.toLowerCase();
  if (placeKey) {
    const p = PLACE_DATA[placeKey];
    if (s.includes("weather") || s.includes("rain") || s.includes("hot") || s.includes("cold"))
      return { answer: `Use the live weather panel on ${p.name}'s card above. Best months: ${p.bestMonths}.` };
    if (s.includes("price") || s.includes("cost") || s.includes("expensive"))
      return { answer: `${p.name} typical USD prices: ${p.prices}. Use the fair-price checker on the card to test any quote you get.` };
    if (s.includes("view"))
      return { answer: `Best view at ${p.name}: ${p.view}.` };
    if (s.includes("crowd") || s.includes("busy") || s.includes("quiet"))
      return { answer: `Crowds at ${p.name}: ${p.crowd}.` };
    if (s.includes("kid") || s.includes("child") || s.includes("family"))
      return { answer: `With kids at ${p.name}: ${p.kid}.` };
  }
  return null;
}

function json(status, obj, cors) {
  return { statusCode: status, headers: { ...cors, "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}
