# The Beer Depot website — how we work

- Owner: The Beer Depot, Pewaukee WI. Hosted on Netlify (project "cute-salamander-50d302"), deployed from the `main` branch of this repo.
- **Every push to `main` is a Netlify production deploy and costs 15 credits.** The owner asked that changes be batched.
- Do all work on the `drafts` branch. Push `drafts` freely (it does not publish).
- Only merge `drafts` into `main` and push when the owner explicitly says to publish.
- Preview drafts without a deploy: run `python3 tools/build.py` and show `preview.html` (sample stock).
- Edit `tools/index.template.html`, then run `python3 tools/build.py` to regenerate `public/index.html`. Do not hand-edit `public/index.html`.
- Live stock comes from KORONA via `netlify/functions/stock.mjs`, which serves a saved copy from Blobs ("stock-latest") instantly and refreshes it in the background when over 60s old; `stock-refresh.mjs` also rebuilds it every 10 min, 6 AM–10 PM Central. Section rules live at the top of that file. Check sorting with `/api/stock?report=<REPORT_KEY>`.
- Store Tools at /food-stock (PIN in FOOD_PIN): tabs Food Stock (switches, Netlify Blobs), Couldn't Find It, Top Searches, Requests, with unread badges. No deploy needed for switch changes. Menu data: tools/menu.js. Functions: food-stock.mjs, insights.mjs, shared PIN check in netlify/lib/pin.mjs.
- Hot Ham banner: HOT_HAM in tools/index.template.html (Sunday 9 AM–3 PM). Home-screen icons in public/img + public/manifest.webmanifest.
- THC section (KORONA group THC) after Seltzers, 21+ only, auto-hides from 2026-12-11 (federal hemp THC limit) via `until` in SECTIONS.
- KORONA tags override sections (TAG_SECTIONS / HIDE_TAGS in stock.mjs). Tag "Allocated Bourbon" -> Whiskey & Bourbon, shown in its own box on the right (top on phones).
- Owner preferences: Title Case on names, labels and buttons ("Mac & Cheese", "Each", "In Stock"). Never show "Call to Check".

- Store info (ADDRESS, HOURS) is at the top of tools/index.template.html. New Arrivals: stock.mjs records each product's first in-stock date in Blobs (`first-stocked`); first run seeds everything as old.

## Waiting to go live (remind the owner when they say publish)
- Add `FOOD_PIN` in Netlify environment variables BEFORE publishing (Store Tools page needs it).
- Cloudflare Web Analytics: owner makes a free Cloudflare account, adds the site, and sends the beacon token; add the script tag to tools/index.template.html.
- Confirm the store address with the owner (they gave "N27 W26 N26980 Prospect Ave"; Waukesha County addresses are usually like N27W26980).
- Turn on Netlify Forms (Forms → Enable form detection) and the email notification for the `request` form.

## Future ideas the owner wants
- Online ordering + payment for FOOD ONLY (Made Here and catering), pickup in store. Orders would land in a new Store Tools "Orders" tab with a badge. Payment provider not chosen yet (Stripe or Square; ask whether their current card processor offers online payments).
