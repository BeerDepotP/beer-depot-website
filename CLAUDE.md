# The Beer Depot website — how we work

- Owner: The Beer Depot, Pewaukee WI. Domain: beerdepotpewaukee.com (bought through Netlify 2026-11-03). Hosted on Netlify (project "cute-salamander-50d302"), deployed from the `main` branch of this repo.
- **Every push to `main` is a Netlify production deploy and costs 15 credits.** The owner asked that changes be batched.
- Do all work on the `drafts` branch. Push `drafts` freely (it does not publish).
- Only merge `drafts` into `main` and push when the owner explicitly says to publish.
- Preview drafts without a deploy: run `python3 tools/build.py` and show `preview.html` (sample stock).
- Edit `tools/index.template.html`, then run `python3 tools/build.py` to regenerate `public/index.html`. Do not hand-edit `public/index.html`.
- Live stock comes from KORONA via `netlify/functions/stock.mjs`, which serves a saved copy from Blobs ("stock-latest") instantly and refreshes it in the background when over 60s old; `stock-refresh.mjs` also rebuilds it every 10 min, 6 AM–10 PM Central. Section rules live at the top of that file. Check sorting with `/api/stock?report=<REPORT_KEY>`.
- Store Tools at /food-stock (PIN in FOOD_PIN): tabs Food Stock (switches, Netlify Blobs), Specials (This Week's Specials banner, up to 5 lines, specials.mjs), Couldn't Find It, Top Searches, Requests, with unread badges. No deploy needed for switch changes. Menu data: tools/menu.js. Functions: food-stock.mjs, insights.mjs, shared PIN check in netlify/lib/pin.mjs.
- Hot Ham banner: HOT_HAM in tools/index.template.html (Sunday 9 AM–3 PM). Home-screen icons in public/img + public/manifest.webmanifest.
- Grilling & Outdoor always shows In Stock (template). Soda (Soda & Mixers → Soda) always shows In Stock, even without KORONA stock history (stock.mjs `alwaysIn`).
- THC section (KORONA group THC) after Seltzers, 21+ only, auto-hides from 2026-12-11 (federal hemp THC limit) via `until` in SECTIONS.
- KORONA tags override sections (TAG_SECTIONS / HIDE_TAGS in stock.mjs). Tag "Allocated Bourbon" -> Whiskey & Bourbon, shown in its own box on the right (top on phones).
- Local Favorites makers: Northern Trails & Kraemer (Watertown), Pernat's (Ixonia), Sausage Haus (Oconomowoc), Grebe's (West Allis). Each flavor is its own card/switch; `name` is the unique switch key, `label` is what shows.
- Any KORONA group or product with "DO NOT USE" (or DNU) in its name is always skipped (RETIRED in stock.mjs). Owner retired groups this way, e.g. "DO NOT USE SODA", "DO NOT USE JUICE".
- Owner preferences: Title Case on names, labels and buttons ("Mac & Cheese", "Each", "In Stock"). Never show "Call to Check".

- FOOD_PIN is set in Netlify. Owner confirmed the address as written: "N27 W26 N26980 Prospect Ave, Pewaukee, WI 53072".
- Cloudflare Web Analytics token is in tools/build.py (live site only, not on Store Tools or the preview).
- Store info (ADDRESS, HOURS) is at the top of tools/index.template.html. New Arrivals: stock.mjs records each product's first in-stock date in Blobs (`first-stocked`); first run seeds everything as old.

## Waiting to go live (remind the owner when they say publish)
- Netlify Forms detection is ON (owner enabled it 2026-11-03). Still to do: email notification for the `request` form.

## Future ideas the owner wants
- Online ordering + payment for FOOD ONLY (Made Here and catering), pickup in store. Orders would land in a new Store Tools "Orders" tab with a badge. Payment provider not chosen yet (Stripe or Square; ask whether their current card processor offers online payments).
