// Shared server-side reader for the destination knowledge base.
// Source of truth: builds/relaxing-travel/data/kb/*.json (same files the site serves).
const { readdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

const KB_DIR = join(__dirname, "..", "..", "builds", "relaxing-travel", "data", "kb");
let cache = null;

function all() {
  if (cache) return cache;
  cache = {};
  for (const f of readdirSync(KB_DIR)) {
    if (f.endsWith(".json") && f !== "index.json") {
      const e = JSON.parse(readFileSync(join(KB_DIR, f), "utf8"));
      cache[e.key] = e;
    }
  }
  return cache;
}

// Compact projection for AI prompts (replaces the old hand-written blob in ask.js).
function promptEntry(e) {
  if (!e) return null;
  const p = e.prices && Object.keys(e.prices).length
    ? Object.entries(e.prices).map(([k, v]) => `${k} $${v}`).join(", ") : null;
  return {
    key: e.key, kind: e.kind,
    name: e.name, country: e.country, lat: e.lat, lng: e.lng,
    bestMonths: e.bestMonths, crowd: e.crowd, kid: e.kid || null,
    bestView: e.bestView || null, prices: p, priceNote: e.priceNote || null,
    visa: e.visa ? `${e.visa.note} (source: ${e.visa.source})` : null,
    daily_mid: e.daily_mid || null, tags: e.tags || [],
  };
}

module.exports = {
  all,
  get: key => promptEntry(all()[key]),
  featured: () => Object.values(all()).filter(e => e.kind === "featured").map(promptEntry),
  search: q => {
    const needle = String(q).toLowerCase();
    return Object.values(all()).filter(e =>
      [e.key, e.name, e.country, ...(e.tags || [])].join(" ").toLowerCase().includes(needle)
    ).slice(0, 8).map(promptEntry);
  },
};
