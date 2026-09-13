from pathlib import Path

files = [
    Path('/home/ubuntu/Orbitpress/server/public/index.html'),
    Path('/home/ubuntu/Orbitpress/server/lib/contracts.js'),
    Path('/home/ubuntu/Orbitpress/app/src/main/java/com/askinz/publisher/MediaPublishingContract.kt'),
]
for p in files:
    s=p.read_text()
    replacements = {
        'Pinterest image must use an exact 2:3 portrait ratio.': 'Pinterest image dimensions are accepted, including long vertical formats.',
        'Pinterest image must have an exact 2:3 portrait ratio, such as 1000×1500.': 'Pinterest image dimensions are accepted, including long vertical formats.',
        'Pinterest needs an exact 2:3 portrait - crop it to 1000 × 1500 and continue?': 'Pinterest accepts long vertical images; continue with the original dimensions?',
        'Pinterest needs an exact 2:3 portrait — crop it to 1000 × 1500 and continue?': 'Pinterest accepts long vertical images; continue with the original dimensions?',
    }
    before=s
    for old,new in replacements.items():
        s=s.replace(old,new)
    # Replace simple JS/Kotlin ratio guards if present in the public shell/contracts.
    s=s.replace("width * 3 === height * 2", "width > 0 && height > 0")
    s=s.replace("width * 3 == height * 2", "width > 0 && height > 0")
    if s != before:
        p.write_text(s)
        print(f'updated {p}')
    else:
        print(f'unchanged {p}')
