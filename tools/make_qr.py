#!/usr/bin/env python3
"""Make a QR code PNG for any link — for the deck, poster or WhatsApp.

    python3 tools/make_qr.py "https://your-site.netlify.app" out.png
"""
import sys, qrcode
from qrcode.constants import ERROR_CORRECT_M

url = sys.argv[1] if len(sys.argv) > 1 else "https://krishimitra-3yhhsgby.manus.space"
out = sys.argv[2] if len(sys.argv) > 2 else "qr.png"

qr = qrcode.QRCode(version=None, error_correction=ERROR_CORRECT_M, box_size=12, border=3)
qr.add_data(url)
qr.make(fit=True)
img = qr.make_image(fill_color="#0F5132", back_color="white")
img.save(out)
print(f"wrote {out}  →  {url}")
