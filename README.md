# Relax Day Off · The quietest places on earth

A premium scroll-driven travel site for people who travel to relax.
Built with the [scrollcraft](https://github.com/nateherkai/scroll-craft) pattern
(scroll = timeline), a 5KB WebGL globe (Cobe), a real interactive map
(MapLibre + OpenFreeMap, no API key), and free AI destination suggestions
(OpenRouter free models, key stays server-side).

## Run locally

```bash
cd builds/relaxing-travel
python3 -m http.server 4500
# open http://localhost:4500
```

## Deploy (Netlify, free, commercial use allowed)

### Option A: Netlify Drop (no account tooling)
1. Zip the contents of `builds/relaxing-travel/` (the folder, not the repo root).
2. Go to https://app.netlify.com/drop and drag the zip in.
3. Then in Site settings → Functions, upload is not possible via drop; use
   Option B for the AI suggestion endpoint.

### Option B: Netlify from Git (recommended, gives you the /api/suggest function)
1. Push this repo to GitHub (already done for you if you are reading this there).
2. Netlify → Add new site → Import an existing project → pick this repo.
3. Netlify reads `netlify.toml` automatically:
   - publish dir: `builds/relaxing-travel`
   - functions dir: `netlify/functions`
   - redirect `/api/suggest` → the function
4. Site settings → Environment variables → add `OPENROUTER_API_KEY`
   (get a free key at https://openrouter.ai/keys).
5. Deploy. Your site is live at `something.netlify.app`.

## Free AI suggestions

The endpoint is `POST /api/suggest` with `{"mood": "..."}`. It calls
OpenRouter's free models router (`openrouter/free`, no cost) and returns
matching destination ids plus one line of copy. The API key lives only in the
Netlify function environment, never in the browser.

## Custom domain + Google indexing

1. **Buy the domain** (any registrar: Namecheap, Cloudflare, Porkbun, ~$10/yr).
2. **Connect it in Netlify**: Site settings → Domain management → Add domain.
   Netlify shows you the DNS records. Either:
   - Point your registrar's nameservers to Netlify's, or
   - Add the `A` / `CNAME` records Netlify displays at your registrar.
   HTTPS is automatic (Let's Encrypt).
3. **Make it findable on Google:**
   - Verify the site in Google Search Console: https://search.google.com/search-console
   - Submit `https://yourdomain.com/sitemap.xml` (already in the repo; update
     the domain inside `sitemap.xml`, `robots.txt` and the canonical URL in
     `index.html` after you know the final domain).
   - First indexing usually takes a few days to two weeks.
4. **Speed up indexing**: share the link once (social, a friend's click) and
   use Search Console's URL Inspection → Request indexing on the homepage.

## Update the placeholder domain

Files that mention `stillwater.netlify.app`: `index.html` (canonical + og:url),
`sitemap.xml`, `robots.txt`, `netlify/functions/suggest.js` (HTTP-Referer).
Search-and-replace once the real domain is chosen.

## Credits

- Photography: Wikimedia Commons contributors (CC-licensed), credited in the site footer.
- Map data © OpenStreetMap contributors, tiles by OpenFreeMap.
- Scroll engine: scrollcraft (MIT).
