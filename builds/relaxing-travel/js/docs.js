// Travel Documents & Visa Helper.
// Deterministic checklist generator + AI visa guidance + anti-scam education.
// No fake visa database: links to official sources, AI adds context with
// explicit "verify with officials" framing.

const NATIONALITIES = [
  "United States", "United Kingdom", "Germany", "France", "Italy", "Spain",
  "Netherlands", "Sweden", "Norway", "Denmark", "Finland", "Ireland",
  "Portugal", "Poland", "Czechia", "Greece", "Switzerland", "Austria",
  "Canada", "Australia", "New Zealand", "Japan", "South Korea", "Singapore",
  "China", "India", "Brazil", "Mexico", "Argentina", "Chile",
  "South Africa", "UAE", "Saudi Arabia", "Israel", "Turkey",
  "Thailand", "Malaysia", "Indonesia", "Vietnam", "Philippines",
  "Nigeria", "Kenya", "Egypt", "Morocco", "Other",
];

// Visa notes come from the knowledge base (data/kb/*.json via js/kb-data.js).
// Widely-published rules, still always verified via the official links shown.
import { KB } from "./kb-data.js";
const DEST_VISA_NOTES = Object.fromEntries(
  Object.entries(KB).filter(([, e]) => e.visa).map(([k, e]) => [k, e.visa])
);

const esc = (s) => { const d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; };

function checklist(nationality, destinations) {
  const items = [];
  items.push(["Passport valid 6+ months beyond your return date", "The universal rule. Some countries also require 2+ blank pages."]);
  items.push(["Printed + digital copies of passport", "Store one copy in your email, one in your bag, one with family."]);
  items.push(["Travel insurance covering your activities", "Adventure sports (diving, bungee, skiing) are excluded from basic policies — declare them."]);
  items.push(["Return/onward ticket", "Many airlines and border agents require proof you will leave."]);
  items.push(["Proof of accommodation (first night minimum)", "Hotel confirmation or an address; often asked at check-in or arrival."]);
  items.push(["Proof of funds", "Bank statement or cash; some countries want ~$50-100/day available."]);
  if (destinations.includes("wadirum")) items.push(["Jordan Pass (if going to Jordan)", "Bought online before arrival: waives the visa fee + covers major sites. Cheaper than visa-on-arrival."]);
  if (destinations.includes("napali") && ["United States"].indexOf(nationality) === -1)
    items.push(["ESTA or US visa (for Hawaii)", "Apply at esta.cbp.dhs.gov at least 72 hours before flying. $21."]);
  if (destinations.includes("whitehaven"))
    items.push(["Australian ETA/eVisitor", "Online application, most approvals within minutes, but apply days ahead anyway."]);
  if (destinations.includes("iceland") || destinations.includes("lofoten"))
    items.push(["Schengen travel insurance (€30,000 medical cover)", "Required if you need a Schengen visa; smart even when exempt."]);
  if (["China", "India", "Vietnam", "Philippines", "Indonesia", "Thailand", "Morocco", "Egypt", "Nigeria", "Kenya", "Turkey", "Saudi Arabia", "Other"].includes(nationality))
    items.push(["Visa check is CRITICAL for your nationality", "Rules vary enormously by passport. Use the official links below — do not rely on blogs."]);
  items.push(["Vaccination check", "Routine vaccines + any destination-specific ones (see your national travel health service)."]);
  items.push(["Prescriptions in original packaging + doctor's letter", "Some common medicines (ADHD meds, codeine) are controlled elsewhere."]);
  items.push(["International driving permit (if renting)", "Often required alongside your national licence; get it before you fly."]);
  return items;
}

const SCAM_FLAGS = [
  ["Guaranteed visas", "No legitimate agency can guarantee a visa — the decision is always the embassy's. Guaranteed = scam."],
  ["Payment by gift card, crypto or Western Union", "No real agency or government asks for these. Instant red flag."],
  ["Contact only via WhatsApp with no company address", "Real agencies have a registered office, a landline and a company number you can verify."],
  ["Prices far below the official fee", "Government visa fees are public. 'Fast-track for triple price' with no receipt is a scam."],
  ["Asks for your full password or email access", "No form ever needs your email password. Ever."],
];

const OFFICIAL_LINKS = [
  ["Visa requirements by passport (IATA/Timatic)", "https://www.iatatravelcentre.com/", "The database airlines themselves use. Enter passport + destination."],
  ["Embassy locator (your country's foreign ministry)", "https://www.embassy-worldwide.com/", "Find your embassy in any destination — save the address and 24h number before you fly."],
  ["Travel advisories (government)", "https://www.gov.uk/foreign-travel-advice", "UK example; every major country publishes equivalent advisories."],
  ["Travel health & vaccines", "https://wwwnc.cdc.gov/travel", "Destination-specific vaccine and health guidance."],
];

export function buildDocs() {
  const wrap = document.getElementById("docs");
  if (!wrap) return;

  wrap.innerHTML = `
    <div class="docs-grid">
      <div class="docs-panel">
        <h3>Your document checklist</h3>
        <div class="docs-picks">
          <label>My passport:
            <select id="doc-nat">${NATIONALITIES.map(n => `<option>${n}</option>`).join("")}</select>
          </label>
          <label>Going to (select all that apply):
            <select id="doc-dest" multiple size="8">
              ${Object.entries(DEST_VISA_NOTES).map(([k, v]) => `<option value="${k}">${v.zone}</option>`).join("")}
            </select>
            <small>Hold Ctrl/Cmd for multiple</small>
          </label>
          <button class="btn" id="doc-gen">Build my checklist</button>
        </div>
        <div id="doc-out" class="doc-out"><div class="empty">Pick your passport and destinations, then build.</div></div>
      </div>

      <div class="docs-col">
        <div class="docs-panel">
          <h3>Don't know where yet? Get suggestions + docs</h3>
          <p class="docs-note">Say what you want (a vibe, a budget, anything). Relaxagent suggests places and lists exactly what each one needs from your passport.</p>
          <div class="docs-picks">
            <div class="wx-search">
              <input id="doc-vibe" type="text" autocomplete="off" maxlength="120"
                placeholder="quiet beach under 80 a day, foodie city, mountains…">
              <button class="btn" id="doc-suggest">Suggest</button>
            </div>
          </div>
          <div id="doc-sug-out" class="doc-out"><div class="empty">Suggestions appear here — with the documents each place needs.</div></div>
        </div>

        <div class="docs-panel">
          <h3>Visa rules for our destinations</h3>
          <p class="docs-note" style="margin-top:-0.4rem">Rules current as of 2026 — always confirm on the official source before booking.</p>
          ${Object.entries(DEST_VISA_NOTES).map(([k, v]) =>
            `<div class="doc-visa"><strong>${v.zone}</strong><p>${esc(v.note)}</p>
             <a href="${v.source}" target="_blank" rel="noopener">Official source ↗</a></div>`).join("")}
        </div>

        <div class="docs-panel">
          <h3>Agency red flags</h3>
          <p class="docs-note">For visas, documents and "travel agents" — how to spot a scammer before they get your money:</p>
          ${SCAM_FLAGS.map(([t, d]) => `<div class="doc-flag"><strong>⚠ ${esc(t)}</strong><p>${esc(d)}</p></div>`).join("")}
          <p class="docs-note"><strong>Good help exists:</strong> licensed travel agencies registered with a national association (ASTA in the US, ABTA in the UK), and the destination's official tourism board site. Verify the company number before paying anything.</p>
        </div>

        <div class="docs-panel">
          <h3>Official sources (bookmark these)</h3>
          ${OFFICIAL_LINKS.map(([t, u, d]) => `<div class="doc-visa"><strong><a href="${u}" target="_blank" rel="noopener">${esc(t)} ↗</a></strong><p>${esc(d)}</p></div>`).join("")}
        </div>
      </div>
    </div>`;

  wrap.querySelector("#doc-gen").addEventListener("click", () => {
    const nat = wrap.querySelector("#doc-nat").value;
    const dests = [...wrap.querySelectorAll("#doc-dest option:checked")].map(o => o.value);
    const out = wrap.querySelector("#doc-out");
    if (!dests.length) { out.innerHTML = '<div class="empty">Pick at least one destination.</div>'; return; }
    const items = checklist(nat, dests);
    out.innerHTML = `
      <p class="doc-count">${items.length} documents & preparations for a ${esc(nat)} passport → ${dests.map(d => DEST_VISA_NOTES[d].zone).join(", ")}</p>
      <ol class="doc-list">${items.map(([t, d]) => `<li><strong>${esc(t)}</strong><span>${esc(d)}</span></li>`).join("")}</ol>
      <p class="docs-note">Then ask Relaxagent: "what visa do I need for ${dests.length ? DEST_VISA_NOTES[dests[0]].zone : "my trip"}?" — and verify with the official links above.</p>`;
  });

  // ---- Suggest places + their docs (vibe search over the world index) ----
  const sugBtn = wrap.querySelector("#doc-suggest");
  const sugInput = wrap.querySelector("#doc-vibe");
  const sugOut = wrap.querySelector("#doc-sug-out");
  let worldIdx = null;
  sugBtn?.addEventListener("click", async () => {
    const q = (sugInput.value || "").trim();
    if (!q) { sugInput.focus(); return; }
    sugOut.innerHTML = '<div class="empty">Finding places that match…</div>';
    if (!worldIdx) {
      try { worldIdx = await (await fetch("data/kb/index.json")).json(); }
      catch { sugOut.innerHTML = '<div class="empty">Could not load destinations.</div>'; return; }
    }
    // light client scoring: words match tags/city/country (best_for folded into tags at build time)
    const words = q.toLowerCase().split(/[^a-z]+/).filter(w => w.length > 2);
    const scored = worldIdx.map(w => {
      let s = 0;
      for (const wd of words) {
        if (w.city.toLowerCase().includes(wd) || w.country.toLowerCase().includes(wd)) s += 5;
        if ((w.tags || []).some(t => t.includes(wd))) s += 4;
      }
      return { w, s };
    }).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 3);
    if (!scored.length) {
      sugOut.innerHTML = '<div class="empty">No match yet. Try: quiet, beach, mountains, food, budget, adventure, romantic…</div>';
      return;
    }
    // pull docs for the top matches
    const details = await Promise.all(scored.map(async x => {
      try { const raw = await (await fetch(`data/kb/${x.w.key}.json`)).json();
        return raw.deep && raw.deep.docs ? raw.deep : raw; }
      catch { return null; }
    }));
    sugOut.innerHTML = details.map((d, i) => d && d.docs ? `
      <div class="doc-sug">
        <div class="doc-sug-head"><span>${esc(d.flag)}</span><strong>${esc(d.city)}, ${esc(d.country)}</strong>
          <span class="doc-sug-price">$${d.prices.daily_budget}–${d.prices.daily_mid}/day</span></div>
        <p><strong>Entry:</strong> ${esc(d.docs.entry)}</p>
        <p><strong>Insurance:</strong> ${esc(d.docs.insurance)}</p>
        ${d.docs.special?.length ? `<p><strong>Bring:</strong> ${esc(d.docs.special.join(" · "))}</p>` : ""}
        <p><strong>Relaxagent says:</strong> ${esc(d.docs.agency)}</p>
      </div>` : "").join("");
  });
}
