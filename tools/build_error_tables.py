"""Error tables for the Methods page (#/methods).

Every number comes from data/forsyth.json.gz, which holds the notebook's
out-of-fold estimate for each home (`est`, scored by a model that never saw
the home, 5-fold cross-validation in housing_model_v2.ipynb) next to the
county's value (`cv`). The overall median error from this file is 4.43%,
the same as the run behind data/summary.json, so these tables describe the
same predictions the site shows. Nothing is retrained.

Error for one home = (estimate - county value) / county value.

Output: data/forsyth_errors.json
Run from the repo folder:  python tools/build_error_tables.py
"""
import gzip
import json
import math
from pathlib import Path
from statistics import median

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / 'data' / 'forsyth_errors.json'

MIN_SUBDIVISION = 30   # subdivisions with fewer homes are too small to say much
MIN_MAP_CELL = 15      # map squares with fewer homes are left blank
MAP_CELL_DEG = 0.01    # about 1 km north-south


def summarize(errors):
    """Median miss, share within 10%, and median signed error (bias) for a group."""
    abs_err = [abs(e) for e in errors]
    return {
        'homes': len(errors),
        'median_error_pct': round(median(abs_err) * 100, 2),
        'within_10_pct': round(sum(a <= 0.10 for a in abs_err) / len(abs_err) * 100, 1),
        'median_signed_pct': round(median(errors) * 100, 2),
    }


def main():
    d = json.loads(gzip.open(REPO / 'data' / 'forsyth.json.gz').read())
    H = d['homes']
    subs = H['sub']['v']
    rows = []
    for k in range(len(H['id'])):
        cv, est = H['cv'][k], H['est'][k]
        if not cv or not est:
            continue
        rows.append({
            'cv': cv, 'est': est, 'err': (est - cv) / cv, 'yr': H['yr'][k],
            'sub': subs[H['sub']['i'][k]], 'lat': H['lat'][k], 'lon': H['lon'][k],
        })

    out = {'source': 'data/forsyth.json.gz (out-of-fold estimates from housing_model_v2.ipynb) vs county value, tax year 2025',
           'overall': summarize([r['err'] for r in rows])}

    # by county-value fifth, the same split the notebook uses for range coverage
    rows.sort(key=lambda r: r['cv'])
    names = ['lowest 20%', '20-40%', '40-60%', '60-80%', 'top 20%']
    out['by_price'] = []
    for q, name in enumerate(names):
        part = rows[q * len(rows) // 5:(q + 1) * len(rows) // 5]
        out['by_price'].append({'band': name, 'from': part[0]['cv'], 'to': part[-1]['cv'], **summarize([r['err'] for r in part])})

    # by decade built
    decades = {}
    for r in rows:
        if not r['yr']:
            continue
        y = int(r['yr'])
        key = 'before 1970' if y < 1970 else f'{y // 10 * 10}s'
        decades.setdefault(key, []).append(r['err'])
    order = ['before 1970'] + [f'{y}s' for y in range(1970, 2030, 10)]
    out['by_decade'] = [{'built': k, **summarize(decades[k])} for k in order if k in decades]

    # subdivisions with enough homes: the ten best and ten worst by median miss
    groups = {}
    for r in rows:
        if r['sub']:
            groups.setdefault(r['sub'], []).append(r['err'])
    table = sorted(({'subdivision': s, **summarize(e)} for s, e in groups.items() if len(e) >= MIN_SUBDIVISION),
                   key=lambda x: x['median_error_pct'])
    out['subdivisions_counted'] = len(table)
    out['best_subdivisions'] = table[:10]
    out['worst_subdivisions'] = table[-10:][::-1]

    # map: median miss in squares about 1 km across
    cells = {}
    for r in rows:
        if r['lat'] is None or r['lon'] is None:
            continue
        key = (math.floor(r['lat'] / MAP_CELL_DEG), math.floor(r['lon'] / MAP_CELL_DEG))
        cells.setdefault(key, []).append(abs(r['err']))
    out['map'] = {'cell_deg': MAP_CELL_DEG, 'min_homes': MIN_MAP_CELL,
                  'cells': [[a, b, len(v), round(median(v) * 100, 1)] for (a, b), v in sorted(cells.items()) if len(v) >= MIN_MAP_CELL]}

    # estimate vs county value, counted on a log grid (one dot per home would be 80,000 dots)
    lo, hi, bins = 5.0, 6.6, 40   # log10 dollars: $100k to about $4M
    grid = [[0] * bins for _ in range(bins)]
    for r in rows:
        x = (math.log10(r['cv']) - lo) / (hi - lo) * bins
        y = (math.log10(r['est']) - lo) / (hi - lo) * bins
        if 0 <= x < bins and 0 <= y < bins:
            grid[int(y)][int(x)] += 1
    out['scatter'] = {'log10_from': lo, 'log10_to': hi, 'bins': bins, 'counts': grid}

    OUT.write_text(json.dumps(out, separators=(',', ':')))
    print('wrote', OUT.relative_to(REPO), f"({out['overall']['homes']} homes, median error {out['overall']['median_error_pct']}%)")


if __name__ == '__main__':
    main()
