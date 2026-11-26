#!/usr/bin/env python3
"""Serve src/ locally. Account verification remains required; no guest bypass."""
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
root = Path(__file__).resolve().parents[1] / 'src'
port = int(os.environ.get('PORT', '8000'))
handler = partial(SimpleHTTPRequestHandler, directory=str(root))
print(f'KrishiMitra: http://localhost:{port} (src/) — Ctrl+C to stop', flush=True)
ThreadingHTTPServer(('0.0.0.0', port), handler).serve_forever()
