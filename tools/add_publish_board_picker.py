from pathlib import Path
p=Path('/home/ubuntu/Orbitpress/server/public/index.html')
s=p.read_text()

# Add a board picker directly below the Pinterest publish button.
needle="<button id=\"pinPublish\" class=\"button\" type=\"button\" ${draft.publishedUrl?'':'disabled'}>${draft.pinterestPinUrl?'📌 نشر دبوس آخر':'📌 نشر الدبوس على Pinterest'}</button></section>`}"
replacement="<button id=\"pinPublish\" class=\"button\" type=\"button\" ${draft.publishedUrl?'':'disabled'}>${draft.pinterestPinUrl?'📌 نشر دبوس آخر':'📌 نشر الدبوس على Pinterest'}</button><label for=\"pinPublishBoard\">لوحة النشر في Pinterest</label><select id=\"pinPublishBoard\"><option value=\"\">جارٍ تحميل البوردات…</option></select><p id=\"pinPublishBoardStatus\" class=\"helper\">سيتم جلب بوردات الحساب المتصل تلقائيًا.</p></section>`}"
if needle not in s:
    raise SystemExit('pin publish markup not found')
s=s.replace(needle,replacement,1)

# Insert board loading helpers before mountPinStudio.
marker='    async function mountPinStudio(draft){const canvas=$(\'pinCanvas\');'
helpers="""    async function loadPublishBoards(draft){
      const select=$('pinPublishBoard'),status=$('pinPublishBoardStatus');
      if(!select)return;
      try{
        const result=await api('/sessions/pinterest/boards?accountId=default');
        const boards=Array.isArray(result.boards)?result.boards:[];
        const saved=String(draft.pinterestBoardId||state.settingsSummary?.pinterestBoardId||'');
        select.innerHTML='<option value=\"\">اختر البورد الذي سينشر فيه الدبوس</option>'+boards.map(board=>`<option value=\"${escapeHtml(board.id||'')}\">${escapeHtml(board.name||board.id||'Board')}</option>`).join('');
        if(saved)select.value=saved;
        if(status)status.textContent=boards.length?`${boards.length} بورد متاح — اختر البورد قبل النشر.`:'لم يتم العثور على بوردات للحساب المتصل.';
        select.onchange=()=>{draft.pinterestBoardId=select.value;persist();};
      }catch(error){
        const fallback=String(state.settingsSummary?.pinterestBoardId||'');
        select.innerHTML=fallback?`<option value=\"${escapeHtml(fallback)}\">بورد الإعدادات الحالي</option>`:'<option value=\"\">تعذر تحميل البوردات</option>';
        if(fallback)select.value=fallback;
        if(status)status.textContent=error.message||'تعذر تحميل بوردات Pinterest. اربط الحساب من الإعدادات أو PinFlux.';
      }
    }
"""
if marker not in s:
    raise SystemExit('mountPinStudio marker not found')
s=s.replace(marker,helpers+marker,1)

# Bind board loading after PinFlux studio wiring.
s=s.replace("$('pinPublish').onclick=()=>publishDraftToPinterest(draft.id)}", "$('pinPublish').onclick=()=>publishDraftToPinterest(draft.id);loadPublishBoards(draft)}",1)

# Send selected board with the publish request.
s=s.replace("const result=await nativeCall('publishPinterest',{draft,image,link:draft.publishedUrl});", "const boardSelect=$('pinPublishBoard');const boardId=String((boardSelect&&boardSelect.value)||draft.pinterestBoardId||state.settingsSummary?.pinterestBoardId||'').trim();if(!boardId)return notice('اختر بورد Pinterest قبل النشر.','bad');draft.pinterestBoardId=boardId;persist();const result=await nativeCall('publishPinterest',{draft,image,link:draft.publishedUrl,boardId});",1)

# WordPress defaults to published unless the user explicitly selected another status.
s=s.replace("$('editPostStatus').value=draft.postStatus||'draft'", "$('editPostStatus').value=draft.postStatus||'publish'",1)
s=s.replace("postStatus:draft.postStatus||'draft',siteId:activeSiteId()", "postStatus:draft.postStatus||'publish',siteId:activeSiteId()",1)
# Make the review editor show Publish as the first/default option.
s=s.replace('<select id="editPostStatus"><option value="draft">Draft</option><option value="pending">Pending review</option><option value="publish">Publish</option></select>', '<select id="editPostStatus"><option value="publish">Publish</option><option value="draft">Draft</option><option value="pending">Pending review</option></select>',1)
p.write_text(s)
