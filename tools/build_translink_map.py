#!/usr/bin/env python3
"""Turn TransLink's SkyTrain Network Map (PDF -> SVG) into the data the game's map screen uses.

  pdftocairo -svg skytrain-network-map.pdf map.svg
  pdftotext -bbox skytrain-network-map.pdf words.html
  python3 -I tools/build_translink_map.py map.svg words.html game-adj.json site/

Writes site/map-art.js (the artwork) and site/map-data.js (station positions and the exact
track between neighbouring stations, read from the artwork's own line paths).
The map is TransLink's: https://www.translink.ca/schedules-and-maps/transit-system-maps
"""
import json, math, re, sys

svg_path, words_path, adj_path, out_dir = sys.argv[1:5]
svg = open(svg_path, encoding='utf-8').read()
adjinfo = json.load(open(adj_path, encoding='utf-8'))
GAME_ADJ, GAME_LINES = adjinfo['adj'], adjinfo['lines']
body = svg[svg.index('</defs>') + 7:]

NUM = re.compile(r'-?\d+\.?\d*(?:e-?\d+)?')


def parse_tr(a):
    m = re.search(r'transform="matrix\(([^)]*)\)"', a)
    return [float(x) for x in m.group(1).split(',')] if m else [1, 0, 0, 1, 0, 0]


def apply(tr, x, y):
    a, b, c, d, e, f = tr
    return (a * x + c * y + e, b * x + d * y + f)


def colour(c):
    if not c:
        return None
    r, g, b = [float(x.strip('%')) for x in c.split(',')]
    if r < 5 and g > 55 and b > 70: return 'canada'
    if 8 < r < 16 and 30 < g < 40 and 60 < b < 75: return 'expo'
    if r > 95 and g > 78 and b < 5: return 'millennium'
    if r < 5 and 15 < g < 22 and 28 < b < 38: return 'navy'
    if r > 99.5 and g > 99.5 and b > 99.5: return 'white'
    return None


# ---- 1. the line paths, flattened to polylines in map units --------------------------------
def flatten(d, tr):
    toks = re.findall(r'[MLCZ]|-?\d+\.?\d*(?:e-?\d+)?', d)
    pts, i, cur = [], 0, None
    while i < len(toks):
        t = toks[i]
        if t == 'M' or t == 'L':
            cur = apply(tr, float(toks[i + 1]), float(toks[i + 2])); pts.append(cur); i += 3
        elif t == 'C':
            p0 = cur
            p1 = apply(tr, float(toks[i + 1]), float(toks[i + 2]))
            p2 = apply(tr, float(toks[i + 3]), float(toks[i + 4]))
            p3 = apply(tr, float(toks[i + 5]), float(toks[i + 6]))
            for k in range(1, 13):
                u = k / 12
                x = (1 - u) ** 3 * p0[0] + 3 * (1 - u) ** 2 * u * p1[0] + 3 * (1 - u) * u * u * p2[0] + u ** 3 * p3[0]
                y = (1 - u) ** 3 * p0[1] + 3 * (1 - u) ** 2 * u * p1[1] + 3 * (1 - u) * u * u * p2[1] + u ** 3 * p3[1]
                pts.append((x, y))
            cur = p3; i += 7
        else:
            i += 1
    return pts


strokes = []   # (line, polyline)
for m in re.finditer(r'<path ([^>]*?stroke-width="4"[^>]*?)/>', body):
    a = m.group(1)
    c = colour(re.search(r'stroke="rgb\(([^)]*)\)"', a).group(1))
    if c in ('canada', 'expo', 'millennium'):
        strokes.append((c, flatten(re.search(r' d="([^"]*)"', a).group(1), parse_tr(a))))
assert len(strokes) == 5, len(strokes)

# ---- 2. station markers: a coloured ring around a white dot --------------------------------
def bbox(d, tr):
    n = [float(x) for x in NUM.findall(d)]
    pts = [apply(tr, x, y) for x, y in zip(n[0::2], n[1::2])]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)

shapes = []
for m in re.finditer(r'<path ([^>]*)/>', body):
    a = m.group(1)
    d = re.search(r' d="([^"]*)"', a)
    fill = re.search(r'fill="rgb\(([^)]*)\)"', a)
    if d and fill:
        x0, y0, x1, y1 = bbox(d.group(1), parse_tr(a))
        shapes.append((x0, y0, x1, y1, colour(fill.group(1)), d.group(1).count('C')))
rings = [s for s in shapes if s[4] in ('canada', 'expo', 'millennium', 'navy') and 5.2 <= s[2] - s[0] <= 6.3 and abs((s[2] - s[0]) - (s[3] - s[1])) < 0.6 and s[5] >= 4]
whites = [s for s in shapes if s[4] == 'white' and 3.8 <= s[2] - s[0] <= 4.8]
dots = []
for r in rings:
    cx, cy = (r[0] + r[2]) / 2, (r[1] + r[3]) / 2
    if any(abs((w[0] + w[2]) / 2 - cx) < 0.3 and abs((w[1] + w[3]) / 2 - cy) < 0.3 for w in whites):
        dots.append((round(cx, 2), round(cy, 2), r[4]))
dots = sorted(set(dots))

# Where each station is. Approximate positions (read off the map) are snapped to the real markers.
APPROX = {
    'Waterfront': (112.85, 46.09), 'Vancouver City Centre': (86.3, 72.71), 'Yaletown–Roundhouse': (90.53, 95.71),
    'Olympic Village': (100.62, 118.94), 'Broadway–City Hall': (100.62, 146.39), 'King Edward': (100.62, 173.83),
    'Oakridge–41st Avenue': (100.62, 201.27), 'Langara–49th Avenue': (100.62, 228.72), 'Marine Drive': (100.62, 256.16),
    'Bridgeport': (100.62, 283.61), 'Capstan': (100.62, 311.04), 'Aberdeen': (100.59, 338.48), 'Lansdowne': (100.71, 365.92),
    'Richmond–Brighouse': (100.62, 393.37), 'Templeton': (73.91, 297.46), 'Sea Island Centre': (45.4, 297.46), 'YVR–Airport': (16.95, 297.46),
    'Burrard': (98.03, 46.08), 'Granville': (109.88, 72.71), 'Stadium–Chinatown': (132.89, 95.71), 'Main Street–Science World': (156.01, 118.93),
    'Nanaimo': (174.04, 173.82), '29th Avenue': (189.57, 189.3), 'Joyce–Collingwood': (204.95, 204.79), 'Patterson': (220.43, 220.28),
    'Metrotown': (235.84, 235.76), 'Royal Oak': (263.41, 256.07), 'Edmonds': (289.71, 256.13), '22nd Street': (316.02, 256.09),
    'New Westminster': (343.42, 235.94), 'Columbia': (358.9, 220.45), 'Scott Road': (418.83, 220.45), 'Gateway': (418.76, 247.9),
    'Surrey Central': (418.76, 275.34), 'King George': (418.86, 302.77), 'Sapperton': (390.05, 189.3), 'Braid': (405.54, 173.82),
    'VCC–Clark': (147.89, 133.04), 'Renfrew': (200.5, 133.05), 'Rupert': (226.8, 133.05), 'Gilmore': (253.1, 133.05),
    'Brentwood Town Centre': (279.38, 133.05), 'Holdom': (305.71, 133.05), 'Sperling–Burnaby Lake': (332.01, 133.05),
    'Lake City Way': (358.31, 133.05), 'Burquitlam': (418.81, 95.71), 'Moody Centre': (431.97, 82.95), 'Inlet Centre': (462.16, 82.96),
    'Coquitlam Central': (492.67, 82.96), 'Lincoln': (505.56, 58.05), 'Lafarge Lake–Douglas': (505.56, 36.34),
}
# Interchanges drawn as capsules (and Commercial-Broadway, two dots joined by a capsule)
CAPSULES = {'Production Way–University': (384.6, 135.7), 'Lougheed Town Centre': (412.4, 138.5)}
CB_EXPO, CB_MILL = (161.05, 146.31), (174.25, 133.11)

def snap(p):
    best = min(dots, key=lambda d: math.hypot(d[0] - p[0], d[1] - p[1]))
    assert math.hypot(best[0] - p[0], best[1] - p[1]) < 1.0, ('no marker near', p)
    return (best[0], best[1])

POS = {n: snap(p) for n, p in APPROX.items()}
POS['Commercial–Broadway'] = (round((CB_EXPO[0] + CB_MILL[0]) / 2, 2), round((CB_EXPO[1] + CB_MILL[1]) / 2, 2))
POS.update(CAPSULES)
# where a line meets an interchange (the marker for that line)
ATTACH = {('Commercial–Broadway', 'expo'): snap(CB_EXPO), ('Commercial–Broadway', 'millennium'): snap(CB_MILL)}
assert set(POS) == set(GAME_ADJ), set(POS) ^ set(GAME_ADJ)

# ---- 3. cross-check every name against the map's own label text ---------------------------
words = [(float(a), float(b), float(c), float(d), t) for a, b, c, d, t in re.findall(
    r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</word>', open(words_path, encoding='utf-8').read())]
def norm(s): return re.sub(r'[^a-z0-9]', '', s.lower())
bad = []
for n, (x, y) in POS.items():
    tokens = [norm(w) for w in re.split(r'[–\s-]+', n) if len(norm(w)) >= 3]
    closest = []
    for tok in tokens:
        ds = [math.hypot((w[0] + w[2]) / 2 - x, (w[1] + w[3]) / 2 - y) for w in words if tok[:4] in norm(w[4])]
        closest.append(min(ds) if ds else 1e9)
    # every word of the name is written within 90 map units of the marker, and one of them is right beside it
    if not tokens or max(closest) > 90 or min(closest) > 45: bad.append((n, [round(c) for c in closest]))
print('names not found near their marker:', bad or 'none')
assert not bad

# ---- 4. the track between every pair of neighbouring stations ------------------------------
def project(poly, p):
    """(distance to polyline, arc length along it) of the closest point."""
    best, acc = (1e9, 0), 0
    for i in range(1, len(poly)):
        (x1, y1), (x2, y2) = poly[i - 1], poly[i]
        dx, dy = x2 - x1, y2 - y1
        L2 = dx * dx + dy * dy
        t = 0 if L2 == 0 else max(0, min(1, ((p[0] - x1) * dx + (p[1] - y1) * dy) / L2))
        qx, qy = x1 + t * dx, y1 + t * dy
        d = math.hypot(p[0] - qx, p[1] - qy)
        if d < best[0]: best = (d, acc + t * math.sqrt(L2))
        acc += math.sqrt(L2)
    return best

def slice_poly(poly, s0, s1):
    flip = s0 > s1
    lo, hi = min(s0, s1), max(s0, s1)
    out, acc = [], 0
    def at(s):
        a = 0
        for i in range(1, len(poly)):
            L = math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1])
            if a + L >= s - 1e-9:
                t = 0 if L == 0 else (s - a) / L
                return (poly[i - 1][0] + t * (poly[i][0] - poly[i - 1][0]), poly[i - 1][1] + t * (poly[i][1] - poly[i - 1][1]))
            a += L
        return poly[-1]
    out.append(at(lo)); a = 0
    for i in range(1, len(poly)):
        a += math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1])
        if lo < a < hi: out.append(poly[i])
    out.append(at(hi))
    return out[::-1] if flip else out

EDGES, report = {}, []
for a in sorted(GAME_ADJ):
    for b in GAME_ADJ[a]:
        if a > b: continue
        shared = [l for l in GAME_LINES[a] if l in GAME_LINES[b]]
        best = None
        for line, poly in strokes:
            if line not in shared: continue
            pa = ATTACH.get((a, line), POS[a]); pb = ATTACH.get((b, line), POS[b])
            da, sa = project(poly, pa); db, sb = project(poly, pb)
            score = max(da, db)
            if best is None or score < best[0]: best = (score, poly, pa, pb, sa, sb, line)
        score, poly, pa, pb, sa, sb, line = best
        if score < 4.0:
            pts = slice_poly(poly, sa, sb)
        else:
            # the two stations sit on different paths that meet (the airport branch joins the main Canada Line)
            pts = None
            for l1, p1 in strokes:
                for l2, p2 in strokes:
                    if l1 != l2 or p1 is p2 or l1 not in shared: continue
                    pa_ = ATTACH.get((a, l1), POS[a]); pb_ = ATTACH.get((b, l2), POS[b])
                    da, sa1 = project(p1, pa_); db, sb2 = project(p2, pb_)
                    if da > 3 or db > 3: continue
                    total = lambda q: sum(math.hypot(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]) for i in range(1, len(q)))
                    for end, s_end in ((p1[0], 0), (p1[-1], total(p1))):      # an end of the first path lies on the second
                        dj, sj = project(p2, end)
                        if dj < 3: pts = slice_poly(p1, sa1, s_end) + slice_poly(p2, sj, sb2); pa, pb = pa_, pb_
                    for end, s_end in ((p2[0], 0), (p2[-1], total(p2))):      # or an end of the second path lies on the first
                        dj, sj = project(p1, end)
                        if dj < 3: pts = slice_poly(p1, sa1, sj) + slice_poly(p2, s_end, sb2); pa, pb = pa_, pb_
            assert pts, (a, b, score)
        pts[0], pts[-1] = pa, pb
        if pa != POS[a]: pts.insert(0, POS[a])
        if pb != POS[b]: pts.append(POS[b])
        pts = [pts[0]] + [p for i, p in enumerate(pts[1:], 1) if math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 0.05]
        EDGES[a + '|' + b] = [[round(x, 2), round(y, 2)] for x, y in pts]
        report.append((score, a, b))
print('edges:', len(EDGES), ' worst fit to the line path: %.2f units' % max(report)[0], max(report)[1:])

# ---- 5. write the files -------------------------------------------------------------------
LINES_AT = {n: sorted(GAME_LINES[n]) for n in POS}
data = {'view': {'x': 0, 'y': 0, 'w': 514.8, 'h': 406.99}, 'stations': {n: [POS[n][0], POS[n][1]] for n in sorted(POS)},
        'interchanges': ['Waterfront', 'Commercial–Broadway', 'Lougheed Town Centre', 'Production Way–University'],
        'linesAt': LINES_AT, 'edges': EDGES}
with open(out_dir + '/map-data.js', 'w', encoding='utf-8') as f:
    f.write('// Generated by tools/build_translink_map.py from TransLink\'s SkyTrain Network Map. Do not edit by hand.\n')
    f.write('(function (root, factory) {\n  if (typeof module === \'object\' && module.exports) module.exports = factory();\n  else root.SkytrainMapData = factory();\n})(this, function () {\n  return ')
    f.write(json.dumps(data, ensure_ascii=False, separators=(',', ':')))
    f.write(';\n});\n')
inner = svg[svg.index('>', svg.index('<svg')) + 1: svg.rindex('</svg>')]
inner = re.sub(r'\s+', ' ', inner)
with open(out_dir + '/map-art.js', 'w', encoding='utf-8') as f:
    f.write('// TransLink SkyTrain Network Map, as vector artwork (used with TransLink\'s permission).\n')
    f.write('// Source: https://www.translink.ca/schedules-and-maps/transit-system-maps  (SkyTrain Network Map PDF)\n')
    f.write('window.SkytrainMapArt = ' + json.dumps(inner, ensure_ascii=False) + ';\n')
print('wrote', out_dir + '/map-data.js', 'and', out_dir + '/map-art.js')
