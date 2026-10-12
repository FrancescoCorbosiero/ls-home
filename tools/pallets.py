#!/usr/bin/env python3
"""Generate the isometric pallet illustrations in public/img/pallets/ (to scale).

Run: python3 tools/pallets.py   (no dependencies)
All four drawings share one viewBox, so switching formats shows real relative size.
"""
import math, os

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'img', 'pallets')
C, S = math.cos(math.radians(30)), math.sin(math.radians(30))
K = 2.0  # px per cm

def iso(x, y, z):
    return ((x - y) * C * K, ((x + y) * S - z) * K)

def poly(pts, fill, stroke='#04233b', sw=0.8, op=1):
    p = ' '.join(f'{a:.1f},{b:.1f}' for a, b in pts)
    o = f' fill-opacity="{op}"' if op != 1 else ''
    return f'<polygon points="{p}" fill="{fill}"{o} stroke="{stroke}" stroke-opacity=".55" stroke-width="{sw}" stroke-linejoin="round"/>'

def box(x0, y0, z0, dx, dy, dz, top, left, right, **kw):
    x1, y1, z1 = x0 + dx, y0 + dy, z0 + dz
    t = [iso(x0, y0, z1), iso(x1, y0, z1), iso(x1, y1, z1), iso(x0, y1, z1)]
    l = [iso(x0, y1, z0), iso(x1, y1, z0), iso(x1, y1, z1), iso(x0, y1, z1)]   # face toward +y (left-front)
    r = [iso(x1, y0, z0), iso(x1, y1, z0), iso(x1, y1, z1), iso(x1, y0, z1)]   # face toward +x (right-front)
    return [poly(l, left, **kw), poly(r, right, **kw), poly(t, top, **kw)]

WOOD = ('#f1dfbd', '#d9bd8c', '#bf9f69')
CARTON = ('#ffffff', '#e6edf2', '#cdd9e2')

def pallet(L, W, layers, bx, by, bz=28):
    parts = []
    blk = 10 if W >= 60 else 8
    xs = [0, (L - blk) / 2, L - blk]
    ys = [0, (W - blk) / 2, W - blk]
    # bottom boards (lengthwise), then blocks, back to front
    for y in ys:
        parts += box(0, y, 0, L, blk, 2.2, *WOOD)
    for x in xs:
        for y in ys:
            parts += box(x, y, 2.2, blk, blk, 7.8, *WOOD)
    # top deck: slats running across the width
    n = 5 if L >= 100 else 3
    sw = 14 if L >= 100 else 13
    gap = (L - n * sw) / (n - 1)
    for i in range(n):
        parts += box(i * (sw + gap), 0, 10, sw, W, 2.4, *WOOD)
    # cartons, back to front, bottom to top
    z0 = 12.4
    nx, ny = round(L / bx), round(W / by)
    for k in range(layers):
        for i in range(nx):
            for j in range(ny):
                parts += box(i * bx + 0.6, j * by + 0.6, z0 + k * bz, bx - 1.2, by - 1.2, bz - 0.6, *CARTON)
    top = z0 + layers * bz
    # lime tape on the top layer
    for i in range(nx):
        for j in range(ny):
            cx = i * bx + bx / 2
            parts.append(poly([iso(cx - 2.2, j * by + 0.6, top), iso(cx + 2.2, j * by + 0.6, top),
                               iso(cx + 2.2, (j + 1) * by - 0.6, top), iso(cx - 2.2, (j + 1) * by - 0.6, top)],
                              '#e8f197', stroke='#04233b', sw=0.4))
    # stretch film: translucent shell + sheen
    film = box(-0.4, -0.4, z0 - 2, L + 0.8, W + 0.8, top - z0 + 2.4, '#ffffff', '#ffffff', '#ffffff', stroke='#0a97b0', sw=0.6, op=0.14)
    parts += film[:2]
    a, b = iso(L * 0.15, W + 0.4, z0 + 4), iso(L * 0.55, W + 0.4, top - 2)
    parts.append(f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" stroke="#fff" stroke-opacity=".7" stroke-width="2.2" stroke-linecap="round"/>')
    return parts

FORMATS = {
    'eur':       dict(L=120, W=80, layers=3, bx=40, by=40, label='Pallet EPAL 120 × 80 cm'),
    'industriale': dict(L=120, W=100, layers=3, bx=40, by=50, label='Pallet industriale 120 × 100 cm'),
    'mezzo':     dict(L=80, W=60, layers=2, bx=40, by=30, label='Mezzo pallet 80 × 60 cm'),
    'quarto':    dict(L=60, W=40, layers=2, bx=30, by=40, label='Quarto di pallet 60 × 40 cm'),
}

# Shared frame = bounding box of the largest drawing (industrial) + ground shadow room.
def bounds(L, W, H):
    pts = [iso(x, y, z) for x in (0, L) for y in (0, W) for z in (0, H)]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)

minx, miny, maxx, maxy = bounds(120, 100, 12.4 + 3 * 28)
minx, miny, maxx, maxy = minx - 12, miny - 12, maxx + 12, maxy + 22
for name, f in FORMATS.items():
    L, W = f['L'], f['W']
    # ground shadow under the pallet footprint
    sh = [iso(-4, -4, 0), iso(L + 6, -4, 0), iso(L + 6, W + 8, 0), iso(-4, W + 8, 0)]
    shadow = '<polygon points="{}" fill="#04233b" fill-opacity=".10"/>'.format(' '.join(f'{a:.1f},{b + 3:.1f}' for a, b in sh))
    body = ''.join(pallet(L, W, f['layers'], f['bx'], f['by']))
    # Centre smaller formats on the same ground point as the big one.
    ox = (iso(120, 100, 0)[0] + iso(0, 0, 0)[0]) / 2 - (iso(L, W, 0)[0] + iso(0, 0, 0)[0]) / 2
    oy = iso(120, 100, 0)[1] - iso(L, W, 0)[1]
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{minx:.0f} {miny:.0f} {maxx - minx:.0f} {maxy - miny:.0f}" '
           f'width="{maxx - minx:.0f}" height="{maxy - miny:.0f}" role="img" aria-label="{f["label"]}">'
           f'<g transform="translate({ox:.1f} {oy:.1f})">{shadow}{body}</g></svg>\n')
    with open(os.path.join(OUT, f'{name}.svg'), 'w') as fh:
        fh.write(svg)
    print(name, len(svg))
