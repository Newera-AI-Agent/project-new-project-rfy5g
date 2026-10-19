#!/usr/bin/env python3
"""Deterministically render PdfEditz PWA icons + OG image with Pillow.

Why a script: text baked by image models is unreliable (misspellings), so the
brand text and glyphs are drawn here instead. Run:

    python3 scripts/make-assets.py
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

BLUE = (37, 99, 235, 255)
BLUE_DARK = (30, 58, 138, 255)
INK = (15, 23, 42, 255)
PAGE = (255, 255, 255, 255)
LINE = (191, 219, 254, 255)
FOLD = (219, 234, 254, 255)
AMBER = (245, 158, 11, 255)
SLATE = (51, 65, 85, 255)

FONT_DIR = "/usr/share/fonts/truetype/lato"


def font(name, size):
    return ImageFont.truetype(os.path.join(FONT_DIR, name), size)


def rounded_mask(size, radius, ss):
    m = Image.new("L", (size * ss, size * ss), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size * ss - 1, size * ss - 1], radius=radius * ss, fill=255)
    return m.resize((size, size), Image.LANCZOS)


def gradient(size, top, bottom):
    img = Image.new("RGBA", (1, size), top)
    for y in range(size):
        t = y / max(1, size - 1)
        img.putpixel((0, y), tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(4)))
    return img.resize((size, size), Image.BILINEAR)


def pencil(size):
    """Horizontal pencil sprite, tip at the left. `size` = body length."""
    w, h = size, int(size * 0.30)
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    tip = int(h * 1.0)
    d.polygon([(0, h // 2), (tip, h * 0.18), (tip, h * 0.82)], fill=SLATE)
    d.rectangle([tip, int(h * 0.16), int(w * 0.78), int(h * 0.84)], fill=AMBER)
    d.rounded_rectangle([int(w * 0.76), int(h * 0.12), w - 1, int(h * 0.88)], radius=int(h * 0.16), fill=(239, 68, 68, 255))
    return img


def make_icon(px):
    """Render the app icon at `px` square."""
    S = px
    canvas = gradient(S, BLUE, BLUE_DARK).convert("RGBA")
    mask = rounded_mask(S, int(S * 0.22), 1)
    icon = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    icon.paste(canvas, (0, 0), mask)

    # soft highlight sweep
    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([-S * 0.35, -S * 0.55, S * 0.75, S * 0.35], fill=(255, 255, 255, 28))
    glow = glow.filter(ImageFilter.GaussianBlur(S * 0.06))
    icon.alpha_composite(Image.composite(glow, Image.new("RGBA", (S, S), (0, 0, 0, 0)), mask))

    d = ImageDraw.Draw(icon)

    # document with a cut top-right corner
    x0, y0, x1, y1 = S * 0.255, S * 0.16, S * 0.745, S * 0.845
    c = S * 0.155
    shadow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).polygon(
        [(x0, y0), (x1 - c, y0), (x1, y0 + c), (x1, y1), (x0, y1)], fill=(2, 6, 23, 90)
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(S * 0.018))
    icon.alpha_composite(Image.new("RGBA", (S, S), (0, 0, 0, 0)))
    icon.alpha_composite(shadow, (int(S * 0.012), int(S * 0.02)))

    d.polygon([(x0, y0), (x1 - c, y0), (x1, y0 + c), (x1, y1), (x0, y1)], fill=PAGE)
    d.polygon([(x1 - c, y0), (x1, y0 + c), (x1 - c, y0 + c)], fill=FOLD)

    # text lines
    lx0, lx1 = x0 + S * 0.075, x1 - S * 0.10
    ly = y0 + S * 0.135
    widths = [1.0, 0.78, 0.9, 0.6]
    for i, wf in enumerate(widths):
        d.rounded_rectangle(
            [lx0, ly, lx0 + (lx1 - lx0) * wf, ly + S * 0.032],
            radius=S * 0.016, fill=LINE,
        )
        ly += S * 0.062

    # pencil dipping into the lower-right of the page
    p = pencil(int(S * 0.62))
    p = p.rotate(-38, expand=True, resample=Image.BICUBIC)
    icon.alpha_composite(p, (int(S * 0.40), int(S * 0.60)))

    return icon


def make_og():
    W, H = 1536, 1024
    img = gradient(H, (9, 15, 33, 255), (15, 23, 42, 255)).resize((W, H), Image.BILINEAR).convert("RGBA")
    d = ImageDraw.Draw(img)

    # subtle grid
    grid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grid)
    for x in range(0, W, 64):
        gd.line([(x, 0), (x, H)], fill=(37, 99, 235, 22), width=1)
    for y in range(0, H, 64):
        gd.line([(0, y), (W, y)], fill=(37, 99, 235, 22), width=1)
    img.alpha_composite(grid)

    # accent glow
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([W * 0.62, -H * 0.35, W * 1.25, H * 0.75], fill=(37, 99, 235, 120))
    glow = glow.filter(ImageFilter.GaussianBlur(120))
    img.alpha_composite(glow)

    # brand mark
    logo = make_icon(120)
    img.alpha_composite(logo, (96, 86))

    d = ImageDraw.Draw(img)
    f_brand = font("Lato-Black.ttf", 40)
    d.text((238, 112), "PdfEditz", font=f_brand, fill=(255, 255, 255, 255))

    d.text((96, 268), "Edit PDFs right", font=font("Lato-Black.ttf", 108), fill=(255, 255, 255, 255))
    d.text((96, 388), "in your browser.", font=font("Lato-Black.ttf", 108), fill=(96, 165, 250, 255))

    d.text((96, 548), "Annotate, redact, sign, merge & compress.", font=font("Lato-Medium.ttf", 44), fill=(203, 213, 225, 255))
    d.text((96, 606), "Nothing is ever uploaded \u2014 100% client-side.", font=font("Lato-Medium.ttf", 44), fill=(203, 213, 225, 255))

    # pills
    px = 96
    for label in ("100% client-side", "Mobile first", "Works offline"):
        fw = font("Lato-Semibold.ttf", 34)
        tw = d.textlength(label, font=fw)
        d.rounded_rectangle([px, 700, px + tw + 56, 700 + 66], radius=33, fill=(37, 99, 235, 60), outline=(59, 130, 246, 160), width=2)
        d.text((px + 28, 700 + 16), label, font=fw, fill=(191, 219, 254, 255))
        px += tw + 88

    # mock editor window
    wx0, wy0, wx1, wy1 = 838, 190, 1462, 890
    win_shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(win_shadow).rounded_rectangle([wx0, wy0 + 18, wx1, wy1 + 18], radius=26, fill=(2, 6, 23, 170))
    img.alpha_composite(win_shadow.filter(ImageFilter.GaussianBlur(28)))
    d.rounded_rectangle([wx0, wy0, wx1, wy1], radius=26, fill=(255, 255, 255, 255))
    d.rounded_rectangle([wx0, wy0, wx1, wy0 + 66], radius=26, fill=(241, 245, 249, 255))
    d.rectangle([wx0, wy0 + 44, wx1, wy0 + 66], fill=(241, 245, 249, 255))
    for i, col in enumerate([(248, 113, 113, 255), (251, 191, 36, 255), (52, 211, 153, 255)]):
        d.ellipse([wx0 + 26 + i * 30, wy0 + 24, wx0 + 46 + i * 30, wy0 + 44], fill=col)

    # page inside window
    px0, py0, px1, py1 = wx0 + 150, wy0 + 108, wx1 - 60, wy1 - 54
    d.rectangle([px0, py0, px1, py1], fill=(255, 255, 255, 255), outline=(226, 232, 240, 255), width=2)
    for i, wf in enumerate([0.94, 0.72, 0.88, 0.6, 0.82, 0.66, 0.9, 0.5]):
        yy = py0 + 42 + i * 46
        rr = [px0 + 34, yy, px0 + 34 + (px1 - px0 - 68) * wf, yy + 20]
        d.rounded_rectangle(rr, radius=10, fill=(226, 232, 240, 255))
    # a highlight annotation + redaction box
    d.rounded_rectangle([px0 + 34, py0 + 180, px0 + 34 + (px1 - px0 - 68) * 0.7, py0 + 218], radius=6, fill=(250, 204, 21, 130))
    d.rounded_rectangle([px0 + 34, py0 + 320, px0 + 34 + (px1 - px0 - 68) * 0.34, py0 + 358], radius=6, fill=(15, 23, 42, 255))

    # floating toolbar
    tb = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    td = ImageDraw.Draw(tb)
    tx0, ty0 = wx0 + 120, wy1 - 96
    td.rounded_rectangle([tx0, ty0 + 12, tx0 + 356, ty0 + 84], radius=22, fill=(2, 6, 23, 120))
    img.alpha_composite(tb.filter(ImageFilter.GaussianBlur(16)))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([tx0, ty0, tx0 + 356, ty0 + 72], radius=20, fill=(15, 23, 42, 255))
    for i in range(5):
        cx = tx0 + 40 + i * 68
        d.rounded_rectangle([cx - 22, ty0 + 14, cx + 22, ty0 + 58], radius=12,
                            fill=(37, 99, 235, 255) if i == 2 else (51, 65, 85, 255))

    return img.convert("RGB")


if __name__ == "__main__":
    os.makedirs("public/icons", exist_ok=True)
    base = make_icon(1024)
    base.resize((512, 512), Image.LANCZOS).save("public/icons/icon-512.png")
    base.resize((192, 192), Image.LANCZOS).save("public/icons/icon-192.png")
    base.save("public/icons/icon-1024.png")

    # maskable: 80% safe zone on the brand blue
    bg = Image.new("RGBA", (512, 512), BLUE_DARK)
    inner = base.resize((410, 410), Image.LANCZOS)
    bg.alpha_composite(inner, ((512 - 410) // 2, (512 - 410) // 2))
    bg.save("public/icons/icon-maskable.png")

    make_og().save("public/og-image.png", quality=92)
    print("assets written")