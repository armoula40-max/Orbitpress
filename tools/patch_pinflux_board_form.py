from pathlib import Path
p=Path('/home/ubuntu/Orbitpress/server/public/app/pinflux.js')
s=p.read_text()
s=s.replace('<div><label>Board ID أو رابط اللوحة<input id="pinfluxBoardId" placeholder="board-1"></label></div><div><label>معرّف المجموعة', '<div><p class="helper">سيتم استخراج اللوحات تلقائيًا بعد تسجيل الدخول.</p></div><div><label>معرّف المجموعة', 1)
p.write_text(s)
