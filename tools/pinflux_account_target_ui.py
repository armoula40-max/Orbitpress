from pathlib import Path
p=Path('/home/ubuntu/Orbitpress/server/public/app/pinflux.js')
s=p.read_text()
s=s.replace("<label>لوحة الحساب<select data-board-select=", "<label>لوحة الحساب (اختياري)<select data-board-select=", 1)
s=s.replace("state.accounts.filter(a=>a.enabled!==false&&a.connected&&a.boardId&&state.groups.some(g=>g.id===a.groupId))", "state.accounts.filter(a=>a.enabled!==false&&a.connected&&state.groups.some(g=>g.id===a.groupId))")
s=s.replace("تحقق من أن الحساب متصل، مفعّل، مرتبط بمجموعة، وتم اختيار لوحة له.", "تحقق من أن الحساب متصل، مفعّل، ومرتبط بمجموعة. اختيار اللوحة اختياري.")
s=s.replace("<span>${esc(x.boardId)}</span><span>${x.delaySeconds}s</span>", "<span>${x.targetType==='board'?`Board: ${esc(x.boardId)}`:'Account target'}</span><span>${x.delaySeconds}s</span>")
s=s.replace("الحساب متصل، مفعّل، مرتبط بمجموعة، وتم اختيار لوحة له", "الحساب متصل، مفعّل، ومرتبط بمجموعة؛ اللوحة اختيارية")
p.write_text(s)
