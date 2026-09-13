from pathlib import Path
p=Path('/home/ubuntu/Orbitpress/server/public/index.html')
s=p.read_text()
s=s.replace('Generate a featured image and an exact 2:3 Pinterest image through Cloudflare Workers AI or an OpenAI-compatible Images API. Secrets are encrypted per site.', 'Generate a featured image and a Pinterest image in any supported portrait or long vertical format through Cloudflare Workers AI or an OpenAI-compatible Images API. Secrets are encrypted per site.')
s=s.replace('Choose your featured image and your exact 2:3 Pinterest image.', 'Choose your featured image and your Pinterest image in any supported portrait or long vertical format.')
s=s.replace('The Pinterest image is always stored at an exact 2:3 portrait ratio, 1000 × 1500, whatever shape the upload or the provider returns. No image is sent to WordPress until Publish is pressed.', 'The Pinterest image keeps its original supported dimensions, including long vertical formats. No image is sent to WordPress until Publish is pressed.')
old="if(kind==='pinterest'){const size=await pinApi().imageSize(dataUrl);if(!(size.width>0&&size.width*3===size.height*2)){if(!window.confirm(`This image is ${size.width} × ${size.height}. Pinterest accepts long vertical images; continue with the original dimensions?`)){input.value='';return notice('Pinterest image dimensions are accepted, including long vertical formats.','bad')}payload=pinFitToPinterest(dataUrl).then(canvas=>canvas.toDataURL('image/jpeg',0.92));fitted=true}}"
new="if(kind==='pinterest'){const size=await pinApi().imageSize(dataUrl);if(!(size.width>0&&size.height>0)){input.value='';return notice('Pinterest image has invalid dimensions.','bad')}}"
assert old in s
s=s.replace(old,new,1)
old2="let dataUrl=result.dataUrl,fitted=false;if(kind==='pinterest'){const canvas=await pinFitToPinterest(dataUrl);dataUrl=canvas.toDataURL('image/jpeg',0.92);fitted=true}"
new2="let dataUrl=result.dataUrl,fitted=false;"
assert old2 in s
s=s.replace(old2,new2,1)
s=s.replace("notice(fitted?'Pinterest image generated and fitted to 1000 × 1500.':`${kind==='pinterest'?'Pinterest':'Featured'} image generated and saved locally.`,'good')", "notice(`${kind==='pinterest'?'Pinterest':'Featured'} image generated and saved locally.`,'good')")
s=s.replace("kind==='pinterest'?`Vertical Pinterest editorial image for ${subject}, ${nicheLabel(draft.niche||'food')} context, clean background, no text, portrait 2:3 composition`", "kind==='pinterest'?`Flexible vertical Pinterest editorial image for ${subject}, ${nicheLabel(draft.niche||'food')} context, clean background, no text, suitable for tall or long formats`")
p.write_text(s)
