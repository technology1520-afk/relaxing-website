// World Explorer: vibe search + world price tables.
// Data: static JSON (data/prices/index.json + per-city detail) — served from
// Netlify's CDN, no function cost, lazy-loaded per city.

const INDEX_URL = "data/kb/index.json";
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
  camping: ["camping", "campsite", "tent", "tents", "stargazing", "dark sky", "wild camping", "campsites", "fire pits"],
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
    ${item.monthsLabel ? `<div class="wx-months" title="Best time to go">🗓 ${esc(item.monthsLabel)}</div>` : ""}
    <div class="wx-tags">${item.tags.slice(0, 4).map(t => `<span>${esc(t)}</span>`).join("")}</div>
    <button class="wx-open" data-key="${item.key}">Full prices</button>
  </article>`;
}

// ---- Detail modal ----
async function openDetail(key) {
  let raw;
  try { raw = await (await fetch(`data/kb/${key}.json`)).json(); }
  catch { return; }
  // deep holds the original per-city detail when the entry was migrated from data/prices
  const d = raw.deep && raw.deep.groceries ? raw.deep : raw;
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
      ${d.docs ? `<div class="wx-sec"><h4>Documents & entry</h4>
        <div class="wx-docs">
          <p><strong>Entry:</strong> ${esc(d.docs.entry)}</p>
          <p><strong>Insurance:</strong> ${esc(d.docs.insurance)}</p>
          ${d.docs.special?.length ? `<p><strong>Prepare:</strong></p><ul>${d.docs.special.map(s => `<li>${esc(s)}</li>`).join("")}</ul>` : ""}
          <p><strong>Health:</strong> ${esc(d.docs.health)}</p>
          <p><strong>Agency needed?</strong> ${esc(d.docs.agency)}</p>
        </div></div>` : ""}
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

  // World grid: filterable (when + budget + vibe), sorted by daily cost
  const worldEl = document.getElementById("wx-world");
  const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const nowMonth = new Date().getMonth(); // 0-based
  const BUDGETS = [
    { id: "all", label: "Any budget", test: () => true },
    { id: "50", label: "Under $50/day", test: (w) => w.daily_mid <= 50 },
    { id: "100", label: "$50–100/day", test: (w) => w.daily_mid > 50 && w.daily_mid <= 100 },
    { id: "150", label: "$100–150/day", test: (w) => w.daily_mid > 100 && w.daily_mid <= 150 },
    { id: "151", label: "$150+/day", test: (w) => w.daily_mid > 150 },
  ];
  let month = nowMonth + 1; // default: where's good NOW
  let budget = "all";
  let vibe = "all";
  const VIBES = [
    { id: "all", label: "Any vibe" },
    { id: "beach", label: "Beach", tags: ["beach", "tropical", "ocean", "swim"] },
    { id: "mountain", label: "Mountains", tags: ["mountain", "mountains", "hiking", "fjord", "alpine"] },
    { id: "city", label: "City", tags: ["city", "nightlife", "museums", "art", "urban"] },
    { id: "quiet", label: "Quiet & calm", tags: ["quiet", "calm", "peaceful", "slow"] },
    { id: "food", label: "Food", tags: ["foodie", "food", "street food", "cooking", "tapas"] },
    { id: "nature", label: "Nature", tags: ["nature", "waterfalls", "lakes", "scenic", "wild", "lake"] },
    { id: "adventure", label: "Adventure", tags: ["adventure", "adrenaline", "surf", "dive"] },
    { id: "romance", label: "Romantic", tags: ["romantic", "honeymoon", "sunset"] },
    { id: "wellness", label: "Wellness", tags: ["wellness", "yoga", "spa", "retreat"] },
    { id: "winter", label: "Snow & aurora", tags: ["aurora", "northern lights", "snow", "skiing", "winter"] },
    { id: "camping", label: "Camping", tags: ["camping", "campsite", "stargazing", "dark sky"] },
  ];

  worldEl.innerHTML = `
    <h3 class="wx-world-title">Find your place</h3>
    <div class="wx-filters">
      <div class="wx-frow" id="wx-f-months" role="group" aria-label="When do you want to go?">
        ${MONTH_NAMES.map((m, i) => `<button type="button" class="wx-fmonth" data-month="${i + 1}" aria-pressed="${i + 1 === month}">${m}</button>`).join("")}
      </div>
      <div class="wx-frow" id="wx-f-budget" role="group" aria-label="Daily budget">
        ${BUDGETS.map(b => `<button type="button" class="wx-fchip" data-budget="${b.id}" aria-pressed="${b.id === budget}">${b.label}</button>`).join("")}
      </div>
      <div class="wx-frow" id="wx-f-vibe" role="group" aria-label="Vibe">
        ${VIBES.map(v => `<button type="button" class="wx-fchip" data-vibe="${v.id}" aria-pressed="${v.id === vibe}">${v.label}</button>`).join("")}
      </div>
    </div>
    <div class="wx-count" id="wx-count" aria-live="polite"></div>
    <div class="wx-grid" id="wx-grid"></div>`;

  const grid = document.getElementById("wx-grid");
  const count = document.getElementById("wx-count");

  function renderGrid() {
    const bDef = BUDGETS.find(b => b.id === budget);
    const vDef = VIBES.find(v => v.id === vibe);
    const filtered = world
      .filter(w => month === 0 || (w.months || []).includes(month))
      .filter(bDef.test)
      .filter(w => vibe === "all" || (w.tags || []).some(t => vDef.tags.includes(t)))
      .sort((a, b) => a.daily_mid - b.daily_mid);
    count.textContent = filtered.length === world.length
      ? `All ${filtered.length} places`
      : `${filtered.length} of ${world.length} places match`;
    grid.innerHTML = filtered.length
      ? filtered.map(cardHTML).join("")
      : `<div class="wx-none">No places match those filters — try another month or widen the budget.</div>`;
    grid.querySelectorAll(".wx-open").forEach(b =>
      b.addEventListener("click", () => openDetail(b.dataset.key)));
  }

  worldEl.querySelectorAll(".wx-fmonth").forEach(b =>
    b.addEventListener("click", () => {
      const m = Number(b.dataset.month);
      month = (month === m) ? 0 : m; // click again to clear
      worldEl.querySelectorAll(".wx-fmonth").forEach(x =>
        x.setAttribute("aria-pressed", String(Number(x.dataset.month) === month)));
      renderGrid();
    }));
  worldEl.querySelectorAll("[data-budget]").forEach(b =>
    b.addEventListener("click", () => {
      budget = b.dataset.budget;
      worldEl.querySelectorAll("[data-budget]").forEach(x =>
        x.setAttribute("aria-pressed", String(x.dataset.budget === budget)));
      renderGrid();
    }));
  worldEl.querySelectorAll("[data-vibe]").forEach(b =>
    b.addEventListener("click", () => {
      vibe = (vibe === b.dataset.vibe) ? "all" : b.dataset.vibe;
      worldEl.querySelectorAll("[data-vibe]").forEach(x =>
        x.setAttribute("aria-pressed", String(x.dataset.vibe === vibe)));
      renderGrid();
    }));

  renderGrid();
}
