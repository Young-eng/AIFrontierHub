"""
High-DPI launcher assets.
- Legacy icons: 48…192
- Adaptive foreground: 108dp × density (108…432) — this is what modern Android shows
Draw at 8× then LANCZOS downscale so circles stay crisp.
"""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).parent
PUBLIC = Path(__file__).resolve().parents[2] / "public"
RES = Path(__file__).resolve().parents[2] / "android" / "app" / "src" / "main" / "res"

INK = (10, 11, 15, 255)
SIGNAL = (255, 79, 43, 255)
DOTS = [
    (0, 0, 232),
    (0, 1, 210),
    (0, 2, 188),
    (0, 3, 166),
    (0, 4, 144),
    (1, 0, 236),
    (2, 0, 242),
    (3, 0, 248),
    (1, 2, 210),
    (2, 2, 196),
    (3, 2, 180),
]

SS = 8  # supersample factor


def _draw_mark_px(size: int, pad_ratio: float) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    pad = size * pad_ratio
    grid = size - pad * 2
    cell = grid / 5.0

    def center(c: float, r: float) -> tuple[float, float]:
        return pad + c * cell + cell / 2, pad + r * cell + cell / 2

    for c, r, g in DOTS:
        cx, cy = center(c, r)
        rad = cell * 0.30
        draw.ellipse((cx - rad, cy - rad, cx + rad, cy + rad), fill=(g, g, g, 255))

    sx, sy = center(4, 0)
    for rad, width, alpha in (
        (cell * 0.70, max(SS, size // 48), 110),
        (cell * 0.50, max(SS, size // 42), 170),
    ):
        ring = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        rd = ImageDraw.Draw(ring)
        rd.ellipse(
            (sx - rad, sy - rad, sx + rad, sy + rad),
            outline=(*SIGNAL[:3], alpha),
            width=width,
        )
        img.alpha_composite(ring)

    rad = cell * 0.30
    draw.ellipse((sx - rad, sy - rad, sx + rad, sy + rad), fill=SIGNAL)
    return img


def draw_mark(size: int, pad_ratio: float = 0.26) -> Image.Image:
    big = _draw_mark_px(size * SS, pad_ratio)
    return big.resize((size, size), Image.Resampling.LANCZOS)


def compose_launcher(size: int) -> Image.Image:
    base = Image.new("RGBA", (size, size), INK)
    base.alpha_composite(draw_mark(size, pad_ratio=0.26))
    return base


def compose_foreground(size: int) -> Image.Image:
    return draw_mark(size, pad_ratio=0.28)


def save_png(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, format="PNG", optimize=True)


# Legacy / pre-API-26 launcher (48dp)
LEGACY = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

# Adaptive foreground is 108dp — must be denser than legacy 48dp icons
FOREGROUND = {
    "mipmap-mdpi": 108,
    "mipmap-hdpi": 162,
    "mipmap-xhdpi": 216,
    "mipmap-xxhdpi": 324,
    "mipmap-xxxhdpi": 432,
}

for folder, size in LEGACY.items():
    d = RES / folder
    save_png(compose_launcher(size), d / "ic_launcher.png")
    save_png(compose_launcher(size), d / "ic_launcher_round.png")

for folder, size in FOREGROUND.items():
    d = RES / folder
    save_png(compose_foreground(size), d / "ic_launcher_foreground.png")

PUBLIC.mkdir(parents=True, exist_ok=True)
save_png(compose_launcher(1024), PUBLIC / "app-icon.png")
save_png(compose_launcher(512), OUT / "preview-icon-fixed.png")
save_png(compose_foreground(432), OUT / "foreground-safe.png")

# Sanity
fg = RES / "mipmap-xxxhdpi" / "ic_launcher_foreground.png"
leg = RES / "mipmap-xxxhdpi" / "ic_launcher.png"
print("legacy xxxhdpi", Image.open(leg).size, "foreground xxxhdpi", Image.open(fg).size)
