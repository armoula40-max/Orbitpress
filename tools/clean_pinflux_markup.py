from pathlib import Path
p=Path('/home/ubuntu/Orbitpress/server/public/app/pinflux.js')
s=p.read_text().replace('\\"','"')
p.write_text(s)
