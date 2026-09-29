// Trip export: turn a planned trip into something usable outside the site.
// Two formats: a print-ready page (browser "Save as PDF") and a calendar
// (.ics) that drops the days into Google Calendar / Apple Calendar.
// No dependencies, no server round-trip — the trip object is already in hand.

import { PLACE_DATA } from "./kb-data.js";

const SITE = "https://relaxdayoff.com";

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}

// ICS escapes per RFC 5545
function icsEsc(s) {
  return String(s == null ? "" : s)
    .replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function tripFacts(key) {
  const p = PLACE_DATA[key];
  return p ? { name: p.name, bestMonths: p.bestMonths, crowd: p.crowd, currency: p.currency } : null;
}

// ---------- Print / PDF ----------
export function openPrintable(trip) {
  if (!trip || !Array.isArray(trip.days) || !trip.days.length) return;
  const w = window.open("", "_blank", "width=760,height=900");
  if (!w) { alert("Allow pop-ups to export your trip."); return; }

  const placeLines = (trip.placeKeys || []).map(k => {
    const f = tripFacts(k);
    if (!f) return "";
    return `<tr><td><strong>${esc(f.name)}</strong></td><td>${esc(f.bestMonths)}</td><td>${esc(f.crowd)}</td><td>${esc(f.currency)}</td></tr>`;
  }).join("");

  w.document.write(`<!doctype html><html><head><meta charset="utf-8">
<title>${esc(trip.title)} — Relax Day Off</title>
<style>
  body { font: 15px/1.55 Georgia, serif; color: #1d1a14; max-width: 640px; margin: 40px auto; padding: 0 20px; }
  h1 { font-size: 30px; margin: 0 0 4px; }
  h2 { font-size: 18px; margin: 28px 0 10px; border-bottom: 2px solid #1d1a14; padding-bottom: 4px; }
  .sub { color: #6E675C; margin: 0 0 26px; }
  .day { margin: 16px 0; page-break-inside: avoid; }
  .dnum { display: inline-block; font-size: 12px; letter-spacing: .1em; text-transform: uppercase;
          border: 1px solid #1d1a14; border-radius: 999px; padding: 2px 10px; margin-bottom: 4px; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #ddd; vertical-align: top; }
  th { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #6E675C; }
  .budget { background: #F3EFE7; border-radius: 10px; padding: 12px 16px; margin-top: 8px; }
  footer { margin-top: 36px; font-size: 12px; color: #6E675C; }
  @media print { body { margin: 12mm auto; } }
</style></head><body>
<h1>${esc(trip.title)}</h1>
<p class="sub">${esc(trip.subtitle || "")}</p>
${trip.days.map(d => `
  <div class="day">
    <span class="dnum">Day ${d.day}</span>
    <h2 style="border:none;margin:6px 0 2px;">${esc(d.title)}</h2>
    <p>${esc(d.plan)}</p>
  </div>`).join("")}
${trip.budget ? `<h2>Budget feel</h2><div class="budget">${esc(trip.budget)}</div>` : ""}
${placeLines ? `<h2>Destination cheat-sheet</h2>
<table><tr><th>Place</th><th>Best months</th><th>Crowd tip</th><th>Currency</th></tr>${placeLines}</table>` : ""}
<footer>Planned with Relaxagent at ${SITE} — check opening days and book the first night before you fly.</footer>
<script>window.onload = () => setTimeout(() => window.print(), 400);<\/script>
</body></html>`);
  w.document.close();
}

// ---------- Calendar (.ics) ----------
export function downloadICS(trip) {
  if (!trip || !Array.isArray(trip.days) || !trip.days.length) return;
  const start = trip.startDate ? new Date(trip.startDate + "T12:00:00") : nextSaturday();
  const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0",
    "PRODID:-//Relax Day Off//Trip Planner//EN",
    "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
  ];
  trip.days.forEach((d, i) => {
    const day = new Date(start); day.setDate(start.getDate() + i);
    const dt = day.toISOString().split("T")[0].replace(/-/g, "");
    lines.push(
      "BEGIN:VEVENT",
      `UID:rdo-${Date.now()}-${i}@relaxdayoff.com`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${dt}`,
      `DTEND;VALUE=DATE:${dt}`,
      `SUMMARY:${icsEsc(`Day ${d.day}: ${d.title} — ${trip.title}`)}`,
      `DESCRIPTION:${icsEsc(d.plan + (trip.budget ? `\n\nBudget feel: ${trip.budget}` : "") + `\n\nPlanned by Relaxagent — ${SITE}`)}`,
      "END:VEVENT",
    );
  });
  lines.push("END:VCALENDAR");
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (trip.title || "relax-trip").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + ".ics";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function nextSaturday() {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  d.setHours(12, 0, 0, 0);
  return d;
}

// ---------- Shared UI ----------
export function exportButtons(trip, target) {
  const bar = document.createElement("div");
  bar.className = "export-bar";
  bar.innerHTML = `
    <button type="button" class="export-btn" data-x="print">Print / Save PDF</button>
    <button type="button" class="export-btn" data-x="ics">Add to calendar (.ics)</button>
    <span class="export-hint">Take the plan with you.</span>`;
  bar.querySelector('[data-x="print"]').addEventListener("click", () => openPrintable(trip));
  bar.querySelector('[data-x="ics"]').addEventListener("click", () => downloadICS(trip));
  (target || (trip.days && trip.days.length ? document.querySelector(".plan-out") : null))?.appendChild(bar);
}
