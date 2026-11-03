# The Beer Depot website — how we work

- Owner: The Beer Depot, Pewaukee WI. Hosted on Netlify (project "cute-salamander-50d302"), deployed from the `main` branch of this repo.
- **Every push to `main` is a Netlify production deploy and costs 15 credits.** The owner asked that changes be batched.
- Do all work on the `drafts` branch. Push `drafts` freely (it does not publish).
- Only merge `drafts` into `main` and push when the owner explicitly says to publish.
- Preview drafts without a deploy: run `python3 tools/build.py` and show `preview.html` (sample stock).
- Edit `tools/index.template.html`, then run `python3 tools/build.py` to regenerate `public/index.html`. Do not hand-edit `public/index.html`.
- Live stock comes from KORONA via `netlify/functions/stock.mjs`. Section rules live at the top of that file. Check sorting with `/api/stock?report=<REPORT_KEY>`.
- Made Here and Local Favorites stock is set by the owner on /food-stock (Netlify Blobs, PIN in FOOD_PIN); no deploy needed for those changes. Menu data: tools/menu.js.
- Owner preferences: Title Case on names, labels and buttons ("Mac & Cheese", "Each", "In Stock"). Never show "Call to Check".
