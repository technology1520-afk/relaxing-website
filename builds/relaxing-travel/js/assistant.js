// Floating journey assistant: bottom-left bubble, context-aware.
// Knows which place/section the visitor is reading; answers any journey question.

const bubble = document.getElementById("ai-bubble");
const panel = document.getElementById("ai-panel");
let log = document.getElementById("ai-log");
const form = document.getElementById("ai-form");
const input = document.getElementById("ai-q");
const closeBtn = document.getElementById("ai-close");

// --- context tracking: which place card is nearest the viewport center ---
function currentContext() {
  let place = null, section = "";
  if ("IntersectionObserver" in window) {
    const spots = [...document.querySelectorAll(".spot")];
    const mid = innerHeight / 2;
    let best = null;
    for (const s of spots) {
      const r = s.getBoundingClientRect();
      if (r.top <= mid && r.bottom >= mid) { best = s; break; }
    }
    if (best) place = best.dataset.key;
    const secs = ["#water", "#coast", "#sand", "#stone", "#plan", "#calm"];
    for (const sel of secs) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.top <= mid && r.bottom >= mid) {
        section = { "#water": "destinations: water", "#coast": "destinations: coast",
          "#sand": "destinations: sand", "#stone": "destinations: stone",
          "#plan": "the trip planner", "#calm": "the calm finder" }[sel] || sel;
        break;
      }
    }
  }
  return { place, section, trip: tripContext() };
}

// The visitor's planned trip (planner selection + latest saved trip), so
// Relaxagent answers with their actual journey in mind.
function tripContext() {
  let trip = null;
  try {
    const picked = [...document.querySelectorAll(".spot input.pick:checked, .spots input.pick:checked")]
      .map(i => i.value).filter(Boolean);
    const who = document.getElementById("plan-who")?.value || "";
    const days = parseInt(document.getElementById("plan-days")?.value) || 0;
    const last = JSON.parse(localStorage.getItem("sw_trips") || "[]").slice(-1)[0];
    if (picked.length || last) {
      trip = {
        who: who || last?.who || "",
        days: days || last?.days || 0,
        places: (picked.length ? picked.map(k => PLACE_DATA()?.[k]?.name || k) : (last?.places || [])).slice(0, 8),
        budget: last?.budget || "",
      };
    }
  } catch {}
  return trip;
}
function PLACE_DATA() {
  try { return window.__rdoPlaceNames || null; } catch { return null; }
}

function open() {
  panel.classList.add("open");
  bubble.setAttribute("aria-expanded", "true");
  setTimeout(() => input?.focus(), 250);
}
function close() {
  panel.classList.remove("open");
  bubble.setAttribute("aria-expanded", "false");
}
bubble?.addEventListener("click", () => panel.classList.contains("open") ? close() : open());
closeBtn?.addEventListener("click", close);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

function addMsg(text, cls) {
  const d = document.createElement("div");
  d.className = "ai-msg " + cls;
  d.textContent = text;
  log.appendChild(d);
  requestAnimationFrame(() => d.classList.add("shown"));
  log.scrollTop = log.scrollHeight;
  return d;
}

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function addThinking() {
  const d = document.createElement("div");
  d.className = "ai-msg ai-msg--bot ai-msg--wait ai-thinking";
  d.setAttribute("aria-label", "Relaxagent is thinking");
  d.innerHTML = `<span class="dot"></span><span class="dot"></span><span class="dot"></span>`;
  log.appendChild(d);
  requestAnimationFrame(() => d.classList.add("shown"));
  log.scrollTop = log.scrollHeight;
  return d;
}

function typeOut(el, text, speed = 14) {
  return new Promise((resolve) => {
    if (reduceMotion() || text.length > 400) { el.textContent = text; log.scrollTop = log.scrollHeight; resolve(); return; }
    let i = 0;
    el.classList.add("typing");
    const tick = () => {
      i += 2;
      el.textContent = text.slice(0, i);
      log.scrollTop = log.scrollHeight;
      if (i < text.length) setTimeout(tick, speed);
      else { el.classList.remove("typing"); resolve(); }
    };
    tick();
  });
}

// Suggested questions when empty
const SUGGESTIONS = [
  "When should I go to Wadi Rum?",
  "Is Fiji good with a 6-year-old?",
  "Where is the best view in Lofoten?",
  "How expensive is Iceland for a week?",
];
function renderSuggestions() {
  const wrap = document.createElement("div");
  wrap.className = "ai-sugs";
  SUGGESTIONS.forEach(s => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = s;
    b.addEventListener("click", () => { ask(s); });
    wrap.appendChild(b);
  });
  log.appendChild(wrap);
}
renderSuggestions();

let busy = false;
async function ask(q) {
  if (busy || !q.trim()) return;
  busy = true;
  const logNow = document.getElementById("ai-log");
  if (logNow && logNow !== log) log = logNow;
  log.querySelector(".ai-sugs")?.remove();
  addMsg(q, "ai-msg--you");
  input.value = "";
  const wait = addThinking();
  const ctx = currentContext();
  try {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q, context: ctx }),
    });
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON: function backend absent */ }
    wait.remove();
    if (data?.answer) {
      await typeOut(addMsg("", "ai-msg--bot"), data.answer);
    } else if (data?.fallback?.answer) {
      await typeOut(addMsg("", "ai-msg--bot"), data.fallback.answer);
    } else {
      // No server backend (local preview / offline): answer from the page's own data.
      const local = localFallback(q, ctx);
      await typeOut(addMsg("", "ai-msg--bot"), local);
    }
  } catch {
    wait.remove();
    const local = localFallback(q, ctx);
    await typeOut(addMsg("", "ai-msg--bot"), local);
  }
  busy = false;
}

form?.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = (input.value || "").trim();
  if (q) ask(q);
});

// Client-side fallback: answers from DESTINATIONS when no server function exists.
function localFallback(q, ctx) {
  const s = q.toLowerCase();
  const DESTS = window.RelaxDestinations || [];
  let place = ctx?.place ? DESTS.find(d => d.id === ctx.place) : null;
  if (!place) {
    place = DESTS.find(d =>
      s.includes(d.name.toLowerCase().split(",")[0]) ||
      s.includes(d.name.toLowerCase().split(", ")[1] || "###"));
  }
  const has = (...w) => w.some(x => s.includes(x));
  if (has("who are you", "your name")) return "I'm Relaxagent, the day-off guide of this site. I know the eight quiet places here - their views, seasons, prices and paperwork. Ask me anything about them.";
  if (has("visa", "passport", "document")) return (place ? `${place.name}: ` : "") + "visa rules depend on your passport - the Documents & visas section lists every rule with official links, and builds you a checklist.";
  if (has("price", "cost", "expensive", "budget", "cheap")) return (place ? `${place.name}: ` : "") + "every city in the World Explorer has a full price table - meals, hotels, taxis, monthly totals. Use the fair-price checker to test any quote.";
  if (has("weather", "when", "season", "rain")) return (place ? `${place.name}: ` : "") + "each destination card shows a live 5-day forecast and the best months. Tell me a specific place for its season.";
  if (has("kid", "child", "family", "baby")) return (place ? `${place.name} with kids: ` : "") + "every destination card has age notes and kid picks - Fiji and Kyoto are the easiest with children.";
  if (has("view", "photo", "see")) return (place ? `Best view at ${place.name}: ` : "") + "each card names its single best view and exact time to be there.";
  if (has("where", "suggest", "recommend", "which")) return "Tell me how you want to feel, or try the World Explorer search: type 'quiet beach' or 'foodie city under 100 a day'.";
  if (place) return `${place.name}: one of the quietest places on this map. Ask me about prices, weather, visa, kids or the best view there.`;
  return "I know the eight quiet places on this site. Name one - Iceland, Kyoto, Wadi Rum, Fiji - or tell me how you want to feel, and I'll point you somewhere.";
}

// Quick action: the bubble shows a contextual hint after scrolling
const HINTS = {
  "#water": "Ask me when to go, or what it costs",
  "#plan": "Ask me anything about the places above",
  "#calm": "Ask me to help you choose",
};
let hintShown = false;
if ("IntersectionObserver" in window && bubble) {
  const io = new IntersectionObserver((es) => {
    if (hintShown) return;
    for (const en of es) {
      if (en.isIntersecting && HINTS["#" + en.target.id]) {
        bubble.classList.add("hint");
        hintShown = true;
        io.disconnect();
        break;
      }
    }
  }, { threshold: 0.3 });
  ["#water", "#plan", "#calm"].forEach(sel => {
    const el = document.querySelector(sel);
    if (el) io.observe(el);
  });
}
