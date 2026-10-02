// Tiered "thinking" animation for Relaxagent.
// Tiers (by question intent, computed client-side):
//   quick  — dot pulse (existing, fast answers)
//   deep   — thinking orb + rotating status phrases (rankings, comparisons, prices)
//   premium— golden shimmer bar + orbiting spark + status phrases (planning, itineraries,
//            premium/luxury, multi-day, distance/route math)
// Exposed as window.relaxThinking.add(q) — deliberately NOT window.addThinking,
// to avoid colliding with the plain-script function declaration in assistant.js.

const THINK_PHRASES = {
  quick: ["Checking the guidebook…"],
  deep: [
    "Ranking the quiet spots…",
    "Weighing seasons and prices…",
    "Comparing every card on the site…",
    "Almost there…",
  ],
  premium: [
    "Dreaming up your itinerary…",
    "Balancing distances and slow mornings…",
    "Curating the premium details…",
    "Polishing your route…",
    "Almost ready…",
  ],
};

function thinkTierFor(q) {
  const s = String(q || "").toLowerCase();
  if (/(plan|itinerary|trip for|day by day|days|route|premium|luxur|honeymoon|how far|distance|flight|best|cheapest|quietest|compare|worth)/.test(s)) {
    return /(premium|luxur|honeymoon|plan|itinerary|days|route|trip)/.test(s) ? "premium" : "deep";
  }
  return "quick";
}

function addThinking(q) {
  const tier = thinkTierFor(q);
  const d = document.createElement("div");
  d.className = `ai-msg ai-msg--bot ai-msg--wait ai-thinking ai-thinking--${tier}`;
  d.setAttribute("aria-label", "Relaxagent is thinking");
  d.setAttribute("data-tier", tier);

  const orb = `<span class="think-orb" aria-hidden="true"><span class="think-core"></span><span class="think-spark"></span><span class="think-shimmer"></span></span>`;
  const dots = `<span class="dot"></span><span class="dot"></span><span class="dot"></span>`;
  const status = `<span class="think-status"></span>`;

  d.innerHTML = `${tier === "quick" ? dots : orb}${tier !== "quick" ? status : ""}`;

  // Attach FIRST — the phrase loop checks d.isConnected and would silently
  // bail on its first (synchronous) run if the node isn't in the log yet.
  log.appendChild(d);
  requestAnimationFrame(() => d.classList.add("shown"));
  log.scrollTop = log.scrollHeight;

  if (tier !== "quick") {
    const el = d.querySelector(".think-status");
    const phrases = THINK_PHRASES[tier];
    let i = 0;
    const show = () => {
      if (!d.isConnected || !el) { clearTimeout(d.__phraseTimer); return; }
      el.textContent = phrases[i % phrases.length];
      el.classList.remove("phrase-in");
      void el.offsetWidth; // restart the fade-in animation
      el.classList.add("phrase-in");
      i++;
      d.__phraseTimer = setTimeout(show, 1600);
    };
    show();
  }

  return d;
}

window.relaxThinking = { add: addThinking, tierFor: thinkTierFor, version: 3 };