from pathlib import Path
p=Path('/home/ubuntu/Orbitpress/server/public/app/pinflux.js')
s=p.read_text()
old='<section class="card"><div class="section-head"><div><h2>Pin الأصلي</h2><p>هذا النظام لا ينشئ Pin جديدًا؛ الخطة مخصصة لـSave / Repin.</p></div><span class="pinflux-pill">Save / Repin</span></div><label>Source Pin ID<input id="pinfluxSourcePin" placeholder="1234567890"></label></section>'
new='<section class="card"><div class="section-head"><div><h2>Pin الأصلي من الحساب الرئيسي</h2><p>لا تدخل Pin ID. حمّل Pins التي نشرها الحساب الرئيسي المتصل من Settings ثم اختر واحدًا منها.</p></div><button id="pinfluxLoadSourcePins" class="small-button" type="button">تحميل Pins المنشورة</button></div><label>Pin المصدر<select id="pinfluxSourcePin"><option value="">اضغط تحميل Pins المنشورة أولاً</option></select></label><p id="pinfluxSourceStatus" class="helper">المصدر هو الحساب الرئيسي المسجل في Settings، وليس حسابات التوزيع.</p></section>'
if old not in s:
    raise SystemExit('source section not found')
s=s.replace(old,new,1)
s=s.replace("$('pinfluxAddGroup').onclick=addGroup;$('pinfluxAddAccount').onclick=addAccount;$('pinfluxBuild').onclick=plan;$('pinfluxVerifySession').onclick=sessionStatus;load();sessionStatus();", "$('pinfluxAddGroup').onclick=addGroup;$('pinfluxAddAccount').onclick=addAccount;$('pinfluxBuild').onclick=plan;$('pinfluxVerifySession').onclick=sessionStatus;$('pinfluxLoadSourcePins').onclick=loadSourcePins;load();sessionStatus();")
p.write_text(s)
