from pathlib import Path
import re
import sys
html = Path(sys.argv[1]).read_text()
match = re.search(r'<script>(.*?)</script>', html, re.S)
if not match:
    raise SystemExit('script block not found')
Path('/tmp/orbitpress-webview.js').write_text(match.group(1))
print('/tmp/orbitpress-webview.js')
