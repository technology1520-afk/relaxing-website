# Relax Day Off — project.md

A travel site for people who travel to relax. AI plans the quietest trips
on earth: destination explorer, full trip planner, visa/document checklists,
price data, and a named AI assistant (Relaxagent).

- Repo: github.com/technology1520-afk/relaxing-website
- Domain: relaxdayoff.com (all files updated; no placeholder references left)
- Hosting: Netlify from Git (free tier), functions + Netlify Identity auth
- Dev server: `cd builds/relaxing-travel && python3 -m http.server 4500`

## What the site does

1. **World Explorer** — vibe search across 25 destinations (incl. 6 camping:
   Banff, Torres del Paine, Isle of Skye, Lake Tekapo, Sardinia, Wadi Rum), full world price
   tables (static JSON), detail modal, suggestion chips. "Don't know where yet"
   flow suggests places with their document requirements.
2. **Trip planner** — live weather, distances, local prices, fair-price checker,
   AI day-by-day itinerary.
3. **Documents & Visas** — checklist generator (45 nationalities), visa rules
   with official sources, agency-scam red flags, embassy/health links,
   per-city document requirements in all 18 city files.
4. **Relaxagent (AI assistant)** — floating context-aware assistant;
   local always-answers engine (no silent busy state), thinking dots,
   typewriter reveal. Powered by OpenRouter free models (`openrouter/free`),
   key stays server-side in Netlify functions.
5. **Auth** — Netlify Identity: sign-up, log-in, account page, auth-aware nav,
   auto-saved trips. "Continue with Google" button activates once the Google
   provider is enabled in Netlify Identity.
6. **Admin** — role-gated dashboard (admin.html), server-verified admin-data
   function, telemetry (Netlify Blobs store `stillwater-admin`) for AI calls,
   trips, signups, price checks.
7. **MCP API** — `/api/mcp` JSON-RPC endpoint, secret-token gated, for the
   owner's AI agent: 7 admin tools (5 telemetry + kb.get/kb.search).
   Machine-only by design.
8. **Knowledge base** — single source of truth for all destination facts in
   data/kb/*.json (25 destinations: 8 featured + 17 cities, kyoto merged);
   regenerated index + browser module via scripts/kb-build.mjs; validated by
   node --test tests/kb.test.js. Consumers: planner.js, explorer.js, docs.js,
   ask.js (via netlify/functions/_kb.js), and the MCP kb.get/kb.search tools.

## Design

Bright editorial (NatGeo / Airbnb Luxe direction) — light paper world, giant
type, chapter marks, ticker, boarding-pass signature move. Chosen after the
dark premium-minimal look was rejected. Built on the scrollcraft pattern
(scroll = timeline). WebGL globe (Cobe, 5KB) with graceful fallbacks; real
map via MapLibre + OpenFreeMap (no API key). Photography from Wikimedia
Commons (CC-licensed, credited in footer).

## Architecture

- `builds/relaxing-travel/` — publish dir (static site)
  - `index.html`, `scrollcraft.css/js`, `account/admin/log-in/sign-up.html`
  - `js/` — site.js, planner.js, explorer.js, assistant.js, docs.js, data.js
  - `data/prices/` — city price JSON (18 cities)
- `netlify/functions/` — suggest.js, plan.js, ask.js, admin-data.js,
  track.js, mcp.js, _log.js
- `netlify.toml` — redirects `/api/*` → functions; long-cache for `/assets/*`
- `BRIEF.md` — original design brief (scrollcraft journey beats)

## Environment variables

- `OPENROUTER_API_KEY` — free key from openrouter.ai/keys, set in Netlify
  site settings. Used by suggest/plan/ask functions.

## Pending / next steps

- Connect relaxdayoff.com in Netlify (Domain management → add domain → DNS),
  HTTPS is automatic.
- ~~Replace last placeholder `stillwater.netlify.app` in `sign-up.html`.~~
  Done in a228c40.
- Verify in Google Search Console, submit `/sitemap.xml`, request indexing.
- Enable Google provider in Netlify Identity for the Google sign-in button.

## Conventions

- No em dashes in site copy. No scroll cues, no section counters, one eyebrow max.
- Total page 8–14 viewport-heights; chaptered destination scenes.
- AI persona: Relaxagent. Wordmark: Relax Day Off.
