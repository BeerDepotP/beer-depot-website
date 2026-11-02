import json
S={
"vodka":[("Tito's Handmade Vodka 750ml",1),("Tito's Handmade Vodka 1.75L",1),("Smirnoff No. 21 1.75L",1),("Absolut 750ml",1),("Grey Goose 750ml",0),("New Amsterdam 1.75L",1),("Ketel One 750ml",1),("Deep Eddy Lemon 750ml",0)],
"gin":[("Tanqueray London Dry 750ml",1),("Bombay Sapphire 750ml",1),("Hendrick's 750ml",0),("Gordon's 1.75L",1),("Aviation 750ml",1)],
"whiskey":[("Jim Beam 1.75L",1),("Jack Daniel's Old No. 7 750ml",1),("Buffalo Trace 750ml",0),("Maker's Mark 750ml",1),("Crown Royal 750ml",1),("Jameson Irish Whiskey 750ml",1),("Woodford Reserve 750ml",1),("Evan Williams 1.75L",1),("Bulleit Bourbon 750ml",0),("Fireball Cinnamon Whisky 750ml",1)],
"rum":[("Captain Morgan Original Spiced 1.75L",1),("Bacardi Superior 750ml",1),("Malibu Coconut 750ml",1),("Kraken Black Spiced 750ml",0),("Sailor Jerry 750ml",1)],
"wine":[("Barefoot Moscato 1.5L",1),("Josh Cabernet Sauvignon 750ml",1),("Kendall-Jackson Chardonnay 750ml",1),("La Marca Prosecco 750ml",1),("Apothic Red 750ml",0),("Sutter Home White Zinfandel 1.5L",1)],
"liqueur":[("Kahlúa 750ml",1),("Baileys Original Irish Cream 750ml",1),("Dr. McGillicuddy's Mentholmint 750ml",1),("RumChata 750ml",1),("Jägermeister 750ml",0),("Southern Comfort 750ml",1)],
"brandy":[("Korbel California Brandy 750ml",1),("Korbel California Brandy 1.75L",1),("Christian Brothers 1.75L",1),("E&J VS Brandy 750ml",0),("Coronet VSQ 1.75L",1)],
"cocktails":[("Cutwater Tequila Margarita 4pk",1),("Cutwater Spicy Bloody Mary 4pk",0),("On The Rocks Old Fashioned 375ml",1),("Jack Daniel's & Coca-Cola 4pk",1),("Crown Royal Washington Apple 4pk",1)],
"tequila":[("Patrón Silver 750ml",1),("Casamigos Blanco 750ml",1),("Jose Cuervo Especial Gold 1.75L",1),("1800 Reposado 750ml",0),("Espolòn Blanco 750ml",1),("Don Julio Blanco 750ml",1)],
"beer":[("New Glarus Spotted Cow 12pk",1),("New Glarus Moon Man 6pk",1),("Miller Lite 30pk cans",1),("Miller High Life 24pk",1),("Busch Light 30pk cans",1),("Leinenkugel's Summer Shandy 12pk",0),("Lakefront Riverwest Stein 6pk",1),("Coors Light 18pk cans",1),("Modelo Especial 12pk",1),("Spotted Cow 6pk bottles",0),("Pabst Blue Ribbon 24pk",1),("Twisted Tea Original 12pk",1)],
"seltzer":[("High Noon Vodka Variety 8pk",1),("High Noon Tequila Lime 4pk",0),("White Claw Variety #1 12pk",1),("Truly Wild Berry 12pk",1),("Bud Light Seltzer Variety 12pk",0),("Leinenkugel's Seltzer 12pk",1)],
"outdoor":[("Kingsford Charcoal 16lb",1),("Cookin Pellets Perfect Mix 40lb",1),("Cookin Pellets Cherry 40lb",0),("Firewood Bundle",1),("Kingsford Lighter Fluid 32oz",1),("Ice 7lb",1),("Ice 20lb",1),("Propane Exchange",1),("Propane Tank New",0)],
"food":[("Ribs (half rack)",1),("Chicken Breast",1),("Pulled Pork lb",1),("Pulled Chicken lb",0),("Chicken Wings 1 dozen",1),("Stuffed Meatloaf",1),("Smoked Lasagna",1),("Smoked Mac and Cheese",1),("Smoked Bacon Jalapeno Mac",0),("Smoked Ham lb",1),("Gyro Meat lb",1),("Ribeye lb",1),("Shrimp Salad Small",1),("Shrimp Salad Large",0),("Italian Pasta Salad Lg",1),("Potato Salad Small",1),("Smoked Beans Large",0),("Smoked Beans Small",0),("Double Baked Potato",1)],
}
items=[{"name":n,"section":s,"inStock":bool(i)} for s,l in S.items() for n,i in l]
json.dump({"updated":None,"items":items},open("sample-stock.json","w"),indent=0)
print(len(items))
