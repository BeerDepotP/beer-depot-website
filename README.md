# The Beer Depot website

This folder is the whole website. It has two parts:

- **public/**: the pages customers see (`index.html`, the logo, and food photos in `img/food/`).
- **netlify/functions/stock.mjs**: a small private program that reads your stock from KORONA Studio once a minute and gives the website a simple list: product name, section, and whether it's in stock. Your KORONA login stays in it and never reaches customers' browsers.

## Putting it online (about 15 minutes)

### 1. Make a read-only API login in KORONA Studio
1. Go to **Settings → Data Exchange → APIv3**.
2. Under **API Accesses**, click **Add**.
3. Name it `website` and set a username and a strong password.
4. Turn on **read** permission only for **products, commodity groups, organizational units and stocks**. Leave everything else off.
5. Save. Write down the username and password somewhere safe. Don't email or text them.

### 2. Create a free Netlify account and upload the site
Netlify's drag-and-drop upload skips the stock program, so use their command-line tool instead. You only have to do this once.
1. Sign up at netlify.com.
2. Install Node.js (the "LTS" version) from nodejs.org.
3. Unzip this folder, open it, then right-click an empty spot and choose **Open in Terminal**.
4. Run `npx netlify-cli login` and approve the login in your browser.
5. Run `npx netlify-cli deploy --prod`. When it asks, choose **Create & configure a new project**, then press Enter to accept the defaults.

### 3. Add your KORONA details as private settings
In Netlify, open your site and go to **Site configuration → Environment variables**. Add these:

| Name | Value |
|---|---|
| `KORONA_ACCOUNT_ID` | the Account-ID shown on the APIv3 screen |
| `KORONA_HOST` | `185.koronacloud.com` |
| `KORONA_USER` | the API username from step 1 |
| `KORONA_PASSWORD` | the API password from step 1 |
| `REPORT_KEY` | any made-up word, used for the check in step 4 |

Then run `npx netlify-cli deploy --prod` again so the site picks up the settings.

### 4. Check it
Open `https://YOUR-SITE.netlify.app/api/stock?report=YOUR-REPORT-KEY`. You'll get a short report:

- **shown**: how many products are on the website
- **skippedNeverStocked**: catalog items that have never had stock (hidden, like you asked)
- **unmatchedGroups**: KORONA groups that didn't fit any section, such as tobacco, vapes and snacks

If a group that *should* be on the site shows up under unmatchedGroups, add it to `SECTION_BY_GROUP` near the top of `netlify/functions/stock.mjs`. For example, `{ "Spirits - Clear": "vodka" }`.

### 5. Use your own domain (optional)
In Netlify, go to **Domain management → Add a domain**, enter something like `thebeerdepotpewaukee.com` and follow the steps.

## Everyday changes

- **Food photos**: put the photo in `public/img/food/` (for example `ribs.jpg`), then in `public/index.html` find the `FOOD` list and set `photo:"ribs.jpg"` on that item. Prices for food are in the same list (`prices` and `extras`). Then run `npx netlify-cli deploy --prod` again.
- **Food stock**: each food item checks KORONA for a product whose name contains its `match` word (for example, `ribs`). Food products in KORONA need to be in a commodity group with a name like "Food", "Deli" or "Smoked", or one you add to `SECTION_BY_GROUP`.
- **What counts as "has had stock"**: the product has a stock record in KORONA, and it has either been received (it has a purchase price) or its count isn't zero. Everything else stays hidden.

## Sections and the KORONA groups they match
Vodka · Gin · Rum · Whiskey & bourbon (whiskey, bourbon, scotch, rye) · Liqueur (liqueur, cordials, schnapps) · Brandy (brandy, cognac) · Ready to drink cocktails · Tequila (tequila, mezcal) · Wine (wine, champagne, prosecco, sake) · Beer · Seltzers · Made Here (food, deli, smoked, meat) · Grilling & Outdoor (charcoal, pellets, firewood, lighter fluid, propane, grill, ice).
Tobacco and vapes are kept off the site.

## Request box
Customers can request products at the bottom of the site (item, name and phone number are required). Requests go to Netlify Forms (free).
- Turn it on once: in Netlify open **Forms → Enable form detection**, then redeploy.
- See requests: **Forms → request**.
- Get an email for each request: **Project configuration → Notifications → Emails and webhooks → Form submission notifications → Add notification → Email notification**, choose the `request` form.

## Food Stock switches
Go to `/food-stock` on the website (for example https://cute-salamander-50d302.netlify.app/food-stock) and enter the PIN.
Each Made Here and Local Favorites item has an on/off switch. Changes show on the website within a minute and do not need a deploy.
- Set the PIN once in Netlify: Environment variables → `FOOD_PIN` (mark it secret if your plan allows).
- After 8 wrong PINs, the page locks for 15 minutes.
- The menu itself (names, prices, photos) is in `tools/menu.js`.

## Store Tools (/food-stock)
One PIN-protected page with four tabs: **Food Stock** (on/off switches, the main tab), **Couldn't Find It**
(searches with no results), **Top Searches** and **Requests**. A red number on a tab shows new searches or
requests since that tab was last opened; opening the tab clears it (saved on the server, so it's the same on
every device). New rows are marked "New". `/searches` redirects here.

## KORONA tags
Tag a product in KORONA Studio to control where it shows on the website. Tags win over commodity groups.
- Section tags: Ready to Drink Cocktails (or Cocktails / RTD), Beer, Seltzers, Whiskey (or Bourbon), Wine, Tequila, Vodka, Brandy, Gin, Rum, Liqueur, Local Favorites, Grilling & Outdoor.
- `Hide From Website` keeps a product off the site.
- `Allocated Bourbon` puts a product in the Allocated Bourbon box beside Whiskey & Bourbon.
Tagged products in Local Favorites or Grilling & Outdoor that don't have a card show in a list under the cards.
