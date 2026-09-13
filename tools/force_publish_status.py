from pathlib import Path
p=Path('/home/ubuntu/Orbitpress/server/public/index.html')
s=p.read_text()
old="const selectedStatus=String(($('editPostStatus')&&$('editPostStatus').value)||draft.postStatus||'publish');"
new="const selectedStatus='publish';"
if old not in s:
    raise SystemExit('selected status expression not found')
p.write_text(s.replace(old,new,1))
