// Shared server-side reader for the destination knowledge base.
// Data ships inside the functions bundle as _kb-data.generated.js — Lambda
// cannot read repo files at runtime, so no filesystem access is needed.
// Regenerate with: node scripts/sync-kb-bundle.js
const DATA = require("./_kb-data.generated.js");

let cache = null;

function all() {
  if (cache) return cache;
  cache = { ...DATA };
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
