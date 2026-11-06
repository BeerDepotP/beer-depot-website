"""Builds two versions of the site from index.template.html:
  - preview.html  : one self-contained file with sample stock (for the claude.ai preview)
  - public/index.html : the real site, which loads live stock from /api/stock
"""
import datetime
import base64, json, pathlib

here = pathlib.Path(__file__).parent
root = here.parent
tpl = (here / "index.template.html").read_text()
logo_b64 = base64.b64encode((root / "public/img/logo-orange.png").read_bytes()).decode()
sample = json.loads((here / "sample-stock.json").read_text())
menu = (here / "menu.js").read_text()
tpl = tpl.replace("__MENU__", menu)
(root / "public/menu.js").write_text(menu)   # used by the Food Stock switches page
# Built-in Local Favorites items by company, for the weekly restock (netlify/functions/grebes-restock.mjs).
# defaults must match RESTOCK_DEFAULTS in tools/menu.js. Store Tools → Edit Company can change them.
import re as _re
makers = {}
for mk, nm in _re.findall(r'maker:"([^"]+)"[^}]*?name:"([^"]+)"', menu): makers.setdefault(mk, []).append(nm)
(root / "netlify/lib/restock.json").write_text(json.dumps({"makers": makers, "defaults": {"Grebe's": {"on": True, "day": 4, "time": "09:00"}}}, indent=1))

def b64(name): return "data:image/png;base64," + base64.b64encode((root / "public/img" / name).read_bytes()).decode()
preview = (tpl
    .replace("__ANALYTICS__", "")
    .replace("__FAV32__", b64("favicon-32.png")).replace("__FAV64__", b64("favicon-64.png")).replace("__ATI__", b64("apple-touch-icon.png"))
    .replace("__LOGO__", "data:image/png;base64," + logo_b64)
    .replace("__STOCK_URL__", "null")
    .replace("__SAMPLE_DATA__", "const SAMPLE = " + json.dumps(sample) + ";")
    .replace("__PREVIEW_ALL_IN__", "const PREVIEW_ALL_IN = true;")
    .replace("__SAMPLE_SALES__", "const SAMPLE_SALES = " + json.dumps([
        {"name":"Spotted Cow 12pk Cans","price":"15.99","was":"18.99","note":"While supplies last","img":"data:image/jpeg;base64,"+base64.b64encode((root/"public/img/food/smoked-beans.jpg").read_bytes()).decode()},
        {"name":"Tito's Vodka 1.75L","price":"34.99","was":"39.99"},
        {"name":"Smoked Pulled Pork","price":"8.49","was":"9.99","note":"Per lb, this weekend only","img":"data:image/jpeg;base64,"+base64.b64encode((root/"public/img/food/pulled-pork.jpg").read_bytes()).decode()}]) + ";")
    .replace("__SAMPLE_SEASONAL__", "const SAMPLE_SEASONAL = " + json.dumps({"on":True,"title":"Christmas","items":[
        {"name":"Ham Dinner Tray","price":"39.99","note":"Order by Dec 20","img":"data:image/jpeg;base64,"+base64.b64encode((root/"public/img/food/pulled-pork.jpg").read_bytes()).decode()},
        {"name":"Holiday Cheese Box","price":"24.99"}]}) + ";")
    .replace("__SAMPLE_HOURS__", "const SAMPLE_HOURS = " + json.dumps([
        {"date":(datetime.date.today()+datetime.timedelta(days=2)).isoformat(),"closed":False,"open":"09:00","close":"15:00","note":"Short hours, staff party"},
        {"date":"2026-12-25","closed":True,"open":"","close":"","note":"Merry Christmas! See you Friday"}]) + ";")
    .replace("__SAMPLE_SITE__", "const SAMPLE_SITE = " + json.dumps({"announce":{"on":True,"text":"Now Taking Thanksgiving Orders: Smoked Turkeys and Hams","link":"#catering","color":"red"}}) + ";")
    .replace("__SAMPLE_MENU__", "setMenu(" + json.dumps({"specials":{"Smoked Pulled Pork":{"on":True,"prices":[["Per lb","7.99"]],"until":(datetime.date.today()+datetime.timedelta(days=3)).isoformat()+"T20:00"}}}) + ");")
    .replace("__FOOD_PHOTOS__", "const FOOD_PHOTOS = " + json.dumps({f.name: "data:image/jpeg;base64," + base64.b64encode(f.read_bytes()).decode() for f in (root / "public/img/food").glob("*.jpg")}) + ";")
    .replace("__PREVIEW_FLAG__", '<div class="preview-flag">Preview with sample stock. Live KORONA stock gets connected next.</div>'))
(root / "preview.html").write_text(preview)

CF_ANALYTICS = """<!-- Cloudflare Web Analytics --><script type='module' src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "cd24811a3d354fd790e06bfa577590e1"}'></script><!-- End Cloudflare Web Analytics -->"""
live = (tpl
    .replace("__ANALYTICS__", CF_ANALYTICS)
    .replace("__FAV32__", "/img/favicon-32.png").replace("__FAV64__", "/img/favicon-64.png").replace("__ATI__", "/img/apple-touch-icon.png")
    .replace("__LOGO__", "img/logo-orange.png")
    .replace("__STOCK_URL__", '"/api/stock"')
    .replace("__SAMPLE_DATA__", "const SAMPLE = null;")
    .replace("__FOOD_PHOTOS__", "const FOOD_PHOTOS = {};")
    .replace("__PREVIEW_ALL_IN__", "const PREVIEW_ALL_IN = false;")
    .replace("__SAMPLE_SALES__", "const SAMPLE_SALES = [];")
    .replace("__SAMPLE_SEASONAL__", "const SAMPLE_SEASONAL = null;")
    .replace("__SAMPLE_HOURS__", "")
    .replace("__SAMPLE_MENU__", "")
    .replace("__SAMPLE_SITE__", "")
    .replace("__PREVIEW_FLAG__", ""))
(root / "public/index.html").write_text(live)
print("built preview.html and public/index.html")
