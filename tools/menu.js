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
const FOOD = [
  { group:"Meats", name:"Ribeye", match:"ribeye", photo:"", prices:[["Per lb","18.99"]] },
  { group:"Meats", name:"Smoked Ribs", match:"ribs", photo:"", prices:[["Per lb","9.99"]] },
  { group:"Meats", name:"Smoked Chicken Breast", desc:"Regular or Spicy", match:"chicken breast", photo:"", prices:[["Each","6.49"]] },
  { group:"Meats", name:"Smoked Pulled Pork", match:"pulled pork", photo:"", prices:[["Per lb","9.99"]] },
  { group:"Meats", name:"Smoked Pulled Chicken", match:"pulled chicken", photo:"", prices:[["Per lb","7.99"]] },
  { group:"Meats", name:"Buffalo Chicken Wings", match:"wings", photo:"", prices:[["6 Wings","7.00"]] },
  { group:"Meats", name:"Gyro Meat", match:"gyro", photo:"", prices:[["Per lb","9.99"]],
    extras:[["Pita","0.75"],["Onion & Tomato","1.75"],["Feta Cheese, Small","3.29"],["Tzatziki, Single Serving","0.75"],["Tzatziki, Small","2.99"],["Tzatziki, Large","4.99"]] },
  { group:"Meats", name:"Smoked Lasagna", match:"lasagna", photo:"", prices:[["Each","8.49"]] },
  { group:"Meats", name:"Smoked Stuffed Meatloaf", desc:"Stuffed with Cheesy Potatoes", match:"meatloaf", photo:"", prices:[["Each","9.99"]] },
  { group:"Meats", name:"Smoked Ham", desc:"Hot Ham on Sundays. Daily Deal: 1 lb of Ham with 6 Grebe's Buns.", tag:"Hot on Sundays", match:"ham", photo:"",
    prices:[["Per lb","7.99"],["Deal: 1 lb + 6 Buns","9.49"]] },
  { group:"Sides", name:"Double-Baked Potato", match:"double baked", photo:"", prices:[["Each","2.49"]] },
  { group:"Sides", name:"Smoked Mac & Cheese", match:"smoked mac", photo:"", prices:[["Each","6.49"]] },
  { group:"Sides", name:"Smoked Bacon & Jalapeño Mac & Cheese", match:"jalapeno mac", photo:"", prices:[["Each","8.49"]] },
  { group:"Sides", name:"Shrimp Salad", match:"shrimp salad", photo:"", prices:[["Small","4.49"],["Large","6.99"]] },
  { group:"Sides", name:"Chicken Salad", match:"chicken salad", photo:"", prices:[["Small","4.99"],["Large","8.99"]] },
  { group:"Sides", name:"Italian Pasta Salad", match:"pasta salad", photo:"", prices:[["Small","4.49"],["Large","6.99"]] },
  { group:"Sides", name:"Potato Salad", match:"potato salad", photo:"", prices:[["Small","2.99"],["Large","5.49"]] },
  { group:"Sides", name:"Smoked Beans", match:"beans", photo:"", prices:[["Small","2.99"],["Large","5.49"]] },
];
// Local Favorites: cards like Made Here, grouped by who makes them. Shown to everyone.
// photo: a file in img/food. match: words that must all be in the KORONA product name.
const LOCAL = [
  { maker:"Northern Trails", where:"Watertown, WI", name:"Northern Trails Beef Sticks", match:"northern beef stick", photo:"", prices:[] },
  { maker:"Northern Trails", where:"Watertown, WI", name:"Northern Trails Summer Sausage", match:"northern summer sausage", photo:"", prices:[] },
  { maker:"Northern Trails", where:"Watertown, WI", name:"Northern Trails Bacon", match:"northern bacon", photo:"", prices:[] },
  { maker:"Pernat's", where:"Ixonia, WI", name:"Pernat's Beef Sticks", match:"pernat", photo:"", prices:[] },
  { maker:"Kreamer's", where:"", name:"Kreamer's Cheese", match:"kreamer", photo:"", prices:[] },
  { maker:"Sausage Haus", where:"Oconomowoc, WI", name:"Fresh Bacon Cheddar Brats", match:"bacon cheddar brat", photo:"", prices:[], tag:"Thu–Sun, Summer" },
  { maker:"Sausage Haus", where:"Oconomowoc, WI", name:"Fresh Hungarian Brats", match:"hungarian brat", photo:"", prices:[], tag:"Thu–Sun, Summer" },
  { maker:"Sausage Haus", where:"Oconomowoc, WI", name:"Burger Patties", match:"patt", photo:"", prices:[], tag:"Thu–Sun, Summer" },
  { maker:"Grebe's", where:"", name:"Grebe's Better Butter Rolls", match:"grebe butter roll", photo:"", prices:[] },
  { maker:"Grebe's", where:"", name:"Grebe's Brat Buns", match:"grebe brat bun", photo:"", prices:[] },
  { maker:"Grebe's", where:"", name:"Grebe's White Bread Loaf", match:"grebe white bread", photo:"", prices:[] },
  { maker:"Grebe's", where:"", name:"Grebe's Crullers", match:"grebe cruller", photo:"", prices:[] },
  { maker:"Grebe's", where:"", name:"Grebe's Mini Chocolate Covered Crullers", match:"grebe chocolate cruller", photo:"", prices:[] },
];
const MAKER_NOTES = {
  "Grebe's":"Fresh bakery rolls, buns, bread and crullers.", "Sausage Haus":"Fresh Thursday through Sunday, Memorial Day to Labor Day." };
