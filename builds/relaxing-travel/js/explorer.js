// World Explorer: vibe search + world price tables.
// Data: static JSON (data/prices/index.json + per-city detail) — served from
// Netlify's CDN, no function cost, lazy-loaded per city.

const INDEX_URL = "data/prices/index.json";
let WORLD = null; // index cache

const VIBE_MAP = {
  quiet: ["quiet", "calm", "silent", "still", "peaceful", "slow", "zen", "rest"],
  beach: ["beach", "ocean", "sea", "island", "islands", "tropical", "sand", "swim"],
  mountain: ["mountain", "mountains", "himalayas", "alpine", "hiking", "fjord", "ridges"],
  city: ["city", "urban", "nightlife", "museums", "art", "energy"],
  budget: ["budget", "cheap", "affordable", "backpack", "low cost"],
  luxury: ["luxury", "expensive", "lux", "splurge", "honeymoon"],
  food: ["foodie", "food", "street food", "cooking", "restaurants", "tapas", "tacos"],
  nature: ["nature", "waterfalls", "lakes", "gardens", "scenic", "wild"],
  culture: ["culture", "historic", "temples", "tradition", "museums", "old town"],
  adventure: ["adventure", "adrenaline", "bungee", "surf", "dive", "hiking"],
  romance: ["romantic", "honeymoon", "sunset", "couple"],
  wellness: ["wellness", "yoga", "spa", "retreat", "meditate"],
  winter: ["aurora", "northern lights", "snow", "winter"],
};

function esc(s) { const d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }

async function loadWorld() {
  if (WORLD) return WORLD;
  const r = await fetch(INDEX_URL);
  WORLD = await r.json();
  return WORLD;
}

// ---- Vibe search ----
function scorePlace(item, query) {
  const q = query.toLowerCase().trim();
  if (!q) return 0;
  let score = 0;
  const words = q.split(/[^a-z]+/).filter(Boolean);
  // direct matches
  for (const w of words) {
    if (item.city.toLowerCase().includes(w) || item.country.toLowerCase().includes(w)) score += 6;
    if (item.tags.some(t => t.includes(w))) score += 4;
    if (item.best_for.some(b => b.toLowerCase().includes(w))) score += 3;
    // vibe synonyms
    for (const [vibe, syns] of Object.entries(VIBE_MAP)) {
      if (w.includes(vibe) || syns.some(s => s.startsWith(w) && w.length > 2)) {
        if (item.tags.includes(vibe)) score += 5;
      }
    }
  }
  // budget matching: "$30 a day", "cheap", "under 100"
  const m = q.match(/(\d{2,4})\s*(?:usd|\$|bucks|dollars)?\s*(?:a|per)?\s*day/);
  if (m) {
    const cap = parseInt(m[1]);
    if (item.daily_mid <= cap) score += 7;
    else if (item.daily_budget <= cap) score += 3;
    else score -= 4;
  }
  if ((q.includes("cheap") || q.includes("budget") || q.includes("affordable")) && item.priceLevel === "cheap") score += 5;
  if ((q.includes("luxury") || q.includes("fancy")) && item.priceLevel === "pricey") score += 3;
  return score;
}

function priceBadge(level) {
  const map = { cheap: ["$", "#7FC98F"], moderate: ["$$", "#E4572E"], pricey: ["$$$", "#B0533A"] };
  const [sym, color] = map[level] || ["$", "#6E675C"];
  return `<span class="wprice" style="color:${color}">${sym}</span>`;
}

function cardHTML(item) {
  return `
  <article class="wx-card" data-key="${item.key}">
    <div class="wx-top">
      <span class="wx-flag">${esc(item.flag)}</span>
      <div class="wx-names"><strong>${esc(item.city)}</strong><span>${esc(item.country)}</span></div>
      ${item.quietPick ? '<span class="wx-quiet">quiet pick</span>' : ""}
      ${priceBadge(item.priceLevel)}
    </div>
    <div class="wx-price-row">
      <div><i>per day, budget</i><b>$${item.daily_budget}</b></div>
      <div><i>per day, mid-range</i><b>$${item.daily_mid}</b></div>
    </div>
    <div class="wx-tags">${item.tags.slice(0, 4).map(t => `<span>${esc(t)}</span>`).join("")}</div>
    <button class="wx-open" data-key="${item.key}">Full prices</button>
  </article>`;
}

// ---- Detail modal ----
async function openDetail(key) {
  let d;
  try { d = await (await fetch(`data/prices/${key}.json`)).json(); }
  catch { return; }
  const p = d.prices;
  const money = (v) => v === 0 ? "Free" : "$" + (Number.isInteger(v) ? v : v.toFixed(2));
  const sec = (title, entries) => entries.length ? `
    <div class="wx-sec"><h4>${title}</h4>
    <table class="wx-table">${entries.map(([k, v]) => `<tr><td>${k}</td><td>${money(v)}</td></tr>`).join("")}</table></div>` : "";
  const fmt = (o) => Object.entries(o || {}).map(([k, v]) => [k.replace(/_/g, " "), v]);

  const daily = `
    <div class="wx-daily">
      <div><i>Per day, budget</i><b>$${p.daily_budget}</b></div>
      <div><i>Per day, mid-range</i><b>$${p.daily_mid}</b></div>
      ${d.monthly ? `<div><i>Per month, budget</i><b>$${d.monthly.budget}</b></div>
      <div><i>Per month, comfy</i><b>$${d.monthly.comfortable}</b></div>` : ""}
    </div>`;

  const modal = document.createElement("div");
  modal.className = "wx-modal";
  modal.innerHTML = `
    <div class="wx-modal-card">
      <button class="wx-close" aria-label="Close">×</button>
      <div class="wx-top"><span class="wx-flag">${esc(d.flag)}</span>
        <div class="wx-names"><strong>${esc(d.city)}</strong><span>${esc(d.country)} · ${esc(d.currency)}</span></div></div>
      ${daily}
      ${sec("Food & drink", fmt({ "Budget meal": p.meal_cheap, "Mid-range restaurant": p.meal_mid_rest, "Coffee": p.coffee, "Beer": p.beer, "Bottled water": p.water_bottle }))}
      ${sec("Getting around", fmt({ "Taxi 3 km": p.taxi_3km, "Transit ride": p.transit_ride, ...d.transport_extra }))}
      ${sec("Stays", fmt({ "Hostel / budget night": p.hotel_budget, "Mid-range hotel": p.hotel_mid, "Luxury hotel": p.hotel_lux }))}
      ${sec("Groceries", fmt(d.groceries))}
      ${sec("Fun & leisure", fmt(d.leisure))}
      ${sec("Things to do", fmt(d.activities))}
      ${sec("Connected", fmt({ "Home internet, month": p.internet_month, "SIM with data": p.sim_data }))}
      ${d.seasons ? `<div class="wx-sec"><h4>When to go</h4><p class="wx-note" style="margin:0">${esc(d.seasons)}</p></div>` : ""}
      ${d.airports ? `<div class="wx-sec"><h4>Getting there</h4><p class="wx-note" style="margin:0">${esc(d.airports)}</p></div>` : ""}
      ${d.notes ? `<div class="wx-sec"><h4>Local knowledge</h4><p class="wx-note" style="margin:0">${esc(d.notes)}</p></div>` : ""}
      <p class="wx-note">Medians for a mid-range traveller. Test any real quote with the fair-price checker on destination cards.</p>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener("click", (e) => { if (e.target === modal || e.target.classList.contains("wx-close")) modal.remove(); });
  document.addEventListener("keydown", function esc2(e) { if (e.key === "Escape") { modal.remove(); document.removeEventListener("keydown", esc2); } });
}

// ---- Mount ----
export async function buildExplorer() {
  const wrap = document.getElementById("explorer");
  if (!wrap) return;
  wrap.innerHTML = `
    <div class="wx-searchbox">
      <div class="wx-search">
        <input id="wx-q" type="text" autocomplete="off" maxlength="120"
          placeholder="What kind of vibe? Try: quiet beach under $60 a day, foodie city, mountains…">
        <button id="wx-go" class="btn">Search</button>
      </div>
      <div class="wx-chips" id="wx-chips">
        <button type="button" data-q="quiet and calm">Quiet & calm</button>
        <button type="button" data-q="beach islands">Beach</button>
        <button type="button" data-q="mountains nature">Mountains</button>
        <button type="button" data-q="foodie city">Food</button>
        <button type="button" data-q="cheap budget under 50 a day">Budget</button>
        <button type="button" data-q="adventure adrenaline">Adventure</button>
        <button type="button" data-q="romantic sunset">Romantic</button>
        <button type="button" data-q="wellness yoga">Wellness</button>
      </div>
      <div class="wx-results" id="wx-results" aria-live="polite"></div>
    </div>
    <div class="wx-world" id="wx-world"></div>`;

  const world = await loadWorld();

  const input = document.getElementById("wx-q");
  const results = document.getElementById("wx-results");
  const run = () => {
    const scored = world.map(w => ({ w, s: scorePlace(w, input.value) })).filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s).slice(0, 6);
    results.innerHTML = scored.length
      ? scored.map(x => cardHTML(x.w)).join("")
      : `<div class="wx-none">No match for that. Try a vibe word like "quiet", "beach", "foodie" — or a budget like "under 60 a day".</div>`;
    results.querySelectorAll(".wx-open").forEach(b =>
      b.addEventListener("click", () => openDetail(b.dataset.key)));
  };
  document.getElementById("wx-go").addEventListener("click", run);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });
  wrap.querySelectorAll(".wx-chips button").forEach(b =>
    b.addEventListener("click", () => { input.value = b.dataset.q; run(); }));

  // World grid: all places, sorted by daily cost
  const worldEl = document.getElementById("wx-world");
  worldEl.innerHTML = `<h3 class="wx-world-title">Every place, by daily cost</h3>
    <div class="wx-grid">${world.slice().sort((a, b) => a.daily_mid - b.daily_mid).map(cardHTML).join("")}</div>`;
  worldEl.querySelectorAll(".wx-open").forEach(b =>
    b.addEventListener("click", () => openDetail(b.dataset.key)));
}
