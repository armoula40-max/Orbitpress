from pathlib import Path

rules = '''
<style id="orbitpress-responsive-polish">
  html, body, main, .screen, .card, .section, .panel { max-width: 100%; min-width: 0; }
  *, *::before, *::after { min-width: 0; }
  img, video, svg, canvas { max-width: 100%; height: auto; }
  .image-preview, .image-slot img, .generated-image, .article-image, .pin-image { display: block; width: 100%; max-width: 100%; height: auto; max-height: min(62vw, 420px); object-fit: contain; object-position: center; border-radius: 12px; }
  .image-slot, .image-grid, .image-preview-wrap, .media-preview, .pin-result { max-width: 100%; overflow: hidden; }
  .keyword-cloud, .filter-grid, .filter-row, .analyzer-filters, .scan-filters, .social-filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(150px, 100%), 1fr)); gap: 9px; width: 100%; }
  .keyword-cloud { display: flex; flex-wrap: wrap; }
  .keyword-chip { max-width: 100%; white-space: normal; overflow-wrap: anywhere; text-align: center; }
  .pinterest-url-row, .row, .row.three, .analyzer-grid, .orbit-tool-grid { min-width: 0; }
  input, select, textarea, button { max-width: 100%; min-width: 0; }
  @media (max-width: 760px) {
    .row, .row.three, .analyzer-grid, .filter-grid, .filter-row, .analyzer-filters, .scan-filters, .social-filters { grid-template-columns: 1fr; }
    .pinterest-url-row { grid-template-columns: 1fr; display: grid; }
    .pinterest-url-row .scan-button, .pinterest-url-row button { width: 100%; }
    .section-head { flex-wrap: wrap; }
    .section-head > * { max-width: 100%; }
    .image-preview, .image-slot img, .generated-image, .article-image, .pin-image { max-height: 72vw; }
  }
</style>
'''
for filename in [
    '/home/ubuntu/Orbitpress/app/src/main/assets/index.html',
    '/home/ubuntu/Orbitpress/server/public/index.html',
]:
    p = Path(filename)
    s = p.read_text()
    if 'id="orbitpress-responsive-polish"' in s:
        continue
    s = s.replace('</head>', rules + '</head>', 1)
    p.write_text(s)
