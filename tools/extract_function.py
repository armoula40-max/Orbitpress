from pathlib import Path
import sys
source = Path(sys.argv[1]).read_text()
name = sys.argv[2]
start = source.find(f"function {name}")
if start < 0:
    raise SystemExit(f"missing: {name}")
end = source.find("function ", start + len(name) + 9)
print(source[start:end if end >= 0 else None])
