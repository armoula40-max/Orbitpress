from pathlib import Path

app=Path('/home/ubuntu/Orbitpress/app/src/main/assets/index.html')
s=app.read_text()
s=s.replace("image.naturalWidth*3===image.naturalHeight*2?resolve():reject(new Error('Pinterest image must be an exact 2:3 portrait, for example 1000 × 1500.'))", "image.naturalWidth>0&&image.naturalHeight>0?resolve():reject(new Error('This Pinterest image has invalid dimensions.'))")
s=s.replace("'portrait 2:3 vertical Pinterest composition'", "'flexible vertical Pinterest composition, including tall or long formats'")
app.write_text(s)

kt=Path('/home/ubuntu/Orbitpress/app/src/main/java/com/askinz/publisher/MainActivity.kt')
s=kt.read_text()
old='''    if (pinterest) {
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
      require(bounds.outWidth > 0 && bounds.outHeight > 0 && bounds.outWidth * 3 == bounds.outHeight * 2) { "Pinterest image must have an exact 2:3 portrait ratio, such as 1000×1500." }
    }
'''
assert old in s
s=s.replace(old, '''    // Pinterest accepts multiple portrait formats, including long vertical images.
    // Keep the byte/type/size validation but do not force an exact 2:3 ratio.
    if (pinterest) require(bytes.isNotEmpty()) { "Pinterest image is empty." }
''',1)
kt.write_text(s)

wp=Path('/home/ubuntu/Orbitpress/server/lib/wordpress.js')
s=wp.read_text().replace('portrait 2:3 Pinterest composition', 'flexible vertical Pinterest composition, including tall or long formats')
wp.write_text(s)

images=Path('/home/ubuntu/Orbitpress/server/lib/images.js')
s=images.read_text().replace('Pinterest accepts pins and plain Pinterest uploads: both must be 2:3.', 'Pinterest accepts pins and plain Pinterest uploads in multiple portrait formats, including long images.')
images.write_text(s)
