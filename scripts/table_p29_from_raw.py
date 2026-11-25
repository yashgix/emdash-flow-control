"""Real-workload table: batch completion, typing, output and recovery per workload, link and arm."""
import glob
import json
import os
import statistics
import sys

RESULTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'results')
ARMS = {'heavy': ['pin', 'pinz', 'final'], 'light': ['pin', 'final']}
LINKS = ['fast', 'slow', 'cut']
EXPECTED_JOBS = 8


def read_jobs(name):
    return [json.load(open(p)) for p in glob.glob(f'{RESULTS}/jobs/{name}/s*.json')]


def recovery_s(name):
    drop = f'{RESULTS}/raw/{name}.json.typing.drop'
    if not os.path.exists(drop):
        return None
    restored = float(open(drop).read().split()[1]) * 1000
    keys = json.load(open(f'{RESULTS}/raw/{name}.json'))['keys']
    echoes = [k['echoedAt'] for k in keys
              if k['sentAt'] >= restored and k.get('echoedAt') and k['echoedAt'] - k['sentAt'] < 1000]
    return round((min(echoes) - restored) / 1000, 2) if echoes else None


def load_run(name):
    jobs = read_jobs(name)
    summary_path = f'{RESULTS}/raw/{name}.summary.json'
    summary = json.load(open(summary_path)) if os.path.exists(summary_path) else None
    run = {'name': name, 'finished': len(jobs), 'bad_exit': sum(j['code'] != 0 for j in jobs), 'summary': summary}
    run['status'] = ('no-result' if summary is None else 'censored' if len(jobs) < EXPECTED_JOBS
                     else 'failed' if run['bad_exit'] else 'ok')
    if jobs:
        run['batch_s'] = (max(j['endedAt'] for j in jobs) - min(j['startedAt'] for j in jobs)) / 1000
        run['cmd_s'] = statistics.median((j['endedAt'] - j['startedAt']) / 1000 for j in jobs)
        run['output_mb'] = statistics.median(j['bytes'] / 1e6 for j in jobs)
    run['recovery_s'] = recovery_s(name) if summary else None
    return run


def spread(values, digits=1):
    values = [v for v in values if v is not None]
    if not values:
        return '-'
    mid = round(statistics.median(values), digits)
    return f'{mid:g} ({round(min(values), digits):g}-{round(max(values), digits):g})' if len(values) > 1 else f'{mid:g}'


def row(workload, link, arm, runs):
    ok = [r for r in runs if r['status'] == 'ok']
    typed = [r['summary'] for r in runs if r['summary']]
    states = {s: sum(r['status'] == s for r in runs) for s in ('censored', 'failed', 'no-result')}
    other = ', '.join(f'{n} {s}' for s, n in states.items() if n) or '-'
    cols = [workload, link, arm, f'{len(ok)}/{len(runs)}', other,
            spread([r['batch_s'] for r in ok]), spread([r['cmd_s'] for r in ok]),
            spread([r.get('output_mb') for r in ok], 2),
            spread([s['p50'] for s in typed], 0), spread([s['p95'] for s in typed], 0),
            str(sum(s['lost'] + s['never_received'] for s in typed)),
            spread([s['bg_mb_per_agent'] for s in typed], 2), spread([s['bg_skipped_mb_per_agent'] for s in typed], 2),
            spread([r['recovery_s'] for r in runs], 2) if link == 'cut' else '-']
    return '| ' + ' | '.join(cols) + ' |'


def main(prefix, repeats):
    head = ['workload', 'link', 'arm', 'valid runs', 'other', 'batch s', 'median command s', 'command output MB',
            'echo p50 ms', 'echo p95 ms', 'keys lost', 'delivered MB/session', 'skipped MB/session', 'recovery s']
    print('| ' + ' | '.join(head) + ' |')
    print('|' + '---|' * len(head))
    for workload, arms in ARMS.items():
        for link in LINKS:
            for arm in arms:
                names = [f'{prefix}-{workload}-{link}-{arm}-r{n}' for n in repeats]
                runs = [load_run(n) for n in names if os.path.exists(f'{RESULTS}/raw/{n}.meta.json')]
                if runs:
                    print(row(workload, link, arm, runs))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'p29', sys.argv[2].split(',') if len(sys.argv) > 2 else ['1', '2', '3'])
