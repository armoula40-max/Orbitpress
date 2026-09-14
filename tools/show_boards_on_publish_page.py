from pathlib import Path
p=Path('/home/ubuntu/Orbitpress/server/public/index.html')
s=p.read_text()
old='''<button id="publishPinterest" class="button secondary" type="button" ${images.pinterest?'':'disabled'}>نشر الصورة على Pinterest</button>'''
new='''<button id="publishPinterest" class="button secondary" type="button" ${images.pinterest?'':'disabled'}>نشر الصورة على Pinterest</button><label for="publishPinterestBoard">اختر بورد Pinterest للنشر</label><select id="publishPinterestBoard"><option value="">جارٍ تحميل البوردات…</option></select><p id="publishPinterestBoardStatus" class="helper">يتم تحميل بوردات الحساب المتصل.</p>'''
if old not in s: raise SystemExit('published pinterest button not found')
s=s.replace(old,new,1)
# Use the visible page-level select first, with the studio select as fallback.
old_call="const boardSelect=$('pinPublishBoard');const boardId=String((boardSelect&&boardSelect.value)||draft.pinterestBoardId||state.settingsSummary?.pinterestBoardId||'').trim();"
new_call="const boardSelect=$('publishPinterestBoard')||$('pinPublishBoard');const boardId=String((boardSelect&&boardSelect.value)||draft.pinterestBoardId||state.settingsSummary?.pinterestBoardId||'').trim();"
if old_call not in s: raise SystemExit('board selection call not found')
s=s.replace(old_call,new_call,1)
# Bind page-level button and load boards even when the canvas/studio is not mounted.
old_tail="const pinterestButton=$('publishPinterest');if(pinterestButton)pinterestButton.onclick=()=>publishDraftToPinterest(draft.id);mountPinStudio(draft);mountSeoPanel(draft)}"
new_tail="const pinterestButton=$('publishPinterest');if(pinterestButton)pinterestButton.onclick=()=>publishDraftToPinterest(draft.id);if($('publishPinterestBoard'))loadPublishBoards(draft,'publishPinterestBoard','publishPinterestBoardStatus');mountPinStudio(draft);mountSeoPanel(draft)}"
if old_tail not in s: raise SystemExit('renderReview tail not found')
s=s.replace(old_tail,new_tail,1)
# Make loader accept either the page-level or studio-level IDs and keep both in sync.
old_sig="async function loadPublishBoards(draft){\n      const select=$('pinPublishBoard'),status=$('pinPublishBoardStatus');"
new_sig="async function loadPublishBoards(draft,selectId='pinPublishBoard',statusId='pinPublishBoardStatus'){\n      const select=$(selectId),status=$(statusId);"
if old_sig not in s: raise SystemExit('loader signature not found')
s=s.replace(old_sig,new_sig,1)
# Always persist the choice; publish page and studio can each call the same loader.
p.write_text(s)
