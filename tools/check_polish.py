from pathlib import Path
p=Path('/home/ubuntu/Orbitpress/app/src/main/assets/index.html')
s=p.read_text()
p.write_text('\n'.join(line.rstrip() for line in s.splitlines())+'\n')
start=s.index('<script>')+len('<script>')
end=s.index('</script>', start)
Path('/tmp/orbitpress-inline.js').write_text(s[start:end])
print('scripts', s.count('<script'), s.count('</script>'), 'styles', s.count('<style'), s.count('</style>'))
for marker in ('screen-trends','screen-pinflux','readTrends','planPinflux','@media (max-width:760px)'):
 print(marker, s.count(marker))
