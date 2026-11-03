"""Build a clean transparent F-mark (no plate) for the header lockup."""
from pathlib import Path

from PIL import Image, ImageFilter

out = Path(__file__).parent
public = Path(__file__).resolve().parents[2] / "public"
page = Image.open(out / "page-1.png").convert("RGBA")

# Large left icon plate from PDF sheet
raw = page.crop((200, 260, 1580, 1640))
px = raw.load()
w, h = raw.size

# Aggressive: keep only signal orange + light dots; drop near-black plate
clean = Image.new("RGBA", (w, h), (0, 0, 0, 0))
cp = clean.load()
for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        # Signal
        if r >= 170 and g <= 140 and b <= 120 and r > g + 40:
            cp[x, y] = (255, 79, 43, 255)
            continue
        luma = (r * 299 + g * 587 + b * 114) // 1000
        # Light / mid dots on the F
        if luma >= 95:
            # preserve relative brightness as light paper-ish grey
            v = min(255, int(140 + (luma - 95) * 1.1))
            cp[x, y] = (v, v, v, 255)

# Soft trim
bbox = clean.getbbox()
if bbox:
    clean = clean.crop(bbox)
# slight pad
pad = 24
canvas = Image.new("RGBA", (clean.width + pad * 2, clean.height + pad * 2), (0, 0, 0, 0))
canvas.alpha_composite(clean, (pad, pad))
# Export
h_target = 256
ratio = h_target / canvas.height
final = canvas.resize((max(1, int(canvas.width * ratio)), h_target), Image.Resampling.LANCZOS)
final.save(public / "brand-mark.png")
final.save(out / "brand-mark-clean.png")

# Launcher: Ink plate + centered mark
def launcher(size: int) -> Image.Image:
    base = Image.new("RGBA", (size, size), (10, 11, 15, 255))
    mark = final.copy()
    mark.thumbnail((int(size * 0.62), int(size * 0.62)), Image.Resampling.LANCZOS)
    base.alpha_composite(mark, ((size - mark.width) // 2, (size - mark.height) // 2))
    return base

res = Path(__file__).resolve().parents[2] / "android" / "app" / "src" / "main" / "res"
for folder, size in {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}.items():
    d = res / folder
    d.mkdir(parents=True, exist_ok=True)
    img = launcher(size)
    img.save(d / "ic_launcher.png")
    img.save(d / "ic_launcher_round.png")
    img.save(d / "ic_launcher_foreground.png")

launcher(512).save(public / "app-icon.png")
launcher(192).save(public / "favicon.png")

# Light wordmark text-only from user sheet (transparent)
user = Image.open(out / "user-sheet.png").convert("RGBA")
uw, uh = user.size
light = user.crop((int(uw * 0.14), int(uh * 0.40), int(uw * 0.86), int(uh * 0.56)))
upx = light.load()
lw, lh = light.size
for y in range(lh):
    for x in range(lw):
        r, g, b, a = upx[x, y]
        if r > 200 and g > 195 and b > 185:
            upx[x, y] = (0, 0, 0, 0)
bbox = light.getbbox()
if bbox:
    light = light.crop(bbox)
ht = 120
ratio = ht / light.height
light = light.resize((max(1, int(light.width * ratio)), ht), Image.Resampling.LANCZOS)
light.save(public / "brand-wordmark-light.png")
print("mark", final.size, "wordmark-light", light.size)
