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

preview = (tpl
    .replace("__LOGO__", "data:image/png;base64," + logo_b64)
    .replace("__STOCK_URL__", "null")
    .replace("__SAMPLE_DATA__", "const SAMPLE = " + json.dumps(sample) + ";")
    .replace("__PREVIEW_FLAG__", '<div class="preview-flag">Preview with sample stock. Live KORONA stock gets connected next.</div>'))
(root / "preview.html").write_text(preview)

live = (tpl
    .replace("__LOGO__", "img/logo-orange.png")
    .replace("__STOCK_URL__", '"/api/stock"')
    .replace("__SAMPLE_DATA__", "const SAMPLE = null;")
    .replace("__PREVIEW_FLAG__", ""))
(root / "public/index.html").write_text(live)
print("built preview.html and public/index.html")
