#!/usr/bin/env python3
"""Builds public/office/ (the web Back Office) from the Mac POS app's screens.
Run:  python3 tools/build_office.py [path/to/pos-app]
Copies Receive, Order and Settings + the POS runtime (support.js), adds the web bridge (office-boot.js as web-boot.js) and
removes the links to screens that are not on the web (register, reports ...)."""
import os, re, shutil, sys
here = os.path.dirname(os.path.abspath(__file__))
pos = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, '..', '..', 'pos-app'))
dst = os.path.join(here, '..', 'public', 'office')
os.makedirs(dst, exist_ok=True)
PAGES = ['Receive', 'Order', 'Settings']
GONE = 'Main|Analytics|Reports|TaxReport|Receipts|Transactions|Customers|GiftCards|Managers|CashDrawer|CardMachine|ReceiptDesigner|Buttons'
for f in os.listdir(dst):
    os.remove(os.path.join(dst, f))
shutil.copy(os.path.join(pos, 'app', 'support.js'), os.path.join(dst, 'support.js'))
shutil.copy(os.path.join(here, 'office-boot.js'), os.path.join(dst, 'web-boot.js'))
for p in PAGES:
    s = open(os.path.join(pos, 'app', p + '.dc.html'), encoding='utf8').read()
    assert '<script src="./support.js"></script>' in s, p
    s = s.replace('<script src="./support.js"></script>', '<script src="./web-boot.js"></script>')
    s = re.sub(r'<a href="(%s)\.dc\.html"[^>]*>.*?</a>\n?' % GONE, '', s, flags=re.S)
    s = re.sub(r'<div style="[^"]*">(Business)</div>\n?', '', s)
    s = s.replace('if (r.ok) { window.location.reload(); }', 'if (r.ok) { window.BDWeb.reloadWhenSaved(); }')
    s = s.replace('<meta charset="utf-8">', '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><link rel="manifest" href="/office/manifest.webmanifest"><link rel="icon" type="image/png" href="/office/icon-192.png"><link rel="apple-touch-icon" href="/office/apple-touch-icon.png"><meta name="theme-color" content="#12264E"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Beer Depot POS"><meta name="apple-mobile-web-app-status-bar-style" content="default">', 1)
    open(os.path.join(dst, p + '.dc.html'), 'w', encoding='utf8').write(s)
# Home-screen app (manifest + Beer Depot POS icon, same logo as the Mac app)
appdir = os.path.join(here, 'office-app')
for f in os.listdir(appdir):
    shutil.copy(os.path.join(appdir, f), os.path.join(dst, f))
print('built', os.listdir(dst))
