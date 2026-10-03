// Escape Radar: "I'm stuck in [city] — quiet places within reach."
// Client-side only: geolocate or type a city, haversine against the KB index,
// rank by distance + quiet score + budget. No API calls, no cost.

const ESC_CITY_COORDS = {
  // major origin cities the tool suggests; any typed city falls back to
  // Nominatim (free, no key) with graceful failure
  "phnom penh": [11.5564, 104.9282], "bangkok": [13.7563, 100.5018],
  "tokyo": [35.6895, 139.6917], "singapore": [1.3521, 103.8198],
  "london": [51.5074, -0.1278], "new york": [40.7128, -74.006],
  "hong kong": [22.3193, 114.1694], "kuala lumpur": [3.139, 101.6869],
  "ho chi minh city": [10.8231, 106.6297], "hanoi": [21.0285, 105.8542],
  "seoul": [37.5665, 126.978], "sydney": [-33.8688, 151.2093],
  "berlin": [52.52, 13.405], "paris": [48.8566, 2.3522],
  "dubai": [25.2048, 55.2708], "los angeles": [34.0522, -118.2437],
  "san francisco": [37.7749, -122.4194], "mumbai": [19.076, 72.8777],
  "jakarta": [-6.2088, 106.8456], "manila": [14.5995, 120.9842],
  "osaka": [34.6937, 135.5023], "taipei": [25.033, 121.5654],
};

const ESC_HUBS = {
  // quiet places ARE the destinations; "escape" = city origins. Distance is
  // origin -> destination great-circle; travel reality noted per band.
};

function escHaversineKm(aLat, aLng, bLat, bLng) {
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Rough travel-time framing from great-circle km (crow-flies → real trip shape)
function escTripShape(km) {
  if (km < 60) return ["walkable / short ride", "same-day escape, no packing"];
  if (km < 300) return ["2–4 h by car, bus or train", "day trip or one easy night"];
  if (km < 900) return ["1 h flight or overnight train", "a proper weekend"];
  if (km < 3000) return ["2–4 h flight", "long weekend territory"];
  if (km < 8000) return ["6–10 h flight", "a full week off"];
  return ["10 h+ flight", "the big reset — save up days for it"];
}

function escQuietScore(w) {
  // cheap + tagged quiet + marked quietPick = the site's own signal
  let s = 50;
  if (w.quietPick) s += 25;
  if ((w.tags || []).some(t => ["quiet", "calm", "peaceful", "slow", "silence"].includes(t))) s += 15;
  if (w.daily_mid <= 60) s += 10; else if (w.daily_mid <= 110) s += 5;
  return Math.min(100, s);
}

let ESC_WORLD = null;
async function escLoad() {
  if (ESC_WORLD) return ESC_WORLD;
  ESC_WORLD = await (await fetch("data/kb/index.json")).json();
  return ESC_WORLD;
}

export async function buildEscape() {
  const wrap = document.getElementById("escape");
  if (!wrap) return;

  wrap.innerHTML = `
    <div class="esc-box">
      <div class="esc-row">
        <input id="esc-city" type="text" autocomplete="off" maxlength="60"
          placeholder="Type your city — e.g. Phnom Penh, Tokyo, London…">
        <button id="esc-geo" class="esc-btn esc-btn--ghost" type="button" title="Use my location">📍 Near me</button>
        <button id="esc-go" class="esc-btn" type="button">Find escapes</button>
      </div>
      <div class="esc-status" id="esc-status"></div>
      <div class="esc-results" id="esc-results" aria-live="polite"></div>
    </div>`;

  const input = document.getElementById("esc-city");
  const status = document.getElementById("esc-status");
  const results = document.getElementById("esc-results");
  const world = await escLoad();

  function render(origin) {
    const ranked = world
      .map(w => {
        const km = escHaversineKm(origin[0], origin[1], w.lat, w.lng);
        return { w, km, shape: escTripShape(km), quiet: escQuietScore(w) };
      })
      // nearest first, but break ties by quiet score so cheap+quiet wins
      .sort((a, b) => a.km - b.km || b.quiet - a.quiet)
      .slice(0, 6);

    results.innerHTML = ranked.map(r => `
      <article class="esc-card">
        <div class="esc-photo"><img src="assets/${r.w.key}.webp" alt="${r.w.city}" loading="lazy" width="640" height="420"></div>
        <div class="esc-body">
          <div class="esc-names">
            <strong>${r.w.flag} ${r.w.city}</strong><span>${r.w.country}</span>
          </div>
          <div class="esc-dist">
            <b>${Math.round(r.km).toLocaleString()} km</b>
            <span>${r.shape[0]} · ${r.shape[1]}</span>
          </div>
          <div class="esc-meta">
            <span title="Best time to go">🗓 ${r.w.monthsLabel || "year-round"}</span>
            <span title="Mid-range per day">💰 ~$${r.w.daily_mid}/day</span>
            <span title="How quiet it really is">🤫 quiet ${r.quiet}/100</span>
          </div>
        </div>
      </article>`).join("");

    status.textContent = `Quiet escapes from ${origin[2] || "you"} — nearest first:`;
  }

  function fail(msg) { status.textContent = msg; }

  document.getElementById("esc-go").addEventListener("click", async () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { fail("Type a city first, or tap 📍 Near me."); return; }
    const known = ESC_CITY_COORDS[q];
    if (known) return render([...known, input.value.trim()]);
    status.textContent = "Looking up your city…";
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(input.value.trim())}`,
        { headers: { "Accept": "application/json" } });
      const hit = (await r.json())[0];
      if (!hit) return fail(`Can't find "${input.value.trim()}" — check the spelling?`);
      render([parseFloat(hit.lat), parseFloat(hit.lon), hit.display_name.split(",")[0]]);
    } catch { fail("City lookup failed — try 📍 Near me instead."); }
  });

  input.addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("esc-go").click(); });

  document.getElementById("esc-geo").addEventListener("click", () => {
    if (!("geolocation" in navigator)) return fail("This browser can't share location — type your city instead.");
    status.textContent = "Finding you…";
    navigator.geolocation.getCurrentPosition(
      (pos) => render([pos.coords.latitude, pos.coords.longitude, "your location"]),
      () => fail("Location blocked — type your city instead."),
      { timeout: 8000 });
  });

  // auto-run on first view: guess from timezone as a zero-click starter
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    const guess = tz.split("/")[1]?.replace(/_/g, " ").toLowerCase();
    if (guess && ESC_CITY_COORDS[guess]) {
      input.value = guess.replace(/\b\w/g, c => c.toUpperCase());
      render([...ESC_CITY_COORDS[guess], input.value]);
    }
  } catch { /* no tz — leave empty */ }
}
