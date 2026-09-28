// Stillwater site logic: Cobe globe, MapLibre atlas, and the calm finder.
// The engine (scrollcraft.js) is untouched; everything here is page-level.

// ---------- Destinations (single source of truth) ----------
const DESTINATIONS = [
  { id: "iceland",    name: "Blue Lagoon, Iceland",     lat: 63.88,  lng: -22.45,
    moods: ["sleep", "rest", "warm", "water", "quiet", "burnout", "steam", "night", "soak", "alone", "dark", "exhaust", "tired"] },
  { id: "whitehaven", name: "Hill Inlet, Australia",    lat: -20.28, lng: 149.05,
    moods: ["wonder", "soft", "sand", "sea", "warm", "drift", "light", "swim", "tide", "gentle", "sun"] },
  { id: "napali",     name: "Nāpali Coast, Hawaii",     lat: 22.17,  lng: -159.60,
    moods: ["awe", "big", "overwhelm", "scale", "perspective", "small", "lost", "green", "wild", "far"] },
  { id: "yasawa",     name: "Naviti Island, Fiji",      lat: -17.42, lng: 177.19,
    moods: ["alone", "quiet", "nobody", "silence", "empty", "unplug", "slow", "island", "offline", "disconnect"] },
  { id: "kyoto",      name: "Ryōan-ji, Kyoto",          lat: 35.0347, lng: 135.7183,
    moods: ["calm", "focus", "still", "mind", "meditate", "think", "clarity", "order", "quiet", "zen"] },
];

// ---------- Cobe globe (the signature: it re-lights toward your answer) ----------
// WebGL-capable browsers get the globe; everything else gets a calm static
// starfield canvas so the section never renders broken.
const canvas = document.getElementById("calm-globe");
let globe = null;
let targetPhi = 0.3;
let phi = 0.3;
let markerSet = "all";
let reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const webglOK = (() => {
  try {
    const t = document.createElement("canvas");
    return !!(t.getContext("webgl2") || t.getContext("webgl") || t.getContext("experimental-webgl"));
  } catch { return false; }
})();

const markersFor = (set) =>
  (set === "all" ? DESTINATIONS : DESTINATIONS.filter(d => set.includes(d.id)))
    .map(d => ({ location: [d.lat, d.lng], size: 0.055 }));

function makeGlobe() {
  if (!canvas || globe || !webglOK) {
    if (!webglOK) canvas.closest(".calm-globe-wrap").classList.add("no-webgl");
    return;
  }
  import("https://cdn.jsdelivr.net/npm/cobe@0.6.5/+esm")
    .then(({ default: createGlobe }) => {
      const size = canvas.clientWidth * (devicePixelRatio || 1);
      globe = createGlobe(canvas, {
        devicePixelRatio: 2,
        width: size, height: size,
        phi: phi, theta: 0.18,
        dark: 1, diffuse: 1.25,
        mapSamples: 16000, mapBrightness: 5.2,
        baseColor: [0.16, 0.21, 0.36],
        markerColor: [0.91, 0.66, 0.32],
        glowColor: [0.09, 0.12, 0.22],
        markers: markersFor("all"),
        onRender: (state) => {
          if (!reduceMotion) { phi += 0.0028; targetPhi = phi; }
          state.phi = phi; state.theta = 0.18;
          state.width = canvas.clientWidth * (devicePixelRatio || 1);
          state.height = canvas.clientWidth * (devicePixelRatio || 1);
          state.markers = markersFor(markerSet);
        },
      });
    })
    .catch(() => canvas.closest(".calm-globe-wrap").classList.add("no-webgl"));
}

// Rotate the globe so the first answer sits facing the visitor, then pulse it.
function aimAt(ids) {
  markerSet = ids;
  if (!ids.length) return;
  const d = DESTINATIONS.find(x => x.id === ids[0]);
  if (!d) return;
  targetPhi = Math.atan2(d.lng * (Math.PI / 180), d.lat * (Math.PI / 180));
  if (!reduceMotion) phi = targetPhi - 0.9; // swing in; onRender resumes drift
}

if (canvas) {
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries, obs) => {
      if (entries.some(e => e.isIntersecting)) { makeGlobe(); obs.disconnect(); }
    }, { rootMargin: "200px" }).observe(canvas);
  } else { makeGlobe(); }
}

// ---------- The calm finder: free AI via OpenRouter, key stays server-side ----------
const form = document.getElementById("calm-form");
const input = document.getElementById("mood");
const answer = document.getElementById("calm-answer");

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const mood = (input.value || "").trim();
  if (!mood) { input.focus(); return; }
  answer.textContent = "The globe is listening…";
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
    if (!res.ok || !data) throw new Error("The globe stayed quiet. Try again in a moment.");
    aimAt(data.ids || []);
    const names = (data.ids || []).map(id => DESTINATIONS.find(d => d.id === id)?.name).filter(Boolean);
    answer.innerHTML = "";
    const strong = document.createElement("strong");
    strong.textContent = names.length ? names.join(" · ") : "Everywhere on this map.";
    answer.append(strong, document.createTextNode(" " + (data.line || "")));
  } catch (err) {
    answer.textContent = err.message || "The globe stayed quiet. Try again.";
  } finally {
    btn.disabled = false;
  }
});

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
  map.on("error", () => mapEl.classList.add("map-dead"));
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
    if (window.ScrollCraft) {
      // Reveal the atlas with a slow ease-in to the Fiji marker as the act lands.
      const ease = () => map.easeTo({ center: [100, 5], zoom: 2.1, duration: 2400, essential: false });
      ease();
    }
  });
}
if (mapEl && !document.getElementById("atlas-map").classList.contains("map-dead") && !webglOK) {
  mapEl.classList.add("map-dead");
  mapEl.parentElement.classList.add("map-dead");
}
