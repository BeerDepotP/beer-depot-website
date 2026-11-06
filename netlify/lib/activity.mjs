// Change log for Store Tools (shown in the Staff tab). Blob "activity" = [{ at, who, staff, text }], newest first.
const MAX = 500;
const q = s => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
const nm = s => q(String(s || "").replace(/^Outdoor: /, "").replace(/^Topping: /, "Topping "));

// What a request changes, in plain words (null = it only reads).
export function describe(area, b = {}) {
  const a = b.action;
  switch (area) {
    case "food":
      if (b.check) return null;
      if (typeof b.inStock === "boolean") return `${nm(b.name)}: ${b.inStock ? "In Stock" : "Out of Stock"}`;
      return ({ edit: `Edited ${nm(b.label || b.name)}`, toppings: "Changed the pizza toppings", addItem: `Added ${nm(b.label)}`,
        order: "Changed the order of items", removeItem: `Removed ${nm(b.name)} from the website`, restoreItem: `Put ${nm(b.name)} back on the website`,
        deleteItem: `Deleted ${nm(b.name)} forever`, special: b.on ? `Put ${nm(b.name)} on special` : `Took ${nm(b.name)} off special`,
        maker: `Edited the company ${nm(b.name)}`, addMaker: `Added the company ${nm(b.name)}`, deleteMaker: "Deleted a company",
        variants: `Changed the flavors of ${nm(b.name)}`, groups: "Changed the Made Here groups" })[a]
        || (Array.isArray(b.prices) ? `Changed prices for ${nm(b.name)}` : null);
    case "sales": return a === "save" ? `Saved Sales (${b.on ? "On" : "Off"})` : null;
    case "seasonal": return a === "save" ? `Saved Seasonal "${q(b.title)}" (${b.on ? "On" : "Off"})` : null;
    case "hours": return a === "save" ? (b.weekly ? "Changed the weekly hours" : "Changed a one-day hours change") : null;
    case "notify": return ({ settings: `Back in Stock emails: ${b.on ? "On" : "Off"}, wait ${b.delayMin} min`, form: "Changed the Back in Stock pop-up and email wording",
      clear: `Cleared everyone waiting on ${nm(String(b.key || "").slice(2))}`, removeEmail: `Removed ${q(b.email)} from a Back in Stock list` })[a] || null;
    case "layout": return a === "save" ? "Changed the website buttons" : a === "reset" ? "Put the website buttons back to standard" : null;
    case "banners": return a === "save" ? (b.announce ? `Announcement: ${b.announce.on ? "On" : "Off"}` : b.hotHam ? `Hot Ham banner: ${b.hotHam.on ? "On" : "Off"}` : "Changed the page wording") : null;
    case "insights": return a === "remove" || b.type === "remove" ? `Removed "${q(b.q || b.item)}" from ${({ top: "Top Searches", nofind: "Couldn't Find It", requests: "Requests" })[b.tab] || b.tab}` : null;
    case "club": return ({ remove: `Removed ${q(b.email)} from the Bourbon Club`, sending: `Bourbon Club weekly emails: ${b.on ? "On" : "Off"}`,
      schedule: "Changed the Bourbon Club send day and time", saveEmail: "Changed the Bourbon Club email wording", test: "Sent a Bourbon Club test email" })[a] || null;
    case "staff": return ({ add: `Added staff member ${q(b.name)}`, update: b.newPin ? "Changed a staff PIN" : b.on !== undefined ? `Turned a staff PIN ${b.on ? "on" : "off"}` : "Changed a staff member's tabs", remove: "Removed a staff member" })[a] || null;
  }
  return null;
}

export async function logChange(store, who, text) {
  if (!text || !who) return;
  try {
    const list = (await store.get("activity", { type: "json" })) || [];
    list.unshift({ at: new Date().toISOString(), who: who.owner ? "Owner" : who.name, staff: who.owner ? "" : who.id, text });
    await store.setJSON("activity", list.slice(0, MAX));
  } catch (e) { console.error("activity log", e); }
}
