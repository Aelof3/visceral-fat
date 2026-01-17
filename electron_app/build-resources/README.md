# Build Resources

Place your application icons here:

- `icon.icns` - macOS icon (1024x1024, can be generated from PNG)
- `icon.ico` - Windows icon (256x256 multi-resolution)
- `icon.png` - Linux icon (512x512 or 1024x1024)

## Generating Icons

### From a source PNG (1024x1024 recommended):

**macOS (.icns):**
```bash
# Using iconutil (built into macOS)
mkdir icon.iconset
sips -z 16 16 icon.png --out icon.iconset/icon_16x16.png
sips -z 32 32 icon.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32 icon.png --out icon.iconset/icon_32x32.png
sips -z 64 64 icon.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128 icon.png --out icon.iconset/icon_128x128.png
sips -z 256 256 icon.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256 icon.png --out icon.iconset/icon_256x256.png
sips -z 512 512 icon.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512 icon.png --out icon.iconset/icon_512x512.png
sips -z 1024 1024 icon.png --out icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset
rm -rf icon.iconset
```

**Windows (.ico):**
```bash
# Using ImageMagick
convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico
```

**Or use online tools:**
- https://cloudconvert.com/png-to-icns
- https://cloudconvert.com/png-to-ico
