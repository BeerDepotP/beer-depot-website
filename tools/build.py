"""Builds two versions of the site from index.template.html:
  - preview.html  : one self-contained file with sample stock (for the claude.ai preview)
  - public/index.html : the real site, which loads live stock from /api/stock
"""
import base64, json, pathlib

here = pathlib.Path(__file__).parent
root = here.parent
tpl = (here / "index.template.html").read_text()
logo_b64 = base64.b64encode((root / "public/img/logo-orange.png").read_bytes()).decode()
sample = json.loads((here / "sample-stock.json").read_text())
menu = (here / "menu.js").read_text()
tpl = tpl.replace("__MENU__", menu)
(root / "public/menu.js").write_text(menu)   # used by the Food Stock switches page

def b64(name): return "data:image/png;base64," + base64.b64encode((root / "public/img" / name).read_bytes()).decode()
preview = (tpl
    .replace("__ANALYTICS__", "")
    .replace("__FAV32__", b64("favicon-32.png")).replace("__FAV64__", b64("favicon-64.png")).replace("__ATI__", b64("apple-touch-icon.png"))
    .replace("__LOGO__", "data:image/png;base64," + logo_b64)
    .replace("__STOCK_URL__", "null")
    .replace("__SAMPLE_DATA__", "const SAMPLE = " + json.dumps(sample) + ";")
    .replace("__PREVIEW_FLAG__", '<div class="preview-flag">Preview with sample stock. Live KORONA stock gets connected next.</div>'))
(root / "preview.html").write_text(preview)

CF_ANALYTICS = """<!-- Cloudflare Web Analytics --><script type='module' src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "cd24811a3d354fd790e06bfa577590e1"}'></script><!-- End Cloudflare Web Analytics -->"""
live = (tpl
    .replace("__ANALYTICS__", CF_ANALYTICS)
    .replace("__FAV32__", "/img/favicon-32.png").replace("__FAV64__", "/img/favicon-64.png").replace("__ATI__", "/img/apple-touch-icon.png")
    .replace("__LOGO__", "img/logo-orange.png")
    .replace("__STOCK_URL__", '"/api/stock"')
    .replace("__SAMPLE_DATA__", "const SAMPLE = null;")
    .replace("__PREVIEW_FLAG__", ""))
(root / "public/index.html").write_text(live)
print("built preview.html and public/index.html")
