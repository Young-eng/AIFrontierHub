"""Extract clean transparent brand marks from the PDF sheet."""
from pathlib import Path

from PIL import Image

src_dir = Path(__file__).parent
root = Path(__file__).resolve().parents[2]  # mobile/
public = root / "public"
res = root / "android" / "app" / "src" / "main" / "res"
public.mkdir(exist_ok=True)

sheet = Image.open(src_dir / "page-1.png").convert("RGBA")
w, h = sheet.size


def crop(box):
    return sheet.crop(box)


def knock_dark(img: Image.Image, luma_cut: int = 48) -> Image.Image:
    """Make near-black background transparent; keep light dots / white type / signal."""
    out = img.copy()
    px = out.load()
    ww, hh = out.size
    for y in range(hh):
        for x in range(ww):
            r, g, b, a = px[x, y]
            luma = (r * 3 + g * 4 + b) // 8
            # Signal orange stays fully opaque
            if r > 180 and g < 120 and b < 100:
                px[x, y] = (r, g, b, 255)
                continue
            if luma <= luma_cut:
                px[x, y] = (r, g, b, 0)
            elif luma < luma_cut + 40:
                # soft edge
                alpha = int(255 * (luma - luma_cut) / 40)
                px[x, y] = (r, g, b, alpha)
    return out


def knock_paper(img: Image.Image) -> Image.Image:
    """Make paper/cream background transparent; keep dark type + signal."""
    out = img.copy()
    px = out.load()
    ww, hh = out.size
    for y in range(hh):
        for x in range(ww):
            r, g, b, a = px[x, y]
            # signal
            if r > 180 and g < 120 and b < 100:
                px[x, y] = (r, g, b, 255)
                continue
            # paper-ish warm light
            if r > 200 and g > 195 and b > 185 and abs(r - g) < 25:
                px[x, y] = (r, g, b, 0)
                continue
            # near-white
            if r > 230 and g > 230 and b > 225:
                px[x, y] = (r, g, b, 0)
    return out


def trim_alpha(img: Image.Image, pad: int = 4) -> Image.Image:
    bbox = img.getbbox()
    if not bbox:
        return img
    x0, y0, x1, y1 = bbox
    return img.crop((max(0, x0 - pad), max(0, y0 - pad), min(img.width, x1 + pad), min(img.height, y1 + pad)))


# --- Black app icon (left large squircle) ---
icon_plate = crop((160, 220, 1620, 1680))
icon_clean = trim_alpha(knock_dark(icon_plate, luma_cut=36))
# Rebuild square launcher on Ink
def launcher(size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (10, 11, 15, 255))
    mark = icon_clean.copy()
    mark.thumbnail((int(size * 0.78), int(size * 0.78)), Image.Resampling.LANCZOS)
    canvas.alpha_composite(mark, ((size - mark.width) // 2, (size - mark.height) // 2))
    return canvas


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
icon_clean.save(public / "brand-mark.png")  # transparent F for HTML brand

# --- Dark wordmark (white type) — knock out ink plate ---
# Right lower banner area on the sheet
wm_dark = crop((1880, 1650, 4400, 2360))
wm_dark_t = trim_alpha(knock_dark(wm_dark, luma_cut=42))
# Normalize height
h = 160
ratio = h / wm_dark_t.height
wm_dark_t = wm_dark_t.resize((max(1, int(wm_dark_t.width * ratio)), h), Image.Resampling.LANCZOS)
wm_dark_t.save(public / "brand-wordmark.png")
wm_dark_t.save(src_dir / "brand-wordmark-transparent.png")

# --- Light wordmark (dark type) — knock out paper (for reference / light chrome) ---
wm_light = crop((1880, 720, 4400, 1280))
wm_light_t = trim_alpha(knock_paper(wm_light))
h = 160
ratio = h / max(1, wm_light_t.height)
wm_light_t = wm_light_t.resize((max(1, int(wm_light_t.width * ratio)), h), Image.Resampling.LANCZOS)
wm_light_t.save(public / "brand-wordmark-light.png")
wm_light_t.save(src_dir / "brand-wordmark-light-transparent.png")

print("brand-mark", Image.open(public / "brand-mark.png").size)
print("wordmark", Image.open(public / "brand-wordmark.png").size)
print("wordmark-light", Image.open(public / "brand-wordmark-light.png").size)
print("done")
