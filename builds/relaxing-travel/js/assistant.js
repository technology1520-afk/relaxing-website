// Floating journey assistant: bottom-left bubble, context-aware.
// Knows which place/section the visitor is reading; answers any journey question.

const bubble = document.getElementById("ai-bubble");
const panel = document.getElementById("ai-panel");
const log = document.getElementById("ai-log");
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
  return { place, section };
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
  log.scrollTop = log.scrollHeight;
  return d;
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
  log.querySelector(".ai-sugs")?.remove();
  addMsg(q, "ai-msg--you");
  input.value = "";
  const wait = addMsg("…", "ai-msg--bot ai-msg--wait");
  const ctx = currentContext();
  try {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q, context: ctx }),
    });
    let data = null;
    try { data = await res.json(); } catch {}
    wait.remove();
    if (data?.fallback?.answer) {
      addMsg(data.fallback.answer, "ai-msg--bot");
    } else if (!res.ok || !data?.answer) {
      addMsg(data?.error || "Dayo is busy. Try again in a moment.", "ai-msg--bot ai-msg--err");
    } else {
      addMsg(data.answer, "ai-msg--bot");
    }
  } catch {
    wait.remove();
    addMsg("Dayo lost connection. Try again when you are back online.", "ai-msg--bot ai-msg--err");
  }
  busy = false;
}

form?.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = (input.value || "").trim();
  if (q) ask(q);
});

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
