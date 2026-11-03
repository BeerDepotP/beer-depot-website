# The Beer Depot website — how we work

- Owner: The Beer Depot, Pewaukee WI. Hosted on Netlify (project "cute-salamander-50d302"), deployed from the `main` branch of this repo.
- **Every push to `main` is a Netlify production deploy and costs 15 credits.** The owner asked that changes be batched.
- Do all work on the `drafts` branch. Push `drafts` freely (it does not publish).
- Only merge `drafts` into `main` and push when the owner explicitly says to publish.
- Preview drafts without a deploy: run `python3 tools/build.py` and show `preview.html` (sample stock).
- Edit `tools/index.template.html`, then run `python3 tools/build.py` to regenerate `public/index.html`. Do not hand-edit `public/index.html`.
- Live stock comes from KORONA via `netlify/functions/stock.mjs`. Section rules live at the top of that file. Check sorting with `/api/stock?report=<REPORT_KEY>`.
- Store Tools at /food-stock (PIN in FOOD_PIN): tabs Food Stock (switches, Netlify Blobs), Couldn't Find It, Top Searches, Requests, with unread badges. No deploy needed for switch changes. Menu data: tools/menu.js. Functions: food-stock.mjs, insights.mjs, shared PIN check in netlify/lib/pin.mjs.
- Owner preferences: Title Case on names, labels and buttons ("Mac & Cheese", "Each", "In Stock"). Never show "Call to Check".

## Waiting to go live (remind the owner when they say publish)
- Add `FOOD_PIN` in Netlify environment variables BEFORE publishing (Store Tools page needs it).
- Cloudflare Web Analytics: owner makes a free Cloudflare account, adds the site, and sends the beacon token; add the script tag to tools/index.template.html.
- Turn on Netlify Forms (Forms → Enable form detection) and the email notification for the `request` form.
