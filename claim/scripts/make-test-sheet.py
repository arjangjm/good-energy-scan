#!/usr/bin/env python3
"""Builds the iPhone test sheet: one big QR per page, so the camera only ever sees one code.

Each code gets two pages: the black design first, then the same code in white as a backup.
The last code uses an all-caps link, which makes a smaller QR.

Usage: python3 scripts/make-test-sheet.py codes.csv out.pdf     (csv columns: n,code,url)
Every QR is checked by ge_qr.py's readers. The script stops if one fails.
"""
import csv, sys, tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'qr'))
import ge_qr

W, H = 1654, 2339  # A4 at 200 dpi


def font(size):
    for p in ('/System/Library/Fonts/Helvetica.ttc', '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
              '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'):
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            pass
    return ImageFont.load_default(size)


def page(qr_png, title, lines):
    img = Image.new('RGB', (W, H), 'white')
    d = ImageDraw.Draw(img)
    d.text((W / 2, 170), title, font=font(84), fill='black', anchor='mm')
    qr = Image.open(qr_png).convert('RGB').resize((1180, 1180), Image.LANCZOS)
    img.paste(qr, ((W - 1180) // 2, 330))
    y = 1640
    for text, size in lines:
        d.text((W / 2, y), text, font=font(size), fill='black', anchor='mm')
        y += int(size * 1.7)
    return img


def main():
    src, out = sys.argv[1], sys.argv[2]
    rows = list(csv.DictReader(open(src)))
    pages, tmp = [], Path(tempfile.mkdtemp())
    for i, row in enumerate(rows):
        n, url = row['n'], row['url']
        caps = i == len(rows) - 1
        if caps:
            url = url.upper()  # HTTPS://HOST/C/CODE: all in the QR alphanumeric set
        for style, name in (('inverted', 'black design'), ('standard', 'white backup')):
            png = tmp / f'{n}-{style}.png'
            # Start at the smallest size. If any reader struggles with it, go one size up.
            for min_version in (4, 5, 6):
                info = ge_qr.render(url, style, str(png), str(png.with_suffix('.svg')), min_version=min_version)
                _, fails = ge_qr.verify(png, url, style, info['modules'] + 8)
                if not fails:
                    break
            status = 'PASS' if not fails else 'FAIL'
            print(f'{status} code {n} {style} v{info["version"]} {info["modules"]}x{info["modules"]}{" all-caps" if caps else ""}')
            if fails:
                sys.exit(f'QR check failed for code {n} ({style}): {fails[:3]}')
            hint = ("If no link pops up in 3 seconds, go to the next page." if style == 'inverted'
                    else "Same code as the page before, in white.")
            pages.append(page(png, f'Code #{n}  ·  {name}', [
                ('$0.99  ·  works once' + ('  ·  all-caps link' if caps else ''), 60),
                ('Point your iPhone Camera at the code.', 46),
                (hint, 46),
            ]))
    pages[0].save(out, save_all=True, append_images=pages[1:], resolution=200.0)
    print(f'wrote {out} ({len(pages)} pages)')


if __name__ == '__main__':
    main()
