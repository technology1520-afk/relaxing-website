// Regenerates netlify/functions/_kb-data.generated.js from the source of
// truth: builds/relaxing-travel/data/kb/*.json
// Run this after any KB change: node scripts/sync-kb-bundle.js
// (The functions bundle cannot read repo files at runtime on Netlify.)
const { readdirSync, readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..");
const KB_DIR = join(ROOT, "builds", "relaxing-travel", "data", "kb");
const OUT = join(ROOT, "netlify", "functions", "_kb-data.generated.js");

const entries = {};
for (const f of readdirSync(KB_DIR)) {
  if (f.endsWith(".json") && f !== "index.json") {
    const e = JSON.parse(readFileSync(join(KB_DIR, f), "utf8"));
    entries[e.key] = e;
  }
}
const banner = `// GENERATED FILE — do not edit. Run: node scripts/sync-kb-bundle.js\n// Source: builds/relaxing-travel/data/kb/*.json (${Object.keys(entries).length} entries)\nmodule.exports = `;
writeFileSync(OUT, banner + JSON.stringify(entries, null, 1) + ";\n");
console.log(`wrote ${OUT} with ${Object.keys(entries).length} entries`);
