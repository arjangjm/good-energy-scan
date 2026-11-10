#!/usr/bin/env python3
"""Good Energy QR generator.

Makes the Good Energy lightning-bolt smiley QR for any URL, in two styles:
  inverted  white modules on black (the original design)
  standard  black modules on white (safest for phone cameras)

Every output is decoded with three different readers, plain and with blur, small
sizes, JPEG damage and a camera tilt. The script exits with code 1 if any check
fails, so a bad code never reaches print.

Usage:
  python3 ge_qr.py --url https://drinkgood.energy --out out/brand
  python3 ge_qr.py --url-file urls.txt --out out/cans      (one QR per line)

Needs: pip install segno pillow numpy opencv-python-headless zxing-cpp pyzbar
(pyzbar also needs the zbar system library; it is skipped if missing.)
"""
import argparse, json, os, sys
from pathlib import Path

import numpy as np
import segno
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
SMILEY = json.loads((HERE / 'smiley.json').read_text())

STYLES = {
    'inverted': {'bg': (0, 0, 0), 'fg': (255, 255, 255)},
    'standard': {'bg': (255, 255, 255), 'fg': (0, 0, 0)},
}


def make_matrix(url, min_version, max_version):
    """QR at error level H. Versions 7+ put an alignment pattern in the center, under the logo."""
    for v in range(min_version, max_version + 1):
        try:
            q = segno.make(url, error='H', version=v, boost_error=False)
            return q, np.array([[1 if c else 0 for c in row] for row in q.matrix], dtype=np.uint8)
        except segno.DataOverflowError:
            continue
    raise SystemExit(f'URL too long for a center logo (max version {max_version}): {url!r}')


def field_box(n, max_share):
    """Biggest square center field (same parity as n, so it sits dead center) that covers
    at most max_share of the code's area. Tested: 16% keeps every reader passing."""
    f = n - 2
    while f > 5 and f * f > max_share * n * n:
        f -= 2
    a = (n - f) // 2
    return a, a + f


def render(url, style, out_png, out_svg, px=24, quiet=4, max_share=0.16, logo_scale=0.92,
           min_version=4, max_version=6):
    q, m = make_matrix(url, min_version, max_version)
    n = m.shape[0]
    a, b = field_box(n, max_share)
    cleared = m.copy()
    cleared[a:b, a:b] = 0
    # keep the 4 corner modules of the field as data, so the field reads as a rounded shape
    for (r, c) in [(a, a), (a, b - 1), (b - 1, a), (b - 1, b - 1)]:
        cleared[r, c] = m[r, c]

    colors = STYLES[style]
    total = n + 2 * quiet
    ss = 4  # supersample for smooth bolt edges
    big = Image.new('RGB', (total * px * ss, total * px * ss), colors['bg'])
    d = ImageDraw.Draw(big)
    for r in range(n):
        for c in range(n):
            if cleared[r, c]:
                x0 = (c + quiet) * px * ss
                y0 = (r + quiet) * px * ss
                d.rectangle([x0, y0, x0 + px * ss - 1, y0 + px * ss - 1], fill=colors['fg'])

    # smiley, centered in the field
    fw = (b - a) * px * ss
    lw = fw * logo_scale
    lh = lw / SMILEY['aspect']
    ox = (a + quiet) * px * ss + (fw - lw) / 2
    oy = (a + quiet) * px * ss + (fw - lh) / 2
    polys = [[(ox + x * lw, oy + y * lh) for x, y in p] for p in SMILEY['polygons']]
    for p in polys:
        d.polygon(p, fill=colors['fg'])
    img = big.resize((total * px, total * px), Image.LANCZOS)
    img.save(out_png)

    # SVG: merged horizontal runs of modules + the smiley as vector paths
    unit = 10
    hexc = lambda rgb: '#%02x%02x%02x' % rgb
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {total*unit} {total*unit}" '
             f'shape-rendering="crispEdges"><rect width="100%" height="100%" fill="{hexc(colors["bg"])}"/>',
             f'<path fill="{hexc(colors["fg"])}" d="']
    for r in range(n):
        c = 0
        while c < n:
            if cleared[r, c]:
                s = c
                while c < n and cleared[r, c]:
                    c += 1
                parts.append(f'M{(s+quiet)*unit} {(r+quiet)*unit}h{(c-s)*unit}v{unit}h-{(c-s)*unit}z')
            else:
                c += 1
    parts.append('"/>')
    k = unit / (px * ss)
    sd = ''.join('M' + 'L'.join(f'{x*k:.2f} {y*k:.2f}' for x, y in p) + 'Z' for p in polys)
    parts.append(f'<path fill="{hexc(colors["fg"])}" shape-rendering="geometricPrecision" d="{sd}"/></svg>')
    Path(out_svg).write_text(''.join(parts))
    return {'version': q.version, 'error': q.error, 'mode': q.mode, 'modules': n,
            'field_modules': b - a, 'field_share_of_area': round(((b - a) ** 2) / (n * n), 3)}


# ---------------- verification ----------------

def _readers():
    import cv2, zxingcpp
    out = []

    def zx_plain(g):
        return [r.text for r in zxingcpp.read_barcodes(g, try_invert=False)]

    def zx_invert(g):
        return [r.text for r in zxingcpp.read_barcodes(g, try_invert=True)]

    def cv_plain(g):
        t, _, _ = cv2.QRCodeDetector().detectAndDecode(g)
        return [t] if t else []

    out += [('zxing', zx_plain), ('zxing+invert', zx_invert), ('opencv', cv_plain)]
    try:
        from pyzbar import pyzbar

        def zb_plain(g):
            return [r.data.decode('utf-8', 'replace') for r in pyzbar.decode(Image.fromarray(g))]
        out.append(('zbar', zb_plain))
    except Exception:
        pass
    return out


def _degrade(gray, modules):
    """Damage scaled to the code's density: tests run at a fixed number of pixels per module,
    so a bigger code is not punished for having smaller modules."""
    import cv2
    yield 'clean', gray
    for ppm in (6, 4.5):
        size = int(modules * ppm)
        yield f'small {ppm}px/module', cv2.resize(gray, (size, size), interpolation=cv2.INTER_AREA)
    base = int(modules * 9)
    s = cv2.resize(gray, (base, base), interpolation=cv2.INTER_AREA)
    yield 'blur', cv2.GaussianBlur(s, (0, 0), 1.6)
    ok, enc = cv2.imencode('.jpg', s, [cv2.IMWRITE_JPEG_QUALITY, 35])
    yield 'jpeg 35', cv2.imdecode(enc, 0)
    # camera tilt: perspective warp with a grey surround
    pad = cv2.copyMakeBorder(s, 60, 60, 60, 60, cv2.BORDER_CONSTANT, value=int(s[0, 0]))
    H, W = pad.shape
    src = np.float32([[0, 0], [W, 0], [W, H], [0, H]])
    dst = np.float32([[W * .06, H * .02], [W * .94, H * .10], [W * .90, H * .95], [W * .03, H * .99]])
    yield 'tilt', cv2.warpPerspective(pad, cv2.getPerspectiveTransform(src, dst), (W, H), borderValue=128)


def verify(png, url, style, modules):
    """Standard codes must read with every reader as-is. Inverted codes are checked two ways:
    readers that invert on their own (zxing+invert), and all readers on a flipped copy,
    which is what an inverting camera app does."""
    import cv2
    gray = cv2.imread(str(png), 0)
    results, fails = [], []
    for label, img in _degrade(gray, modules):
        variants = [('as printed', img)]
        if style == 'inverted':
            variants.append(('flipped', 255 - img))
        for vname, v in variants:
            for rname, fn in _readers():
                if style == 'inverted' and vname == 'as printed' and rname != 'zxing+invert':
                    continue  # plain readers can't read light-on-dark; that's expected
                got = fn(v)
                ok = url in got
                results.append((label, vname, rname, ok))
                if not ok:
                    fails.append(f'{label} / {vname} / {rname}')
    return results, fails


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--url')
    ap.add_argument('--url-file')
    ap.add_argument('--out', required=True, help='output prefix, e.g. out/brand')
    ap.add_argument('--styles', default='inverted,standard')
    ap.add_argument('--max-share', type=float, default=0.16, help='largest share of the code area the logo field may cover')
    ap.add_argument('--px', type=int, default=24, help='pixels per module in the PNG')
    ap.add_argument('--min-version', type=int, default=4)
    args = ap.parse_args()
    urls = [args.url] if args.url else [u.strip() for u in Path(args.url_file).read_text().splitlines() if u.strip()]
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    bad = 0
    for i, url in enumerate(urls, 1):
        prefix = args.out if len(urls) == 1 else f'{args.out}-{i:03d}'
        for style in args.styles.split(','):
            png, svg = f'{prefix}-{style}.png', f'{prefix}-{style}.svg'
            info = render(url, style, png, svg, px=args.px, max_share=args.max_share, min_version=args.min_version)
            results, fails = verify(png, url, style, info['modules'] + 8)
            passed = sum(1 for r in results if r[3])
            status = 'PASS' if not fails else 'FAIL'
            print(f'{status} {png} v{info["version"]}-{info["error"]} {info["mode"]} '
                  f'{info["modules"]}x{info["modules"]} field {info["field_modules"]} '
                  f'({info["field_share_of_area"]:.0%} of area) checks {passed}/{len(results)}')
            for f in fails:
                print('   failed:', f)
            bad += bool(fails)
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
