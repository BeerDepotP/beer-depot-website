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
    s = s.replace('<meta charset="utf-8">', '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">', 1)
    open(os.path.join(dst, p + '.dc.html'), 'w', encoding='utf8').write(s)
print('built', os.listdir(dst))
