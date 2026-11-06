/* The Beer Depot: food and Local Favorites menu.
   Shared by the website and the Food Stock switches page. */
// Starting stock for the on/off switches, used only until a switch is first saved on
// the Food Stock page (/food-stock). Made Here items not listed start as In Stock;
// Local Favorites not listed start as whatever KORONA says.
const DEFAULT_STOCK = {
  "Shrimp Salad": true,
  "Chicken Salad": false,
  "Smoked Stuffed Meatloaf": false,
  "Buffalo Chicken Wings": false,
};

// Food made here, shown in two groups: "Meats" and "Sides".
// photo: a file in the img/food folder (leave "" until you have one).
// match: word(s) used to find this item's stock in KORONA.
// prices: each line is [label, price], e.g. ["Each","6.49"] or ["Per lb","9.99"].
// extras: add-ons listed under the item (same format as prices).
// Made Here groups, in the order they show. A note shows under the group's heading.
const FOOD_GROUPS = ["Meats","Sides","Take & Bake Pizza"];
const FOOD_GROUP_NOTES = {};
// Pizza toppings. Each one has its own switch in Store Tools (under "Edit Toppings");
// only toppings that are switched on are listed on the website.
const PIZZA_TOPPINGS = ["Pepperoni","Sausage","Ham","Bacon","Onion","Green Pepper","Mushroom","Black Olive","Banana Peppers","Jalapeño","Tomato"];
const toppingKey = t => "Topping: " + t;
const FOOD = [
  { group:"Meats", name:"Ribeye", match:"ribeye", photo:"", prices:[["Per lb","18.99"]] },
  { group:"Meats", name:"Smoked Ribs", match:"ribs", photo:"", prices:[["Per lb","9.99"]] },
  { group:"Meats", name:"Smoked Chicken Breast", desc:"Regular or Spicy", match:"chicken breast", photo:"chicken-breast.jpg", prices:[["Each","6.49"]] },
  { group:"Meats", name:"Smoked Pulled Pork", match:"pulled pork", photo:"pulled-pork.jpg", prices:[["Per lb","9.99"]] },
  { group:"Meats", name:"Smoked Pulled Chicken", match:"pulled chicken", photo:"pulled-chicken.jpg", prices:[["Per lb","7.99"]] },
  { group:"Meats", name:"Buffalo Chicken Wings", match:"wings", photo:"buffalo-wings.jpg", prices:[["6 Wings","7.00"]] },
  { group:"Meats", name:"Gyro Meat", label:"Gyro", match:"gyro", photo:"", prices:[["Per lb","9.99"]],
    extras:[["Pita","0.75"],["Onion & Tomato","1.75"],["Feta Cheese, Small","3.29"],["Tzatziki, Single Serving","0.75"],["Tzatziki, Small","2.99"],["Tzatziki, Large","4.99"]] },
  { group:"Meats", name:"Smoked Lasagna", match:"lasagna", photo:"smoked-lasagna.jpg", prices:[["Each","8.49"]] },
  { group:"Meats", name:"Smoked Stuffed Meatloaf", desc:"Stuffed with Cheesy Potatoes", match:"meatloaf", photo:"", prices:[["Each","9.99"]] },
  { group:"Meats", name:"Smoked Ham", desc:"Hot Ham on Sundays, 9 AM–3 PM. Daily Deal: 1 lb of Ham with 6 Grebe's Buns.", tag:"Hot on Sundays 9 AM–3 PM", match:"ham", photo:"",
    prices:[["Per lb","7.99"],["Deal: 1 lb + 6 Buns","9.49"]] },
  { group:"Sides", name:"Double-Baked Potato", match:"double baked", photo:"double-baked-potato.jpg", prices:[["Each","2.49"]] },
  { group:"Sides", name:"Smoked Mac & Cheese", match:"smoked mac", photo:"smoked-mac-and-cheese.jpg", prices:[["Each","6.49"]] },
  { group:"Sides", name:"Smoked Bacon & Jalapeño Mac & Cheese", match:"jalapeno mac", photo:"bacon-jalapeno-mac.jpg", prices:[["Each","8.49"]] },
  { group:"Sides", name:"Shrimp Salad", match:"shrimp salad", photo:"shrimp-salad.jpg", prices:[["Small","4.49"],["Large","6.99"]] },
  { group:"Sides", name:"Chicken Salad", match:"chicken salad", photo:"", prices:[["Small","4.99"],["Large","8.99"]] },
  { group:"Sides", name:"Italian Pasta Salad", match:"pasta salad", photo:"pasta-salad.jpg", prices:[["Small","4.49"],["Large","6.99"]] },
  { group:"Sides", name:"Potato Salad", match:"potato salad", photo:"potato-salad.jpg", prices:[["Small","2.99"],["Large","5.49"]] },
  { group:"Sides", name:"Smoked Beans", match:"beans", photo:"smoked-beans.jpg", prices:[["Small","2.99"],["Large","5.49"]] },
  { group:"Take & Bake Pizza", name:"14\" Take & Bake Pizza", match:"14 pizza", photo:"", prices:[["Each","16.00"]], toppings:true },
  { group:"Take & Bake Pizza", name:"12\" Take & Bake Pizza", match:"12 pizza", photo:"", prices:[["Each","13.00"]], toppings:true },
  { group:"Take & Bake Pizza", name:"10\" Gluten-Free Take & Bake Pizza", match:"gluten free pizza", photo:"", prices:[["Each","15.00"]], toppings:true },
];
// Local Favorites: cards like Made Here, grouped by who makes them. Shown to everyone.
// photo: a file in img/food. match: words that must all be in the KORONA product name.
// name: unique (used for the on/off switch). label: what the card shows under the maker heading.
const LOCAL = [
  { maker:"Northern Trails", where:"Watertown, WI", name:"Northern Trails Garlic Beef Stick", label:"Garlic Snack Stick", match:"northern garlic stick", photo:"northern-trails-garlic.jpg", prices:[["Each","10.99"]] },
  { maker:"Northern Trails", where:"Watertown, WI", name:"Northern Trails Jalapeño Cheddar Beef Stick", label:"Jalapeño Cheddar Snack Stick", match:"northern jalapeno cheddar stick", photo:"northern-trails-jalapeno-cheddar.jpg", prices:[["Each","10.99"]] },
  { maker:"Northern Trails", where:"Watertown, WI", name:"Northern Trails Pepper Jack Beef Stick", label:"Pepper Jack Snack Stick", match:"northern pepper jack stick", photo:"northern-trails-pepper-jack.jpg", prices:[["Each","10.99"]] },
  { maker:"Northern Trails", where:"Watertown, WI", name:"Northern Trails BBQ Beef Stick", label:"BBQ Snack Stick", match:"northern bbq stick", photo:"northern-trails-bbq.jpg", prices:[["Each","10.99"]] },
  { maker:"Northern Trails", where:"Watertown, WI", name:"Northern Trails Hot Wing Beef Stick", label:"Hot Wing Snack Stick", match:"northern hot wing stick", photo:"northern-trails-hot-wing.jpg", prices:[["Each","10.99"]] },
  { maker:"Northern Trails", where:"Watertown, WI", name:"Northern Trails Garlic Cheddar Beef Stick", label:"Garlic Cheddar Snack Stick", match:"northern garlic cheddar stick", photo:"northern-trails-garlic-cheddar.jpg", prices:[["Each","10.99"]] },
  { maker:"Northern Trails", where:"Watertown, WI", name:"Northern Trails Garlic Summer Sausage", label:"Garlic Summer Sausage", match:"northern garlic summer sausage", photo:"northern-trails-garlic-summer-sausage.jpg", prices:[["Each","10.99"]] },
  { maker:"Northern Trails", where:"Watertown, WI", name:"Northern Trails Regular Summer Sausage", label:"Regular Summer Sausage", match:"northern regular summer sausage", photo:"northern-trails-regular-summer-sausage.jpg", prices:[["Each","10.99"]] },
  { maker:"Northern Trails", where:"Watertown, WI", name:"Northern Trails Bacon", label:"Bacon", match:"northern bacon", photo:"northern-trails-bacon.jpg", prices:[["Each","8.99"]] },
  { maker:"Pernat's", where:"Ixonia, WI", name:"Pernat's Jalapeño Cheddar Beef Stick", label:"Jalapeño Cheddar Snack Stix", match:"pernat jalapeno cheddar stick", photo:"pernats-jalapeno-cheddar.jpg", prices:[["Each","8.99"]] },
  { maker:"Pernat's", where:"Ixonia, WI", name:"Pernat's Garlic Cheddar Beef Stick", label:"Garlic Cheddar Snack Stix", match:"pernat garlic cheddar stick", photo:"pernats-garlic-cheddar.jpg", prices:[["Each","8.99"]] },
  { maker:"Pernat's", where:"Ixonia, WI", name:"Pernat's Honey BBQ Beef Stick", label:"Honey BBQ Snack Stix", match:"pernat honey bbq stick", photo:"pernats-honey-bbq.jpg", prices:[["Each","8.99"]] },
  { maker:"Pernat's", where:"Ixonia, WI", name:"Pernat's Cheesy Sweet & Hot Beef Stick", label:"Cheesy Sweet & Hot Snack Stix", match:"pernat cheesy sweet hot stick", photo:"pernats-cheesy-sweet-hot.jpg", prices:[["Each","8.99"]] },
  { maker:"Kraemer", where:"Watertown, WI", name:"Kraemer 5 Year Cheddar", label:"5 Year Cheddar", match:"kraemer 5 year cheddar", photo:"kraemer-5-year-cheddar.jpg", prices:[["1 lb Block","9.99"]] },
  { maker:"Kraemer", where:"Watertown, WI", name:"Kraemer Medium Cheddar", label:"Medium Cheddar", match:"kraemer medium cheddar", photo:"kraemer-medium-cheddar.jpg", prices:[["1 lb Block","7.99"]] },
  { maker:"Kraemer", where:"Watertown, WI", name:"Kraemer Mild Brick", label:"Mild Brick", match:"kraemer mild brick", photo:"kraemer-mild-brick.jpg", prices:[["1 lb Block","7.99"]] },
  { maker:"Kraemer", where:"Watertown, WI", name:"Kraemer Gouda", label:"Gouda", match:"kraemer gouda", photo:"kraemer-gouda.jpg", prices:[["1 lb Block","7.99"]] },
  { maker:"Kraemer", where:"Watertown, WI", name:"Kraemer Swiss", label:"Swiss", match:"kraemer swiss", photo:"kraemer-swiss.jpg", prices:[["1 lb Block","7.99"]] },
  { maker:"Kraemer", where:"Watertown, WI", name:"Kraemer Hot Pepper Jack", label:"Hot Pepper Jack", match:"kraemer hot pepper jack", photo:"kraemer-hot-pepper-jack.jpg", prices:[["1 lb Block","7.99"]] },
  { maker:"Kraemer", where:"Watertown, WI", name:"Kraemer Colby Jack", label:"Colby Jack", match:"kraemer colby jack", photo:"kraemer-colby-jack.jpg", prices:[["1 lb Block","7.99"]] },
  { maker:"Kraemer", where:"Watertown, WI", name:"Kraemer Muenster", label:"Muenster", match:"kraemer muenster", photo:"kraemer-muenster.jpg", prices:[["1 lb Block","7.99"]] },
  { maker:"Kraemer", where:"Watertown, WI", name:"Kraemer Mozzarella", label:"Mozzarella", match:"kraemer mozzarella", photo:"kraemer-mozzarella.jpg", prices:[["1 lb Block","7.99"]] },
  { maker:"Sausage Haus", where:"Oconomowoc, WI", name:"Fresh Bacon Cheddar Brats", match:"bacon cheddar brat", photo:"", prices:[], tag:"Thu–Sun, Summer" },
  { maker:"Sausage Haus", where:"Oconomowoc, WI", name:"Fresh Hungarian Brats", match:"hungarian brat", photo:"", prices:[], tag:"Thu–Sun, Summer" },
  { maker:"Sausage Haus", where:"Oconomowoc, WI", name:"Burger Patties", match:"patt", photo:"", prices:[], tag:"Thu–Sun, Summer" },
  { maker:"Grebe's", where:"West Allis, WI", name:"Grebe's Better Butter Rolls", match:"grebe butter roll", photo:"grebes-butter-rolls.jpg", prices:[] },
  { maker:"Grebe's", where:"West Allis, WI", name:"Grebe's Brat Buns", label:"Grebe's Hotdog / Brat Buns", match:"grebe brat bun", photo:"grebes-brat-buns.jpg", prices:[] },
  { maker:"Grebe's", where:"West Allis, WI", name:"Grebe's White Bread Loaf", match:"grebe white bread", photo:"grebes-white-bread.jpg", prices:[] },
  { maker:"Grebe's", where:"West Allis, WI", name:"Grebe's Crullers", match:"grebe cruller", photo:"grebes-crullers.jpg", prices:[] },
  { maker:"Grebe's", where:"West Allis, WI", name:"Grebe's Mini Chocolate Covered Crullers", match:"grebe chocolate cruller", photo:"grebes-mini-chocolate-crullers.jpg", prices:[] },
];
// Grilling & Outdoor (fixed list). Prices here are the defaults; Store Tools can change them and switch items off.
const OUTDOOR = [
  { name:"Charcoal", match:"charcoal", prices:[["Each","12.99"]] },
  { name:"Cookin' Pellets, 40 lb Bag", match:"pellet perfect mix cherry apple hickory longhorn", prices:[["Per Bag","22.99"]],
    variants:["Perfect Mix","Cherry","Apple","Hickory","Longhorn Blend"] },
  { name:"Firewood Bundle", match:"firewood", prices:[["Each","6.49"]] },
  { name:"Lighter Fluid", match:"lighter fluid", prices:[] },
  { name:"Ice", match:"ice", prices:[["7 lb Bag","2.86"],["20 lb Bag","5.71"]] },
  { name:"Propane", match:"propane", prices:[["Tank Exchange","24.99"],["New Tank","79.99"]] },
];
const outdoorKey = n => "Outdoor: " + n;
const variantKey = (n, v) => "Outdoor: " + n + " – " + v;   // one switch per flavor

const MAKER_NOTES = {
  "Grebe's":"Fresh bakery rolls, buns, bread and crullers.", "Sausage Haus":"Fresh Thursday through Sunday, Memorial Day to Labor Day." };

// Edits made in Store Tools (saved in Netlify Blobs, no deploy needed). The built-in values above are the starting
// point; an edit wins. swEdits[key] = { label, photo } where photo is an uploaded photo id, "none" (picture removed)
// or empty (built-in photo). swPrices[key] = price rows. swToppings = the pizza topping list (null = the built-in list).
let swEdits = {}, swToppings = null;
const menuLabel  = (f, key) => ((swEdits[key||f.name]||{}).label) || f.label || f.name;
const menuPrices = (f, key) => (typeof swPrices!=="undefined" && swPrices[key||f.name]) || f.prices || [];
function menuPhoto(f, key){
  const e = swEdits[key||f.name] || {};
  if(e.photo === "none") return "";
  if(e.photo) return "/api/food-stock?photo=" + encodeURIComponent(e.photo);
  return f.photo ? ((typeof FOOD_PHOTOS!=="undefined" && FOOD_PHOTOS[f.photo]) || "/img/food/" + f.photo) : "";
}
const toppingList = () => swToppings || PIZZA_TOPPINGS;

// Made Here changes from Store Tools: added items, order, removed items and specials (see food-stock.mjs).
let swMenu = { custom:[], order:{}, removed:{}, specials:{}, makers:{}, newMakers:[], variants:{}, deleted:{}, groups:[] };
function setMenu(d){ d = d || {}; swMenu = { groups: d.groups||[], custom: d.custom||[], order: d.order||{}, removed: d.removed||{}, specials: d.specials||{}, makers: d.makers||{}, newMakers: d.newMakers||[], variants: d.variants||{}, deleted: d.deleted||{} }; }
const isRemoved = name => !!(swMenu.removed[name] || swMenu.deleted[name]);
const isDeleted = name => !!swMenu.deleted[name];
const allFood = () => [...FOOD, ...swMenu.custom.filter(c=>!c.maker && !c.outdoor)];
// Items in one Made Here group, in the saved order (new items go to the bottom until moved).
function foodItems(group, withRemoved){
  return ordered(allFood().filter(f=>groupOf(f)===group && (withRemoved || !isRemoved(f.name))), swMenu.order[group]);
}
function ordered(list, ord){
  ord = ord || [];
  const pos = (f,i) => { const x = ord.indexOf(f.name); return x<0 ? 1e6+i : x; };
  return list.map((f,i)=>[f,pos(f,i)]).sort((a,b)=>a[1]-b[1]).map(x=>x[0]);
}
const chicagoStamp = () => new Date().toLocaleString("sv-SE",{timeZone:"America/Chicago"}).slice(0,16).replace(" ","T");
// The special for an item if it's on now (it turns itself off at its end day and time, store time).
function specialOf(name){ const s = swMenu.specials[name]; if(!s || !s.on) return null; if(s.until && chicagoStamp() >= s.until) return null; return s; }

// Local Favorites: companies (built-in + added in Store Tools), their names and cities as edited, and their items in order.
// Order is saved under "local:<company>". A company's key never changes, even when it's renamed.
const makerKeys = () => [...new Set(LOCAL.map(l=>l.maker)), ...swMenu.newMakers.map(m=>m.id)];
const makerInfo = m => { const nm = swMenu.newMakers.find(x=>x.id===m), base = LOCAL.find(l=>l.maker===m) || {};
  const e = swMenu.makers[m] || {}; return { name: e.name || (nm ? nm.name : m), where: e.where != null ? e.where : (nm ? nm.where : base.where || "") }; };
const localItems = (m, withRemoved) => ordered([...LOCAL.filter(l=>l.maker===m), ...swMenu.custom.filter(c=>c.maker===m)].filter(l=>withRemoved || !isRemoved(l.name)), swMenu.order["local:"+m]);

// Grilling & Outdoor: built-in list + items added in Store Tools, in the saved order ("outdoor"). Removed/deleted are keyed "Outdoor: <name>".
const outdoorItems = withRemoved => ordered([...OUTDOOR, ...swMenu.custom.filter(c=>c.outdoor)].filter(g=>withRemoved ? !isDeleted(outdoorKey(g.name)) : !isRemoved(outdoorKey(g.name))), swMenu.order.outdoor);
// Flavors (like the pellets): [{v, note}] — edited in Store Tools, else the built-in list.
const flavorsOf = g => swMenu.variants[outdoorKey(g.name)] || (g.variants||[]).map(v=>({ v, note:"" }));

// Made Here groups: [{key, name, note}] in order. key never changes (items point to it); name is what shows. Edited in Store Tools.
const foodGroups = () => swMenu.groups.length ? swMenu.groups : FOOD_GROUPS.map(g=>({ key:g, name:g, note: FOOD_GROUP_NOTES[g] || "" }));
// An item's group: moved in Store Tools (edits[name].group) or its own.
const groupOf = f => ((typeof swEdits!=="undefined" && swEdits[f.name]) || {}).group || f.group;
