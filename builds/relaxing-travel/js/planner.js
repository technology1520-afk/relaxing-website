// The Planner: per-place deep-dive panels + the AI trip planner.
// Data sources: js/data.js (curated), Open-Meteo (live weather, no key),
// OpenRouter free models via /api/suggest (itinerary), Photon (place search).

import { PLACE_DATA } from "./kb-data.js";
import { fairVerdict } from "./fair-price.js";

// ---------- Weather: Open-Meteo, no key ----------
async function getWeather(lat, lng) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=5`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("weather");
  return r.json();
}

const WMO = {
  0: ["Clear sky", "☀️"], 1: ["Mostly clear", "🌤️"], 2: ["Partly cloudy", "⛅"], 3: ["Overcast", "☁️"],
  45: ["Fog", "🌫️"], 48: ["Icy fog", "🌫️"], 51: ["Light drizzle", "🌦️"], 53: ["Drizzle", "🌦️"], 55: ["Heavy drizzle", "🌧️"],
  61: ["Light rain", "🌦️"], 63: ["Rain", "🌧️"], 65: ["Heavy rain", "🌧️"], 71: ["Light snow", "🌨️"], 73: ["Snow", "🌨️"],
  75: ["Heavy snow", "❄️"], 80: ["Rain showers", "🌦️"], 81: ["Showers", "🌧️"], 82: ["Violent showers", "⛈️"],
  95: ["Thunderstorm", "⛈️"], 96: ["Storm with hail", "⛈️"], 99: ["Severe storm", "⛈️"],
};
const wmo = (c) => WMO[c] || ["Weather", "🌡️"];

function renderWeather(el, data) {
  const c = data.current;
  const [desc, icon] = wmo(c.weather_code);
  const days = data.daily.time.map((t, i) => {
    const [, ic] = wmo(data.daily.weather_code[i]);
    const d = new Date(t + "T12:00");
    return `<div class="wday"><span class="wd-d">${d.toLocaleDateString(undefined, { weekday: "short" })}</span><span class="wd-i">${ic}</span><span class="wd-t">${Math.round(data.daily.temperature_2m_max[i])}°</span></div>`;
  }).join("");
  el.innerHTML = `
    <div class="wnow"><span class="w-ico">${icon}</span><span class="w-temp">${Math.round(c.temperature_2m)}°C</span>
      <span class="w-desc">${desc} · wind ${Math.round(c.wind_speed_10m)} km/h</span></div>
    <div class="wdays">${days}</div>`;
}

// ---------- Distance: haversine from the visitor's rough position ----------
// Distance to travel FROM (user location, geolocated or defaulted) TO (place).
let userPos = null;
function initUserPos() {
  // Default: center of the world's population roughly; overridden by geolocation
  userPos = { lat: 30, lng: 10, source: "assumed" };
  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      (p) => { userPos = { lat: p.coords.latitude, lng: p.coords.longitude, source: "your device" }; renderDistances(); },
      () => {}, { timeout: 8000 });
  }
}
function kmBetween(a, b) {
  const R = 6371, toR = (x) => x * Math.PI / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const s = Math.sin(dLat/2)**2 + Math.cos(toR(a.lat))*Math.cos(toR(b.lat))*Math.sin(dLng/2)**2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1-s)));
}
function flightTime(km) {
  // ~850 km/h cruise + 45 min overhead. Nonstop if < 11000km else add stop.
  const h = km / 850 + 0.75;
  return { h: Math.round(h), stop: km > 11000 };
}

// ---------- Fair-price checker ----------
function priceRows(p, quotes) {
  // quotes: {meal: 30, hotel: 200, taxi: 25} as user-entered or AI-quoted USD
  return Object.entries(quotes).map(([k, v]) => {
    const median = p.prices[k];
    const ratio = v / median;
    const f = fairVerdict(ratio);
    return `<div class="pr-row"><span class="pr-item">${k}</span><span class="pr-you">$${v}</span><span class="pr-med">local ~$${median}</span><span class="pr-verdict ${f.tone}">${f.verdict}</span></div>`;
  }).join("");
}

// ---------- Per-place deep-dive panel ----------
function placePanelHTML(p, idx) {
  return `
  <article class="spot" id="spot-${p.key}" data-key="${p.key}">
    <div class="spot-head" role="button" tabindex="0" aria-expanded="false" aria-controls="spotbody-${p.key}">
      <span class="spot-flag">${p.flag}</span>
      <div><h3 class="sc-display">${p.name} <span class="spot-country">${p.country}</span></h3></div>
      <div class="spot-mini">
        <span class="spot-quick">now ${p.quickTemp || ""} · from $${p.prices.meal}/meal</span>
        <label class="spot-pick" onclick="event.stopPropagation()"><input type="checkbox" class="pick" value="${p.key}"> Plan this</label>
        <span class="spot-caret" aria-hidden="true">▶</span>
      </div>
    </div>
    <div class="spot-body" id="spotbody-${p.key}">
      <div class="spot-grid">
        <div class="spot-col">
          <h4>Best view</h4><p>${p.bestView}</p>
          <h4>Crowds</h4><p>${p.crowd}</p>
          <h4>With kids</h4><p>${p.kid}</p>
        </div>
        <div class="spot-col">
          <h4>Best months</h4><p>${p.bestMonths}</p>
          <h4>Adventure</h4><ul class="spot-list">${p.adventure.map(a => `<li>${a}</li>`).join("")}</ul>
          <h4>Kid picks</h4><ul class="spot-list">${p.kidPicks.map(a => `<li>${a}</li>`).join("")}</ul>
        </div>
        <div class="spot-col">
          <h4>Weather now</h4>
          <div class="wbox" id="wx-${p.key}"><span class="w-loading">Fetching live weather…</span></div>
          <h4>How far</h4>
          <div class="dist" id="dist-${p.key}"><span class="w-loading">Measuring…</span></div>
          <h4>Local prices (typical, USD)</h4>
          <div class="ptable">
            <div class="pr-row pr-head"><span>Item</span><span>Local</span></div>
            <div class="pr-row"><span>Casual meal</span><span>$${p.prices.meal}</span></div>
            <div class="pr-row"><span>Coffee</span><span>$${p.prices.coffee}</span></div>
            <div class="pr-row"><span>3km taxi</span><span>$${p.prices.taxi}</span></div>
            <div class="pr-row"><span>Hotel night</span><span>$${p.prices.hotel}</span></div>
            <div class="pr-row"><span>Headline attraction</span><span>$${p.prices.attraction}</span></div>
          </div>
          <p class="pnote">${p.priceNote}</p>
          <div class="pcheck">
            <label>Got a quote? Check if it is fair:</label>
            <form class="pcheck-row" data-key="${p.key}">
              <select aria-label="Item"><option value="meal">Meal</option><option value="coffee">Coffee</option><option value="taxi">Taxi</option><option value="hotel">Hotel night</option><option value="attraction">Attraction</option></select>
              <input type="number" min="1" placeholder="$ price" aria-label="Quoted price in dollars">
              <button type="submit">Check</button>
            </form>
            <div class="pcheck-out" aria-live="polite"></div>
          </div>
        </div>
      </div>
    </div>
  </article>`;
}

// ---------- Render all panels + hydrate weather/distance ----------
const ORDER = ["iceland", "lofoten", "faroe", "whitehaven", "napali", "wadirum", "yasawa", "kyoto"];

export function buildPlanner() {
  const wrap = document.getElementById("spots");
  if (!wrap) return;
  wrap.innerHTML = ORDER.map((k, i) => placePanelHTML(PLACE_DATA[k], i)).join("");

  initUserPos();

  renderDistances();

  // Accordion: one open at a time; lazy-load weather when a card opens
  wrap.addEventListener("click", (e) => {
    const head = e.target.closest(".spot-head");
    if (!head || e.target.closest(".spot-pick")) return;
    const spot = head.parentElement;
    const wasOpen = spot.classList.contains("open");
    wrap.querySelectorAll(".spot.open").forEach(s => {
      s.classList.remove("open");
      s.querySelector(".spot-head").setAttribute("aria-expanded", "false");
    });
    if (!wasOpen) {
      spot.classList.add("open");
      head.setAttribute("aria-expanded", "true");
      hydrateWeather(spot.dataset.key);
    }
  });
  wrap.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.classList?.contains("spot-head")) {
      e.preventDefault();
      e.target.click();
    }
  });
  // Open the first card by default so the pattern is discoverable
  const first = wrap.querySelector(".spot-head");
  if (first) { first.parentElement.classList.add("open"); first.setAttribute("aria-expanded", "true"); hydrateWeather("iceland"); }

  // Fair-price check forms
  wrap.addEventListener("submit", (e) => {
    const form = e.target.closest(".pcheck-row");
    if (!form) return;
    e.preventDefault();
    const p = PLACE_DATA[form.dataset.key];
    const item = form.querySelector("select").value;
    const val = parseFloat(form.querySelector("input").value);
    const out = form.parentElement.querySelector(".pcheck-out");
    if (!val || val <= 0) { out.textContent = "Type the price you were quoted."; return; }
    const f = fairVerdict(val / p.prices[item]);
    out.innerHTML = `<strong class="${f.tone}">${f.verdict}.</strong> ${f.note} <span class="pr-med">Local median $${p.prices[item]}</span>`;
    fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "price", place: p.key, item, quote: val, verdict: f.verdict }) }).catch(() => {});
  });
}

const wxLoaded = new Set();
async function hydrateWeather(key) {
  if (wxLoaded.has(key)) return;
  wxLoaded.add(key);
  const el = document.getElementById("wx-" + key);
  if (!el) return;
  try { renderWeather(el, await getWeather(PLACE_DATA[key].lat, PLACE_DATA[key].lng)); }
  catch { el.innerHTML = '<span class="w-loading">Weather unavailable right now.</span>'; wxLoaded.delete(key); }
}

function renderDistances() {
  ORDER.forEach(k => {
    const el = document.getElementById("dist-" + k);
    if (!el || !userPos) return;
    const p = PLACE_DATA[k];
    const km = kmBetween(userPos, p);
    const ft = flightTime(km);
    el.innerHTML = `<strong>${km.toLocaleString()} km</strong> from ${userPos.source} ·
      about <strong>${ft.h} h flight</strong>${ft.stop ? " (with a stop)" : " nonstop"}`;
  });
}

// ---------- The AI trip planner (day-by-day) ----------
const planForm = document.getElementById("plan-form");
const planOut = document.getElementById("plan-out");

planForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const days = document.getElementById("plan-days").value;
  const who = document.getElementById("plan-who").value.trim() || "a family with kids";
  const picks = [...document.querySelectorAll(".pick:checked")].map(c => c.value);
  if (!picks.length) { planOut.textContent = "Tick at least one place above."; return; }
  const btn = document.getElementById("plan-go");
  btn.disabled = true;
  planOut.innerHTML = '<span class="w-loading">Relaxagent is planning your days…</span>';
  try {
    const res = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: parseInt(days), who, places: picks }),
    });
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok || !data) throw new Error("Relaxagent is busy. Try again in a moment.");
    renderPlan(data, picks);
  } catch (err) {
    planOut.textContent = err.message || "Relaxagent is busy. Try again in a moment.";
  } finally {
    btn.disabled = false;
  }
});

function renderPlan(data, picks) {
  const names = picks.map(k => PLACE_DATA[k] ? `${PLACE_DATA[k].flag} ${PLACE_DATA[k].name}` : k).join(" · ");
  const budget = data.budget;
  // Persist the trip (best-effort; visible on account.html when logged in)
  const trip = {
    owner: null,
    at: Date.now(),
    days: (data.days || []).length,
    who: (document.getElementById("plan-who").value || "family").slice(0, 60),
    places: (picks || []).map(k => PLACE_DATA[k]?.name || k),
    budget: (budget || "").slice(0, 120),
  };
  try {
    const identity = window.netlifyIdentity;
    const user = identity?.currentUser();
    trip.owner = user?.email || null;
    const store = JSON.parse(localStorage.getItem("sw_trips") || "[]");
    store.push(trip);
    localStorage.setItem("sw_trips", JSON.stringify(store.slice(-50)));
  } catch {}
  // Server sync: logged-in visitors get the trip on every device.
  import("./trip-sync.js").then(async (sync) => {
    sync.pushTrip({ ...trip, daysPlan: (data.days || []).map(d => ({ day: d.day, title: d.title, plan: d.plan })), placeKeys: (picks || []).slice() })
      .then(id => { if (id) trip.id = id; });
  }).catch(() => {});
  // Keep the full plan for export (print/PDF, calendar)
  lastTrip = {
    title: `${trip.days} quiet days`,
    subtitle: `${names} · for ${trip.who}`,
    days: (data.days || []).map(d => ({ day: d.day, title: d.title, plan: d.plan })),
    budget: budget || "",
    placeKeys: (picks || []).slice(),
  };
  try { sessionStorage.setItem("rdo_last_trip", JSON.stringify(lastTrip)); } catch {}
  planOut.innerHTML = `
    <div class="plan-route"><strong>${names}</strong></div>
    ${(data.days || []).map(d => `
      <div class="plan-day">
        <span class="plan-dnum">Day ${d.day}</span>
        <div><strong>${d.title}</strong>
        <p>${d.plan}</p></div>
      </div>`).join("")}
    ${budget ? `<div class="plan-budget"><strong>Budget feel:</strong> ${budget}</div>` : ""}
    <div class="plan-export" id="plan-export"></div>
    <p class="plan-note">AI-drafted plan. Check opening days and book the first night before you fly.</p>`;
  import("./trip-export.js").then(m => m.exportButtons(lastTrip, document.getElementById("plan-export")));
}

let lastTrip = null;
