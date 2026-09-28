// Relax Day Off site logic: Dusk Dial, twin Cobe globes, MapLibre atlas, calm finder.
// The engine (scrollcraft.js) is untouched; everything here is page-level.

// ---------- Destinations (single source of truth) ----------
const DESTINATIONS = [
  { id: "iceland",    name: "Blue Lagoon, Iceland",   lat: 63.88,  lng: -22.45,
    moods: ["sleep", "rest", "warm", "water", "quiet", "burnout", "steam", "night", "soak", "alone", "dark", "exhaust", "tired"] },
  { id: "lofoten",    name: "Reine, Lofoten, Norway", lat: 67.93,  lng: 13.09,
    moods: ["light", "endless", "midnight", "drift", "lose", "track", "time", "fjord", "slow", "sun", "bright"] },
  { id: "faroe",      name: "Sørvágsvatn, Faroe Islands", lat: 62.06, lng: -7.35,
    moods: ["wind", "walk", "edge", "cliff", "air", "clear", "head", "storm", "weather", "rain", "breathe"] },
  { id: "whitehaven", name: "Hill Inlet, Australia",  lat: -20.28, lng: 149.05,
    moods: ["wonder", "soft", "sand", "sea", "warm", "drift", "swim", "tide", "gentle", "sun", "blue"] },
  { id: "napali",     name: "Nāpali Coast, Hawaii",   lat: 22.17,  lng: -159.60,
    moods: ["awe", "big", "overwhelm", "scale", "perspective", "small", "lost", "green", "wild", "far"] },
  { id: "wadirum",    name: "Wadi Rum, Jordan",       lat: 29.58,  lng: 35.42,
    moods: ["stars", "desert", "silence", "night", "fire", "red", "dry", "space", "empty", "sky"] },
  { id: "yasawa",     name: "Naviti Island, Fiji",    lat: -17.42, lng: 177.19,
    moods: ["alone", "quiet", "nobody", "silence", "empty", "unplug", "slow", "island", "offline", "disconnect", "beach"] },
  { id: "kyoto",      name: "Ryōan-ji, Kyoto",        lat: 35.0347, lng: 135.7183,
    moods: ["calm", "focus", "still", "mind", "meditate", "think", "clarity", "order", "quiet", "zen", "stop"] },
];

const webglOK = (() => {
  try {
    const t = document.createElement("canvas");
    return !!(t.getContext("webgl2") || t.getContext("webgl") || t.getContext("experimental-webgl"));
  } catch { return false; }
})();
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- The Boarding Pass: stamps as you pass each destination ----------
const BP_STOPS = [
  { id: "iceland", code: "KEF" }, { id: "lofoten", code: "LKN" },
  { id: "faroe", code: "FAE" }, { id: "whitehaven", code: "HTI" },
  { id: "napali", code: "LIH" }, { id: "wadirum", code: "AQJ" },
  { id: "yasawa", code: "VUN" }, { id: "kyoto", code: "UKY" },
];
const bpStops = document.getElementById("bp-stops");
const bpCount = document.getElementById("bp-count");
const bpNext = document.getElementById("bp-next");
const boarding = document.getElementById("boarding");
const doneStops = new Set();

if (bpStops) {
  bpStops.innerHTML = BP_STOPS.map(s =>
    `<div class="bp-stop" data-stop="${s.id}"><i></i><span>${s.code}</span></div>`).join("");
}
function stampStop(id) {
  if (doneStops.has(id)) return;
  doneStops.add(id);
  const el = bpStops?.querySelector(`[data-stop="${id}"]`);
  if (el) { el.classList.add("done"); el.animate?.(
    [{ transform: "scale(1.6)" }, { transform: "scale(1.25)" }],
    { duration: 350, easing: "cubic-bezier(0.23, 1, 0.32, 1)" }); }
  if (bpCount) bpCount.textContent = `${Math.min(doneStops.size, 8)}/8 stamped`;
  const next = BP_STOPS.find(s => !doneStops.has(s.id));
  if (bpNext) bpNext.textContent = next ? `${next.code} →` : "TRIP ✓";
}
function updateBoarding() {
  if (!boarding) return;
  const mid = innerHeight * 0.5;
  for (const s of BP_STOPS) {
    const el = document.getElementById("spot-" + s.id) || document.querySelector(`section[data-sc-act] [class*="at"]`);
  }
  // find the nearest place section at viewport center by data-spot-id attributes
  for (const s of BP_STOPS) {
    const sec = document.querySelector(`[data-place="${s.id}"]`);
    if (!sec) continue;
    const r = sec.getBoundingClientRect();
    if (r.top <= mid && r.bottom >= mid) stampStop(s.id);
  }
  const pct = Math.min(1, scrollY / Math.max(document.body.scrollHeight - innerHeight, 1));
  boarding.style.setProperty("--bp", pct.toFixed(3));
  const fill = boarding.querySelector(".bp-line-fill");
  if (fill) fill.style.width = `calc(${pct.toFixed(3)} * (100% - 1.6rem))`;
}
addEventListener("scroll", () => requestAnimationFrame(updateBoarding), { passive: true });
updateBoarding();

// ---------- Twin Cobe globes (hero: ambient; calm: the signature answer) ----------
let cobeModule = null;
const heroCanvas = document.getElementById("hero-globe");
const calmCanvas = document.getElementById("calm-globe");
let calmMade = false;
let phi = 0.3;
let calmMarkerSet = "all";

const markersFor = (set) =>
  (set === "all" ? DESTINATIONS : DESTINATIONS.filter(d => set.includes(d.id)))
    .map(d => ({ location: [d.lat, d.lng], size: 0.055 }));

async function makeGlobe(canvas, opts) {
  if (!canvas || !webglOK) {
    if (canvas) canvas.parentElement.classList.add("no-webgl");
    return null;
  }
  if (!cobeModule) {
    try { cobeModule = await import("https://cdn.jsdelivr.net/npm/cobe@0.6.5/+esm"); }
    catch { canvas.parentElement.classList.add("no-webgl"); return null; }
  }
  const createGlobe = cobeModule.default;
  const myPhi = opts.phi;
  return createGlobe(canvas, {
    devicePixelRatio: 2,
    width: canvas.clientWidth * (devicePixelRatio || 1),
    height: canvas.clientWidth * (devicePixelRatio || 1),
    phi: myPhi, theta: 0.18,
    dark: 1, diffuse: 1.25,
    mapSamples: 14000, mapBrightness: 5.2,
    baseColor: [0.16, 0.21, 0.36],
    markerColor: [0.91, 0.66, 0.32],
    glowColor: [0.09, 0.12, 0.22],
    markers: markersFor("all"),
    onRender: (state) => {
      const night = 0;
      if (!reduceMotion) phi += opts.spin || 0.0022;
      state.phi = phi; state.theta = 0.18;
      state.width = canvas.clientWidth * (devicePixelRatio || 1);
      state.height = canvas.clientWidth * (devicePixelRatio || 1);
      state.markers = markersFor(opts.live ? calmMarkerSet : "all");
      // The Dusk Dial regrades the globe light itself
      state.mapBrightness = 5.2 - night * 2.2;
      state.glowColor = [0.09 - night * 0.04, 0.12 - night * 0.05, 0.22 - night * 0.08];
      state.markerColor = night > 0.55 ? [0.56, 0.66, 0.87] : [0.91, 0.66, 0.32];
    },
  });
}

if ("IntersectionObserver" in window) {
  new IntersectionObserver((entries, obs) => {
    if (entries.some(e => e.isIntersecting)) {
      makeGlobe(heroCanvas, { phi: 0.3, spin: 0.0016 });
      obs.disconnect();
    }
  }, { rootMargin: "200px" }).observe(heroCanvas || document.body);
  new IntersectionObserver((entries, obs) => {
    if (entries.some(e => e.isIntersecting) && !calmMade) {
      calmMade = true;
      makeGlobe(calmCanvas, { phi: 1.2, live: true, spin: 0.0026 });
      obs.disconnect();
    }
  }, { rootMargin: "300px" }).observe(calmCanvas || document.body);
} else {
  makeGlobe(heroCanvas, { phi: 0.3, spin: 0.0016 });
  makeGlobe(calmCanvas, { phi: 1.2, live: true, spin: 0.0026 });
}

// Rotate the calm globe so the first answer faces the visitor.
function aimAt(ids) {
  calmMarkerSet = ids;
  if (!ids.length) return;
  const d = DESTINATIONS.find(x => x.id === ids[0]);
  if (!d) return;
  if (!reduceMotion) phi = Math.atan2(d.lng * (Math.PI / 180), d.lat * (Math.PI / 180)) - 0.9;
}

// ---------- The calm finder: free AI via OpenRouter, key stays server-side ----------
const form = document.getElementById("calm-form");
const input = document.getElementById("mood");
const answer = document.getElementById("calm-answer");

async function askGlobe(mood) {
  answer.textContent = "Relaxagent is thinking…";
  const btn = document.getElementById("calm-go");
  btn.disabled = true;
  try {
    const res = await fetch("/api/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mood }),
    });
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON response */ }
    if (!res.ok || !data) throw new Error("Relaxagent is busy. Try again in a moment.");
    aimAt(data.ids || []);
    const names = (data.ids || []).map(id => DESTINATIONS.find(d => d.id === id)?.name).filter(Boolean);
    answer.innerHTML = "";
    const strong = document.createElement("strong");
    strong.textContent = names.length ? names.join(" · ") : "Everywhere on this map.";
    answer.append(strong, document.createTextNode(" " + (data.line || "")));
  } catch (err) {
    answer.textContent = err.message || "Relaxagent is busy. Try again in a moment.";
  } finally {
    btn.disabled = false;
  }
}

form?.addEventListener("submit", (e) => {
  e.preventDefault();
  const mood = (input.value || "").trim();
  if (!mood) { input.focus(); return; }
  askGlobe(mood);
});

// Mood chips: one click fills and submits.
document.querySelectorAll(".mood-chips button").forEach(b =>
  b.addEventListener("click", () => {
    input.value = b.dataset.mood;
    form.requestSubmit();
  }));

// ---------- Atlas: the real map, OpenFreeMap tiles, no key ----------
const mapEl = document.getElementById("atlas-map");
if (mapEl && window.maplibregl && webglOK) {
  const map = new maplibregl.Map({
    container: "atlas-map",
    style: "https://tiles.openfreemap.org/styles/liberty",
    center: [40, 15], zoom: 1.6,
    attributionControl: true,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }));
  map.on("error", () => { mapEl.classList.add("map-dead"); mapEl.parentElement.classList.add("map-dead"); });
  map.on("load", () => {
    DESTINATIONS.forEach(d => {
      const el = document.createElement("button");
      el.className = "atlas-pin";
      el.setAttribute("aria-label", d.name);
      el.innerHTML = `<span></span>`;
      new maplibregl.Marker({ element: el })
        .setLngLat([d.lng, d.lat])
        .setPopup(new maplibregl.Popup({ offset: 14 }).setHTML(
          `<strong>${d.name}</strong><br>One of the quietest places on earth.`))
        .addTo(map);
    });
    map.easeTo({ center: [100, 5], zoom: 2.1, duration: 2400, essential: false });
  });
}
if (mapEl && !mapEl.classList.contains("map-dead") && !webglOK) {
  mapEl.classList.add("map-dead");
  mapEl.parentElement.classList.add("map-dead");
}
