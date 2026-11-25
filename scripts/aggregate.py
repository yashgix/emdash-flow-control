"""Median (and range) per workload, link and version from data/p29-runs.csv."""
import csv
import statistics
import sys
from collections import defaultdict

COLUMNS = [('batch_s', 'batch s', 1), ('median_command_s', 'median command s', 1), ('echo_p50_ms', 'echo p50 ms', 0), ('echo_p95_ms', 'echo p95 ms', 0),
           ('keys_unechoed', 'keys without an echo (sum of 3)', 0), ('delivered_mb_per_session', 'delivered MB/session', 2), ('skipped_mb_per_session', 'skipped MB/session', 2)]


def fmt(values, digits):
    mid = round(statistics.median(values), digits)
    return f'{mid:g} ({round(min(values), digits):g}-{round(max(values), digits):g})'


groups = defaultdict(list)
for row in csv.DictReader(open(sys.argv[1])):
    groups[(row['workload'], row['link'], row['arm'])].append(row)
print('| workload | link | version | runs | ' + ' | '.join(c[1] for c in COLUMNS) + ' |')
print('|' + '---|' * (len(COLUMNS) + 4))
for (workload, link, arm), rows in sorted(groups.items(), key=lambda kv: (kv[0][0] != 'heavy', ['fast', 'slow', 'cut'].index(kv[0][1]), ['upstream', 'upstream+zlib', 'modified'].index(kv[0][2]))):
    cells = []
    for key, _, digits in COLUMNS:
        values = [float(r['keys_lost']) + float(r['keys_never_received']) if key == 'keys_unechoed' else float(r[key]) for r in rows]
        cells.append(f'{sum(values):g}' if key == 'keys_unechoed' else fmt(values, digits))
    print(f'| {workload} | {link} | {arm} | {len(rows)} | ' + ' | '.join(cells) + ' |')
