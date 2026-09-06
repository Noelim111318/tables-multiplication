#!/usr/bin/env python3
"""
Régénère les icônes de l'appli : un gros « × » posé sur une tuile jaune, sur le
ciel violet étoilé de l'appli.

    pip install pillow
    python3 tools/make-icon.py

Écrit  icons/icon-192.png, icons/icon-512.png, icons/icon-512-maskable.png,
       icons/apple-touch-icon.png  et  favicon.ico

Aucune police n'est nécessaire : le « × » est dessiné géométriquement.
Modifie les constantes de couleur / la géométrie ci-dessous pour changer le style.
"""
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = os.path.join(ROOT, "icons")

S = 2048                        # taille de travail suréchantillonnée (-> 512)
LANCZOS = Image.Resampling.LANCZOS

BASE_LOW = (18, 7, 31)          # #12071F  bas du fond
BASE_TOP = (28, 13, 47)         # #1C0D2F  haut du fond
GLOW = (124, 92, 255)           # halo violet (comme le fond de l'appli)
INK = (23, 10, 38)              # couleur du « × »
Y_TOP = (255, 234, 120)         # haut de la tuile
Y_BOT = (244, 199, 0)           # bas de la tuile
Y_RIM = (196, 148, 0)           # liseré de la tuile

TILE = 0.66                     # côté de la tuile, en fraction de l'icône
TILE_RADIUS = 0.30             # arrondi des coins de la tuile (fraction du côté)
ARM_LEN = 0.86                  # longueur d'une barre du « × » (fraction du côté)
ARM_W = 0.205                   # épaisseur d'une barre (fraction du côté)


def vgrad(w, h, top, bot):
    col = Image.new("RGB", (1, h))
    px = col.load()
    for y in range(h):
        t = y / max(1, h - 1)
        px[0, y] = tuple(round(top[i] + (bot[i] - top[i]) * t) for i in range(3))
    return col.resize((w, h))


def render(content_scale=1.0, rounded=True):
    # --- fond : dégradé vertical + halo violet en haut ---
    img = vgrad(S, S, BASE_TOP, BASE_LOW).convert("RGBA")
    g = Image.radial_gradient("L").resize((int(S * 2.2), int(S * 2.2)), LANCZOS)
    glow_a = Image.new("L", (S, S), 0)
    glow_a.paste(g, (int(S * 0.5 - g.width / 2), int(S * 0.26 - g.height / 2)))
    glow_a = glow_a.point(lambda v: int(v * 0.50))
    img = Image.composite(Image.new("RGBA", (S, S), GLOW + (255,)), img, glow_a)

    d = ImageDraw.Draw(img)
    cx, cy = S / 2, S / 2

    # --- petites étoiles ---
    for fx, fy, rr, a in [(0.16, 0.15, 7, 90), (0.84, 0.12, 11, 135), (0.90, 0.46, 6, 80),
                          (0.10, 0.55, 8, 95), (0.20, 0.85, 6, 80), (0.80, 0.87, 9, 115),
                          (0.50, 0.06, 5, 70), (0.94, 0.72, 5, 70), (0.07, 0.31, 5, 65)]:
        x = cx + (fx * S - cx) * content_scale
        y = cy + (fy * S - cy) * content_scale
        r = rr * 4 * content_scale
        d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255, a))

    # --- tuile jaune (carré aux coins très arrondis) ---
    tw = S * TILE * content_scale
    tx0, ty0 = cx - tw / 2, cy - tw / 2
    tx1, ty1 = tx0 + tw, ty0 + tw
    rad = tw * TILE_RADIUS

    shape = Image.new("L", (S, S), 0)
    ImageDraw.Draw(shape).rounded_rectangle([tx0, ty0, tx1, ty1], radius=rad, fill=255)

    # ombre portée
    sh = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    sh.paste((0, 0, 0, 140), (0, int(S * 0.015)), shape)
    sh = sh.filter(ImageFilter.GaussianBlur(int(S * 0.032)))
    img = Image.alpha_composite(img, sh)

    # remplissage dégradé + liseré
    fill = vgrad(S, S, Y_TOP, Y_BOT).convert("RGBA")
    fill.putalpha(shape)
    img = Image.alpha_composite(img, fill)
    ImageDraw.Draw(img).rounded_rectangle(
        [tx0, ty0, tx1, ty1], radius=rad, outline=Y_RIM + (170,), width=int(S * 0.006))

    # reflet doux en haut de la tuile
    hl = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(hl).rounded_rectangle(
        [tx0 + tw * 0.12, ty0 + tw * 0.10, tx1 - tw * 0.12, ty0 + tw * 0.42],
        radius=rad * 0.6, fill=(255, 255, 255, 55))
    hl = hl.filter(ImageFilter.GaussianBlur(int(S * 0.03)))
    hl.putalpha(Image.composite(hl.getchannel("A"), Image.new("L", (S, S), 0), shape))
    img = Image.alpha_composite(img, hl)

    # --- le « × » : deux barres arrondies croisées ---
    arm_len = tw * ARM_LEN
    arm_w = tw * ARM_W
    bar = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(bar).rounded_rectangle(
        [cx - arm_len / 2, cy - arm_w / 2, cx + arm_len / 2, cy + arm_w / 2],
        radius=arm_w / 2, fill=INK + (255,))
    x_layer = Image.alpha_composite(
        bar.rotate(45, resample=Image.BICUBIC, center=(cx, cy)),
        bar.rotate(-45, resample=Image.BICUBIC, center=(cx, cy)))
    # borne le « × » à la tuile pour qu'il ne déborde jamais des coins
    x_layer.putalpha(Image.composite(
        x_layer.getchannel("A"), Image.new("L", (S, S), 0), shape))
    img = Image.alpha_composite(img, x_layer)

    # --- coins arrondis transparents (icônes "any") ---
    if rounded:
        mask = Image.new("L", (S, S), 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            [0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=255)
        img.putalpha(Image.composite(
            img.getchannel("A"), Image.new("L", (S, S), 0), mask))
    return img.resize((512, 512), LANCZOS)


def flatten(rgba):
    out = Image.new("RGB", rgba.size, BASE_LOW)
    out.paste(rgba, (0, 0), rgba)
    return out


def main():
    os.makedirs(ICONS, exist_ok=True)
    any_icon = render(1.0, rounded=True)
    any_icon.save(os.path.join(ICONS, "icon-512.png"))
    any_icon.resize((192, 192), LANCZOS).save(os.path.join(ICONS, "icon-192.png"))
    flatten(render(0.80, rounded=False)).save(os.path.join(ICONS, "icon-512-maskable.png"))
    flatten(render(0.86, rounded=False)).resize((180, 180), LANCZOS).save(
        os.path.join(ICONS, "apple-touch-icon.png"))
    any_icon.resize((64, 64), LANCZOS).save(
        os.path.join(ROOT, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    print("Icônes régénérées :", ICONS)


if __name__ == "__main__":
    main()
