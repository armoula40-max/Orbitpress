from pathlib import Path
p=Path('/home/ubuntu/Orbitpress/server/public/index.html')
s=p.read_text()
old="const button=$('publishDraft');button.disabled=true;button.textContent='Uploading & publishing…';try{const result=await nativeCall('publish',{draft,images,categoryId:keyword.categoryId,postStatus:draft.postStatus||'publish',siteId:activeSiteId(),enforceSeoGate:true,seoOverride:!!forceSeo});"
new="const button=$('publishDraft');button.disabled=true;button.textContent='Uploading & publishing…';const selectedStatus=String(($('editPostStatus')&&$('editPostStatus').value)||draft.postStatus||'publish');try{const result=await nativeCall('publish',{draft,images,categoryId:keyword.categoryId,postStatus:selectedStatus,siteId:activeSiteId(),enforceSeoGate:true,seoOverride:!!forceSeo});"
if old not in s: raise SystemExit('publish status expression not found')
p.write_text(s.replace(old,new,1))
