"""Get the site ready after editing planner-config.json or any file in assets/.

1. Writes assets/site-data.js from planner-config.json, data/summary.json and
   data/forsyth_errors.json (made by tools/build_error_tables.py).
   The page reads its numbers from that script instead of fetching the JSON,
   so it also works when index.html is opened straight from the disk.
2. Stamps one version (a hash of the asset files) on every script tag in
   index.html, so browsers load the new files instead of an old saved copy.

Run from the repo folder:  python tools/build.py
Check only (used by the tests):  python tools/build.py --check
"""
import hashlib
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SITE_DATA = REPO / 'assets' / 'site-data.js'
INDEX = REPO / 'index.html'


def model_summary():
    """The accuracy numbers the How the numbers work page shows (Forsyth only)."""
    s = json.loads((REPO / 'data' / 'summary.json').read_text())
    m = s['metrics']
    final = {k: v for k, v in m['forsyth_final'].items() if k != 'features'}
    return {
        'homes': m['rows']['forsyth'],
        'final': final,
        'steps': m['forsyth_compare'],
        'error_histogram': s['forsyth']['err_hist'],
        'sales_check': m['alpharetta_sales_check'],
    }


def site_data_text():
    config = json.loads((REPO / 'planner-config.json').read_text())
    errors = json.loads((REPO / 'data' / 'forsyth_errors.json').read_text())
    return ('// Made by tools/build.py from planner-config.json and data/*.json. Do not edit by hand.\n'
            f'window.PLANNER_CONFIG = {json.dumps(config, ensure_ascii=False)};\n'
            f'window.MODEL_SUMMARY = {json.dumps(model_summary())};\n'
            f'window.ERROR_TABLES = {json.dumps(errors)};\n')


def asset_version(site_data):
    h = hashlib.sha1(site_data.encode())
    for f in sorted((REPO / 'assets').glob('*.js')):
        if f.name != 'site-data.js':
            h.update(f.read_bytes())
    return h.hexdigest()[:10]


def stamped_index(version):
    html = INDEX.read_text()
    return re.sub(r'(src="assets/[\w-]+\.js)\?v=[^"]*"', rf'\1?v={version}"', html)


def main():
    data = site_data_text()
    index = stamped_index(asset_version(data))
    if '--check' in sys.argv:
        stale = [p.name for p, text in [(SITE_DATA, data), (INDEX, index)]
                 if not p.exists() or p.read_text() != text]
        if stale:
            sys.exit('Out of date: ' + ', '.join(stale) + '. Run python tools/build.py')
        return
    SITE_DATA.write_text(data)
    INDEX.write_text(index)
    print('wrote', SITE_DATA.relative_to(REPO), 'and stamped index.html')


if __name__ == '__main__':
    main()
