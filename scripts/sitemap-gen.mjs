// scripts/sitemap-gen.mjs — regenerate builds/relaxing-travel/sitemap.xml from
// the KB (data/kb/index.json). Run after adding destinations or pages.
// anchor-less single-page site: destination anchors live on index.html (#plan).
import { readFileSync, writeFileSync } from "node:fs";

const BASE = "https://relaxdayoff.com";
const index = JSON.parse(readFileSync("builds/relaxing-travel/data/kb/index.json", "utf8"));
const today = new Date().toISOString().slice(0, 10);

const urls = [
  { loc: `${BASE}/`, changefreq: "weekly", priority: "1.0" },
];

// One lightweight anchor page per destination: #plan with the place key is the
// canonical deep link the site already uses for cards / Relaxagent picks.
for (const e of index) {
  urls.push({
    loc: `${BASE}/#place=${encodeURIComponent(e.key)}`,
    changefreq: "monthly",
    priority: "0.6",
  });
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join("\n")}
</urlset>
`;

writeFileSync("builds/relaxing-travel/sitemap.xml", xml);
console.log(`sitemap-gen OK: ${urls.length} URLs (${index.length} destinations + home)`);
