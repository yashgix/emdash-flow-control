"""Summarises one bench result: echo latency percentiles, lost keys, events."""
import json
import sys


def percentile(values, p):
    if not values:
        return None
    ordered = sorted(values)
    k = min(len(ordered) - 1, max(0, round(p / 100 * (len(ordered) - 1))))
    return round(ordered[k], 1)


def server_receipts(keys, echo_log):
    """Aligns the agent's received characters with sent keys: counts per key and duplicates.

    Keys cycle through 62 distinct characters, so a received character matches the first
    unreceived key with that character within one cycle; one that only matches an earlier,
    already received key is a duplicate.
    """
    counts = [0] * len(keys)
    duplicates, pointer = 0, 0
    if not echo_log:
        return counts, duplicates
    for line in open(echo_log):
        _, _, chars = line.rstrip('\n').partition(' ')
        for c in chars:
            forward = next((j for j in range(pointer, min(len(keys), pointer + 62)) if keys[j]['char'] == c), None)
            if forward is not None:
                counts[forward] += 1
                pointer = forward + 1
            else:
                duplicates += 1
    return counts, duplicates


def background_metrics(data):
    """Unique bytes per agent and marker staleness for markers stamped while typing."""
    agents = data.get('background') or []
    typing = data.get('typing')
    if not agents or not typing:
        return {}
    window = [m for a in agents for m in a['markers'] if typing['start'] <= m['stamp'] <= typing['end']]
    expected = len(agents) * (typing['end'] - typing['start']) / 250
    lags = [m['lagMs'] for m in window]
    return {
        'bg_mb_per_agent': round(sum(a['bytes'] for a in agents) / len(agents) / 1e6, 2),
        'bg_skipped_mb_per_agent': round(sum(a.get('skippedBytes', 0) for a in agents) / len(agents) / 1e6, 2),
        'stale_p50': percentile(lags, 50),
        'stale_p95': percentile(lags, 95),
        'markers_missing_pct': round(100 * max(0, expected - len(window)) / expected, 1) if expected else None,
    }


def upstream_legs(keys, echo_log):
    """Matches server receive stamps to sent keys in order (same VM clock)."""
    if not echo_log:
        return []
    stamps = []
    for line in open(echo_log):
        t, _, chars = line.rstrip('\n').partition(' ')
        stamps += [(float(t), c) for c in chars]
    legs, i = [], 0
    for t, c in stamps:
        while i < len(keys) and keys[i]['char'] != c:
            i += 1
        if i == len(keys):
            break
        legs.append(t - keys[i]['sentAt'])
        i += 1
    return legs


def detach_episodes(events, kind):
    """Counts entries into 'recovering' from any other state for one supervisor."""
    episodes, previous = 0, None
    for e in events:
        if e['kind'] != kind:
            continue
        if e['detail'] == 'recovering' and previous != 'recovering':
            episodes += 1
        previous = e['detail']
    return episodes


def summarise(path, echo_log=None):
    data = json.load(open(path))
    if 'aborted' in data:
        return {'file': path, 'aborted': data['aborted']}
    keys = data['keys']
    lat = [k['echoedAt'] - k['sentAt'] for k in keys if 'echoedAt' in k]
    # Bursty typing: the first three keys of each burst follow a pause, when bulk may have filled the link.
    first = [k['echoedAt'] - k['sentAt'] for k in keys if 'echoedAt' in k and k.get('pos', 99) < 3]
    up = upstream_legs(keys, echo_log)
    received, duplicates = server_receipts(keys, echo_log)
    kinds = {}
    for e in data['events']:
        label = e['kind'] if e['kind'] != 'host-state' else f"state:{e['detail']}"
        kinds[label] = kinds.get(label, 0) + 1
    return {
        'file': path,
        'keys': len(keys),
        'echoed': len(lat),
        'lost': len(keys) - len(lat),
        'errors': sum(1 for k in keys if 'error' in k),
        'never_received': sum(1 for n in received if n == 0) if echo_log else None,
        'duplicates': duplicates,
        'false_rejections': sum(1 for k, n in zip(keys, received) if 'error' in k and n > 0),
        **background_metrics(data),
        'p50': percentile(lat, 50),
        'p95': percentile(lat, 95),
        'p99': percentile(lat, 99),
        'max': round(max(lat), 1) if lat else None,
        'first3_p95': percentile(first, 95),
        'first3_max': round(max(first), 1) if first else None,
        'up_p50': percentile(up, 50),
        'up_p95': percentile(up, 95),
        'counters': data.get('counters'),
        'clientLoopDelayMs': data.get('clientLoopDelayMs'),
        'events': kinds,
        'detaches': detach_episodes(data['events'], 'host-state'),
        'lane_detaches': detach_episodes(data['events'], 'lane-state'),
    }


if __name__ == '__main__':
    print(json.dumps(summarise(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None), indent=1))
