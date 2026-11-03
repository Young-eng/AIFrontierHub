from pathlib import Path

from PIL import Image

src = Path(__file__).with_name("page-1.png")
out = Path(__file__).parent
im = Image.open(src).convert("RGBA")
w, h = im.size
print("size", w, h)

# Empirically tuned for this 4500x2625 sheet @ 300dpi.
crops = {
    # Large black rounded-square icon (left)
    "icon-black": (120, 180, 1680, 1740),
    # Light paper horizontal wordmark (right, upper-middle)
    "wordmark-light": (1900, 280, 4380, 900),
    # Dark horizontal wordmark with white text (right, lower)
    "wordmark-dark": (1900, 1680, 4380, 2300),
}

for name, box in crops.items():
    cropped = im.crop(box)
    path = out / f"{name}.png"
    cropped.save(path)
    print(name, box, "->", cropped.size)

# Also export tighter icon: detect near-black rounded rect bounds inside first crop
icon = Image.open(out / "icon-black.png")
pixels = icon.load()
iw, ih = icon.size
# Find content bounding box that isn't the paper background (#F2F0EA-ish)
xs, ys = [], []
for y in range(0, ih, 2):
    for x in range(0, iw, 2):
        r, g, b, a = pixels[x, y]
        # paper-ish
        if r > 220 and g > 215 and b > 210:
            continue
        xs.append(x)
        ys.append(y)
if xs and ys:
    pad = 8
    box = (
        max(0, min(xs) - pad),
        max(0, min(ys) - pad),
        min(iw, max(xs) + pad),
        min(ih, max(ys) + pad),
    )
    tight = icon.crop(box)
    tight.save(out / "icon-black-tight.png")
    print("icon-black-tight", box, "->", tight.size)
