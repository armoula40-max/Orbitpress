from pathlib import Path
p=Path('/home/ubuntu/Orbitpress/server/public/index.html')
s=p.read_text()
old='<button class="menu-item" data-screen="pinterest" type="button"><span class="menu-icon">◉</span>Pinterest Analyzer</button>'
new=old+'<button class="menu-item" data-screen="pinflux" type="button"><span class="menu-icon">↻</span>PinFlux Save / Repin</button>'
if 'data-screen="pinflux"' not in s:
    s=s.replace(old,new,1)
# Make SEO proof visible in Drafts without replacing the existing review scorecard.
old_fn="function renderDrafts(){const list=$('draftList'),drafts=activeDrafts();"
new_fn="function renderDrafts(){const list=$('draftList'),drafts=activeDrafts();"
# Add helper before renderDrafts so the existing renderer can use it in a follow-up replacement.
helper="function seoProofMarkup(draft){const scan=state.seoScans&&state.seoScans[draft.id],analysis=scan&&scan.analysis,score=analysis&&Number.isFinite(Number(analysis.score))?Number(analysis.score):null;const title=draft.seoTitle||draft.title||'';return `<div class=\\\"seo-proof\\\"><b>${score==null?'SEO not scanned':`SEO ${score}/100`}</b><span class=\\\"seo-proof-title\\\">${escapeHtml(title)}</span></div>`}"
if 'function seoProofMarkup' not in s:
    marker='function renderDrafts(){'
    s=s.replace(marker,helper+marker,1)
old_fragment="<div class=\"draft-meta\">/${escapeHtml(draft.slug)} · ${escapeHtml(draft.categoryName)} · ${escapeHtml(draft.contentType)} · ${formatDate(draft.createdAt)}</div></div>"
new_fragment="<div class=\"draft-meta\">/${escapeHtml(draft.slug)} · ${escapeHtml(draft.categoryName)} · ${escapeHtml(draft.contentType)} · ${formatDate(draft.createdAt)}</div>${seoProofMarkup(draft)}</div>"
if old_fragment in s:
    s=s.replace(old_fragment,new_fragment,1)
p.write_text(s)
