"""Crop from the clearer user-attached brand sheet."""
from pathlib import Path

from PIL import Image

attached = Path(
    r"C:\Users\yuen_\.cursor\projects\f-VSCode-ws-projects-exploration-AITrending"
    r"\assets\c__Users_yuen__AppData_Roaming_Cursor_User_workspaceStorage_"
    r"4a491653694073f510b8bd010dec57c3_images_image-b0531552-09bb-431f-a5e8-933a4b317b4f.png"
)
out = Path(__file__).parent
public = Path(__file__).resolve().parents[2] / "public"

im = Image.open(attached).convert("RGBA")
print("user sheet", im.size)
im.save(out / "user-sheet.png")

# Also process PDF page for icon
page = Image.open(out / "page-1.png").convert("RGBA")


def knock_dark(img: Image.Image, luma_cut: int = 40) -> Image.Image:
    out_img = img.copy()
    px = out_img.load()
    ww, hh = out_img.size
    for y in range(hh):
        for x in range(ww):
            r, g, b, a = px[x, y]
            if r > 180 and g < 130 and b < 110:
                px[x, y] = (255, 79, 43, 255)  # Signal
                continue
            luma = (r * 3 + g * 4 + b) // 8
            if luma <= luma_cut:
                px[x, y] = (0, 0, 0, 0)
            elif luma < luma_cut + 36:
                px[x, y] = (r, g, b, int(255 * (luma - luma_cut) / 36))
    return out_img


def knock_paper(img: Image.Image) -> Image.Image:
    out_img = img.copy()
    px = out_img.load()
    ww, hh = out_img.size
    for y in range(hh):
        for x in range(ww):
            r, g, b, a = px[x, y]
            if r > 180 and g < 130 and b < 110:
                px[x, y] = (255, 79, 43, 255)
                continue
            if r > 205 and g > 200 and b > 190:
                px[x, y] = (0, 0, 0, 0)
    return out_img


def trim(img: Image.Image, pad: int = 2) -> Image.Image:
    bbox = img.getbbox()
    if not bbox:
        return img
    x0, y0, x1, y1 = bbox
    return img.crop((max(0, x0 - pad), max(0, y0 - pad), min(img.width, x1 + pad), min(img.height, y1 + pad)))


w, h = im.size
# Approximate: light banner mid, dark banner bottom (full width centered cards)
light = im.crop((int(w * 0.12), int(h * 0.38), int(w * 0.88), int(h * 0.58)))
dark = im.crop((int(w * 0.12), int(h * 0.62), int(w * 0.88), int(h * 0.88)))
# size-test large black icon top-left
icon = im.crop((int(w * 0.02), int(h * 0.04), int(w * 0.28), int(h * 0.30)))

light_t = trim(knock_paper(light))
dark_t = trim(knock_dark(dark))
icon_t = trim(knock_dark(icon, luma_cut=45))

for name, img in [("preview-light", light_t), ("preview-dark", dark_t), ("preview-icon", icon_t)]:
    img.save(out / f"{name}.png")
    print(name, img.size)

# Prefer PDF large icon if better
icon_pdf = trim(knock_dark(page.crop((180, 240, 1600, 1660)), luma_cut=38))
icon_pdf.save(out / "preview-icon-pdf.png")
print("icon-pdf", icon_pdf.size)
