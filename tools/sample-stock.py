import json
ALLOC_EXTRA=["Weller 12","Eagle Rare 10","Elmer T. Lee","Rock Hill Farms","Old Fitzgerald BiB","Michter's 10","Weller Full Proof","Blood Oath","Penelope Rio"]
S={
"vodka":[("Tito's Handmade Vodka 750ml",1),("Tito's Handmade Vodka 1.75L",1),("Smirnoff No. 21 1.75L",1),("Absolut 750ml",1),("Grey Goose 750ml",0),("New Amsterdam 1.75L",1),("Ketel One 750ml",1),("Deep Eddy Lemon 750ml",0)],
"gin":[("Tanqueray London Dry 750ml",1),("Bombay Sapphire 750ml",1),("Hendrick's 750ml",0),("Gordon's 1.75L",1),("Aviation 750ml",1)],
"whiskey":[("Jim Beam 1.75L",1),("Jack Daniel's Old No. 7 750ml",1),("Buffalo Trace 750ml",0),("Maker's Mark 750ml",1),("Crown Royal 750ml",1),("Jameson Irish Whiskey 750ml",1),("Woodford Reserve 750ml",1),("Evan Williams 1.75L",1),("Bulleit Bourbon 750ml",0),("Fireball Cinnamon Whisky 750ml",1),("Blanton's Single Barrel 750ml",0),("Weller Special Reserve 750ml",1),("E.H. Taylor Small Batch 750ml",1),("Stagg Jr 750ml",0)]+[(f"{n} 750ml",i%2) for i,n in enumerate(["Weller 12","Eagle Rare 10","Elmer T. Lee","Rock Hill Farms","Old Fitzgerald BiB","Michter's 10","Weller Full Proof","Blood Oath","Penelope Rio"])],
"rum":[("Captain Morgan Original Spiced 1.75L",1),("Bacardi Superior 750ml",1),("Malibu Coconut 750ml",1),("Kraken Black Spiced 750ml",0),("Sailor Jerry 750ml",1)],
"wine":[("Barefoot Moscato 1.5L",1),("Josh Cabernet Sauvignon 750ml",1),("Kendall-Jackson Chardonnay 750ml",1),("La Marca Prosecco 750ml",1),("Apothic Red 750ml",0),("Sutter Home White Zinfandel 1.5L",1)],
"liqueur":[("Kahlúa 750ml",1),("Baileys Original Irish Cream 750ml",1),("Dr. McGillicuddy's Mentholmint 750ml",1),("RumChata 750ml",1),("Jägermeister 750ml",0),("Southern Comfort 750ml",1)],
"brandy":[("Korbel California Brandy 750ml",1),("Korbel California Brandy 1.75L",1),("Christian Brothers 1.75L",1),("E&J VS Brandy 750ml",0),("Coronet VSQ 1.75L",1)],
"cocktails":[("Cutwater Tequila Margarita 4pk",1),("Cutwater Spicy Bloody Mary 4pk",0),("On The Rocks Old Fashioned 375ml",1),("Jack Daniel's & Coca-Cola 4pk",1),("Crown Royal Washington Apple 4pk",1)],
"tequila":[("Patrón Silver 750ml",1),("Casamigos Blanco 750ml",1),("Jose Cuervo Especial Gold 1.75L",1),("1800 Reposado 750ml",0),("Espolòn Blanco 750ml",1),("Don Julio Blanco 750ml",1)],
"beer":[("New Glarus Spotted Cow 12pk",1),("New Glarus Moon Man 6pk",1),("Miller Lite 30pk cans",1),("Miller High Life 24pk",1),("Busch Light 30pk cans",1),("Leinenkugel's Summer Shandy 12pk",0),("Lakefront Riverwest Stein 6pk",1),("Coors Light 18pk cans",1),("Modelo Especial 12pk",1),("Spotted Cow 6pk bottles",0),("Pabst Blue Ribbon 24pk",1),("Twisted Tea Original 12pk",1)],
"nonalc":[("Athletic Run Wild IPA 6pk",1),("Heineken 0.0 6pk",1),("Fre Cabernet Sauvignon 750ml",1),("Ritual Zero Proof Whiskey Alternative 750ml",0),("Lyre's Italian Spritz 700ml",1),("Fre Brut Sparkling Wine 750ml",1),("Athletic Upside Dawn Golden 6pk",1)],
"thc":[("Lakefront High Jinx THC Lemonade 4pk",1),("Cann Blood Orange Cardamom 6pk",1),("Wynk Black Cherry Lime 4pk",0)],
"mixers":[("Coca-Cola 12pk cans",1),("Canada Dry Ginger Ale 2L",1),("Fever-Tree Ginger Beer 4pk",1),("Zing Zang Bloody Mary Mix 32oz",1),("Mr & Mrs T Margarita Mix 1L",0),("Jarritos Grapefruit Paloma",1),("Ocean Spray Cranberry Juice 64oz",1),("LaCroix Lime 12pk",1),("Schweppes Tonic Water 1L",1),("Squirt Paloma Mix 1L",1),("Sprite 2L",1),("Filthy Old Fashioned Mix 32oz",1),("Red Bull 4pk",1),("Monster Energy 16oz",1),("Celsius Sparkling Orange",0),("Martini & Rossi Sweet Vermouth 750ml",1),("Dolin Dry Vermouth 750ml",1)],
"seltzer":[("High Noon Vodka Variety 8pk",1),("High Noon Tequila Lime 4pk",0),("White Claw Variety #1 12pk",1),("Truly Wild Berry 12pk",1),("Bud Light Seltzer Variety 12pk",0),("Leinenkugel's Seltzer 12pk",1)],
"local":[("Northern Trails Beef Stick Original",1),("Northern Trails Summer Sausage",1),("Northern Trails Bacon 1lb",0),("Pernats Beef Stick",1),("Kreamers Cheese Curds",1),("Sausage Haus Bacon Cheddar Brats",1),("Sausage Haus Hungarian Brats",0),("Lake Country Honey 12oz",1),("Wisconsin Cheese Curds Squeaky",1)],
"outdoor":[("Kingsford Charcoal 16lb",1),("Cookin Pellets Perfect Mix 40lb",1),("Cookin Pellets Cherry 40lb",0),("Firewood Bundle",1),("Kingsford Lighter Fluid 32oz",1),("Ice 7lb",1),("Ice 20lb",1),("Propane Exchange",1),("Propane Tank New",0)],
"food":[("Ribs (half rack)",1),("Chicken Breast",1),("Pulled Pork lb",1),("Pulled Chicken lb",0),("Chicken Wings 1 dozen",1),("Stuffed Meatloaf",1),("Smoked Lasagna",1),("Smoked Mac and Cheese",1),("Smoked Bacon Jalapeno Mac",0),("Smoked Ham lb",1),("Gyro Meat lb",1),("Ribeye lb",1),("Shrimp Salad Small",1),("Shrimp Salad Large",0),("Italian Pasta Salad Lg",1),("Potato Salad Small",1),("Smoked Beans Large",0),("Smoked Beans Small",0),("Double Baked Potato",1)],
}
import random
random.seed(4)
S["beer"] += [(f"{b} {k}",int(random.random()>.25)) for b in ["Lakefront","Third Space","Good City","MobCraft","Leinenkugel's","Central Waters","Karben4","Hacienda"] for k in ["IPA 6pk","Lager 12pk","Seasonal 6pk","Amber 6pk","Stout 4pk"]]
items=[{"name":n,"section":s,"inStock":bool(i)} for s,l in S.items() for n,i in l]
for it in items:
    if it["name"] in ("Blanton's Single Barrel 750ml","Weller Special Reserve 750ml","E.H. Taylor Small Batch 750ml","Stagg Jr 750ml") or it["name"] in [f"{n} 750ml" for n in ALLOC_EXTRA]: it["allocated"]=True
    if it["section"]=="mixers":
        n=it["name"].lower(); it["sub"] = "vermouth" if "vermouth" in n else "bloody" if "bloody" in n else "margarita" if "margarita" in n else "other" if "paloma" in n else "oldfashioned" if "old fashion" in n else "energy" if any(w in n for w in ["red bull","monster","celsius"]) else "tonic" if any(w in n for w in ["tonic","ginger ale","lacroix","club"]) else "juice" if "juice" in n else "soda"
    if it["section"]=="mixers" and it.get("sub")=="soda": it["inStock"]=True
    if it["section"]=="nonalc":
        n=it["name"]; it["sub"] = "wine" if ("Fre" in n or "Wine" in n) else "spirits" if ("Ritual" in n or "Lyre" in n) else "beer"
    if it["name"] in ("Hacienda IPA 6pk","Good City Lager 12pk","Kendall-Jackson Chardonnay 750ml","Casamigos Blanco 750ml"): it["isNew"]=True
json.dump({"updated":None,"items":items},open("sample-stock.json","w"),indent=0)
print(len(items))
