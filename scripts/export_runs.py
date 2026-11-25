"""Export one row per counted p29 run from the raw results folder (needs the private raw data)."""
import csv
import glob
import json
import os
import statistics
import sys

RESULTS = sys.argv[1]
OUT = sys.argv[2]
ARM = {'pin': 'upstream', 'pinz': 'upstream+zlib', 'final': 'modified'}
FIELDS = ['run', 'repeat', 'workload', 'link', 'arm', 'commands', 'exit_codes', 'batch_s', 'median_command_s', 'output_mb_per_command',
          'echo_p50_ms', 'echo_p95_ms', 'echo_p99_ms', 'keys_sent', 'keys_lost', 'keys_never_received', 'keys_duplicated',
          'delivered_mb_per_session', 'skipped_mb_per_session', 'staleness_p95_ms', 'detaches', 'tree_commit', 'build_sha']


def run_row(path):
    name = os.path.basename(path)[:-len('.summary.json')]
    _, workload, link, arm, repeat = name.split('-')
    summary = json.load(open(path))
    meta = json.load(open(path.replace('.summary.json', '.meta.json')))
    jobs = [json.load(open(p)) for p in glob.glob(f'{RESULTS}/jobs/{name}/s*.json')]
    return {
        'run': name, 'repeat': repeat[1:], 'workload': workload, 'link': link, 'arm': ARM[arm], 'commands': len(jobs),
        'exit_codes': ' '.join(str(c) for c in sorted({j['code'] for j in jobs})),
        'batch_s': round((max(j['endedAt'] for j in jobs) - min(j['startedAt'] for j in jobs)) / 1000, 2),
        'median_command_s': round(statistics.median((j['endedAt'] - j['startedAt']) / 1000 for j in jobs), 2),
        'output_mb_per_command': round(statistics.median(j['bytes'] for j in jobs) / 1e6, 3),
        'echo_p50_ms': summary['p50'], 'echo_p95_ms': summary['p95'], 'echo_p99_ms': summary['p99'], 'keys_sent': summary['keys'],
        'keys_lost': summary['lost'], 'keys_never_received': summary['never_received'], 'keys_duplicated': summary['duplicates'],
        'delivered_mb_per_session': summary['bg_mb_per_agent'], 'skipped_mb_per_session': summary['bg_skipped_mb_per_agent'],
        'staleness_p95_ms': summary['stale_p95'], 'detaches': summary['detaches'],
        'tree_commit': meta['commit'][:9], 'build_sha': meta['buildSha'],
    }


rows = sorted((run_row(p) for p in glob.glob(f'{RESULTS}/raw/p29-*.summary.json')), key=lambda r: (r['workload'], r['link'], r['arm'], r['repeat']))
with open(OUT, 'w', newline='') as f:
    writer = csv.DictWriter(f, FIELDS)
    writer.writeheader()
    writer.writerows(rows)
print(len(rows), 'runs written')
