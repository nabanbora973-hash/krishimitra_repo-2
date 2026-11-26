#!/usr/bin/env python3
"""Copy current assets to dist/. Never substitutes auth or generates a guest build."""
from pathlib import Path
import shutil
root = Path(__file__).resolve().parents[1]
destination = root / 'dist'
shutil.rmtree(destination, ignore_errors=True)
shutil.copytree(root / 'src', destination)
assert (destination / '.well-known/assetlinks.json').is_file()
print('Static deployment copied to dist/; index.html is at root.')
