# Relax Day Off — Website Structure
relaxdayoff.com · github.com/technology1520-afk/relaxing-website
Updated: 2026-09-29

A travel site for people who travel to relax. AI plans the quietest trips
on earth. Bright editorial design (NatGeo / Airbnb Luxe direction), built on
the scrollcraft scroll-driven pattern.

============================================================

## 1. Repository layout

relaxing-website/
|
|-- builds/relaxing-travel/          THE PUBLIC SITE (Netlify publishes this)
|   |-- index.html                   Main one-page experience (982 lines)
|   |-- sign-up.html                 Create account (Netlify Identity)
|   |-- log-in.html                  Log in
|   |-- account.html                 "My trips" — saved trips for logged-in users
|   |-- admin.html                   Admin dashboard (admin role only)
|   |-- robots.txt / sitemap.xml     SEO (relaxdayoff.com)
|   |-- scrollcraft.css              Design system + scroll runtime styles
|   |-- scrollcraft.js               Scroll-driven interaction engine
|   |                                (pin/flow/pan acts, section drift colors)
|   |
|   |-- js/                          Feature modules (ES modules)
|   |   |-- site.js                  Nav, boarding-pass, account links, glues
|   |   |-- planner.js               Trip planner (weather, fair-price, AI days)
|   |   |-- explorer.js              World Explorer (vibe search + price tables)
|   |   |-- docs.js                  Documents & visas (checklist gen, scam edu)
|   |   |-- assistant.js             Relaxagent floating chat UI
|   |   |-- kb-data.js               GENERATED — full knowledge base as a module
|   |   |-- fair-price.js            Fair-price verdict bands
|   |
|   |-- data/
|   |   |-- kb/                      DESTINATION KNOWLEDGE BASE (source of truth)
|   |   |   |-- index.json           30-entry summary list (explorer + docs)
|   |   |   |-- <key>.json           One file per destination (30 total)
|   |
|   |-- assets/                      Hero/section photography (9 jpgs)
|   |-- out/                         Alternate image candidates
|   |-- lab/                         Design iteration screenshots (not shipped)
|   |-- BRIEF.md                     Original project brief
|
|-- netlify/functions/               SERVERLESS BACKEND (Node 22, CommonJS)
|   |-- ask.js                       POST /api/ask     — Relaxagent answers
|   |-- suggest.js                   POST /api/suggest — AI itinerary engine
|   |-- plan.js                      POST /api/plan    — trip planning AI
|   |-- admin-data.js                POST /api/admin-data — dashboard stats
|   |-- track.js                     POST /api/track   — telemetry events
|   |-- mcp.js                       POST /api/mcp     — MCP JSON-RPC (owner AI)
|   |-- _kb.js                       Shared KB reader (used by ask + mcp)
|   |-- _log.js                      Shared Blobs logging helper
|   |-- package.json                 @netlify/blobs dependency
|
|-- scripts/
|   |-- kb-build.mjs                 Validates data/kb + regenerates
|                                    index.json and js/kb-data.js
|
|-- tests/
|   |-- kb.test.js                   5 tests: schema, uniqueness, geo ranges,
|                                    generated-file sync, featured set. Run:
|                                    node --test tests/kb.test.js
|
|-- netlify.toml                     Publish=builds/relaxing-travel,
|                                    functions=netlify/functions, /api/* redirects
|-- project.md                       Project notes and open items
`-- .hermes/plans/                   Plans (e.g. the knowledge-base plan)

============================================================

## 2. The one-page experience (index.html, top to bottom)

1.  Hero            — interactive globe (cobe), "the quietest trips on earth"
2-9. Eight featured destination sections, one per scroll act:
     iceland (Blue Lagoon) · lofoten · faroe · whitehaven · napali ·
     wadirum · yasawa · kyoto (Ryōan-ji)
     Each: full-bleed image, best view, best months, crowds, kid notes,
     prices, live 5-day weather (Open-Meteo), tick-box "add to plan"
10. Plan             — day-by-day AI itinerary for ticked places
     (days count, who's going, budget feel -> /api/plan)
     Export: "Print / Save PDF" (print-ready page with a destination
     cheat-sheet) and "Add to calendar (.ics)" — one event per day,
     also offered per saved trip on account.html
11. World Explorer   — vibe/budget search box over ALL 30 destinations,
     every-card price rows, per-city detail modal (11 data sections)
12. Documents & visas — checklist generator (45 nationalities), visa rules
     with official sources, agency-scam red flags, "don't know where yet"
     suggestion flow
13. Find your calm   — second globe; type one sentence about your week,
     Relaxagent matches you to a place
14. Atlas            — MapLibre world map of every destination

Floating UI:
- Boarding pass (left edge) — journey progress, "stamped" places
- Relaxagent bubble (bottom right) — floating AI chat -> /api/ask
- Auth-aware nav: "My trips" appears when logged in

============================================================

## 3. The knowledge base (data/kb/) — single source of truth

30 destinations: 8 featured (kind: "featured") + 22 cities (kind: "city").

Featured (planner sections + visa notes): iceland, lofoten, faroe,
whitehaven, napali, wadirum, yasawa, kyoto

Cities: bali-ubud, banff, barcelona, cape-town, chiang-mai, cusco, hoi-an,
isle-of-skye, kotor, lake-tekapo, lisbon, marrakech, medellin, mexico-city,
pokhara, queenstown, reykjavik, santorini, sardinia, tbilisi,
torres-del-paine, zanzibar-stone-town

Camping destinations (tag "camping"): banff, torres-del-paine, isle-of-skye,
lake-tekapo, sardinia, wadirum

Entry shape (every file):
{
  "key": "lake-tekapo",         // ascii slug = filename
  "kind": "city" | "featured",
  "name": "Lake Tekapo",
  "city": "Lake Tekapo",        // explorer card label
  "country": "New Zealand",
  "flag": "🇳🇿",
  "lat": -44.0, "lng": 170.48, "tz": "Pacific/Auckland",
  "currency": "NZD (~1.64 per $1)",
  "bestMonths": "...", "crowd": "...",           // featured-style narrative
  "bestView"/"kid"/"adventure"/"kidPicks"/"priceNote",  // featured entries
  "prices": { meal, coffee, taxi, hotel, attraction },  // headline USD
  "daily_budget": 65, "daily_mid": 140,          // per-day USD
  "priceLevel": "cheap"|"moderate"|"pricey",
  "best_for": [...], "tags": [...],              // search + vibe matching
  "visa": { zone, note, source },                // featured entries only
  "deep": { ... }                                // city detail (see below)
}

"deep" holds the full per-city detail (shown in the explorer modal):
prices (12+ items incl. campsite, hot_pools), groceries, leisure,
transport_extra, activities, monthly budgets, seasons, notes, airports,
docs { entry, insurance, special[], health, agency }

Data flow rule: edit files in data/kb/ -> run `node scripts/kb-build.mjs`
-> it validates everything and regenerates data/kb/index.json +
js/kb-data.js -> commit all three. Never edit kb-data.js by hand.
Tests (node --test tests/kb.test.js) enforce the schema and sync.

============================================================

## 4. Backend API (netlify/functions -> /api/* redirects)

POST /api/ask       Relaxagent Q&A. Grounded in KB facts via _kb.js AND in the
                    visitor's planned trip (who, days, places, budget) sent
                    from the browser — answers are personal to their journey.
                    Falls back to a local always-answers engine (no silent
                    busy). Logs to telemetry.
POST /api/suggest   Itinerary engine for "don't know where yet" + planner.
POST /api/plan      Day-by-day trip plan generation.
POST /api/admin-data Dashboard stats (role-verified).
POST /api/track     Telemetry events -> Netlify Blobs store "stillwater-admin"
                    (ai_calls, trips, price_checks, signups).
POST /api/mcp       MCP JSON-RPC 2.0, Bearer-token gated. 7 tools:
                    site.stats, trips.list, questions.list, signups.list,
                    pricechecks.list, kb.get, kb.search.

AI provider: AI_BASE_URL (default https://api.xkiro.com/v1) +
AI_MODEL (default openai/gpt-6-luna) + AI_API_KEY, set in the Netlify UI.
OPENROUTER_API_KEY still honored as fallback. Keys never reach the browser.

Auth: Netlify Identity (email + "Continue with Google" once the Google
provider is enabled in the dashboard). Admin = admin role gates admin.html
and /api/admin-data.

============================================================

## 5. Common tasks

Add/edit a destination:
  1. Create/update builds/relaxing-travel/data/kb/<key>.json
  2. node scripts/kb-build.mjs
  3. node --test tests/kb.test.js   (expect: # pass 5)
  4. git add -A && git commit && git push   (Netlify auto-deploys)

Run locally:
  cd builds/relaxing-travel && python3 -m http.server 4500
  -> http://localhost:4500
  (functions need `netlify dev` instead)

Validate the KB only:        node --test tests/kb.test.js
Regenerate derived files:    node scripts/kb-build.mjs
