from pathlib import Path
p=Path('/home/ubuntu/Orbitpress/server/public/index.html')
s=p.read_text()
s=s.replace('Generate a featured image and an exact 2:3 Pinterest image through Cloudflare Workers AI or an OpenAI-compatible Images API. Secrets are encrypted per site.', 'Generate a featured image and a Pinterest image in any supported portrait or long vertical format through Cloudflare Workers AI or an OpenAI-compatible Images API. Secrets are encrypted per site.')
s=s.replace('Choose your featured image and your exact 2:3 Pinterest image.', 'Choose your featured image and your Pinterest image in any supported portrait or long vertical format.')
s=s.replace('The Pinterest image is always stored at an exact 2:3 portrait ratio, 1000 × 1500, whatever shape the upload or the provider returns. No image is sent to WordPress until Publish is pressed.', 'The Pinterest image keeps its original supported dimensions, including long vertical formats. No image is sent to WordPress until Publish is pressed.')
old="if(!(size.width>0&&size.width*3===size.height*2)){if(!window.confirm(`This image is ${size.width} × ${size.height}. Pinterest needs an exact 2:3 portrait — crop it to 1000 × 1500 and continue?`)){input.value='';return notice('Pinterest image must have an exact 2:3 portrait ratio, such as 1000×1500.','bad')}payload=pinFitToPinterest(dataUrl).then(can"
new="if(!(size.width>0&&size.height>0)){input.value='';return notice('Pinterest image has invalid dimensions.','bad')}payload=Promise.resolve(dataUrl).then(can"
if old not in s:
    raise SystemExit('upload gate pattern not found')
s=s.replace(old,new,1)
p.write_text(s)
