// Background output metrics shared by all harnesses: unique bytes delivered per agent, bytes
// skipped by a resync, and staleness of the wall-clock markers "§<ms>§" agents print every 250 ms.
const MARKER = /§(\d{13})§/g;
const CARRY_CHARS = 16;
const encoder = new TextEncoder();
const byteLength = (text) => encoder.encode(text).byteLength;

export function createBackgroundTracker(now) {
  const agents = new Map();
  const agent = (id) => {
    if (!agents.has(id)) {
      agents.set(id, { offset: 0, high: 0, unique: 0, skipped: 0, carry: '', resets: [], seen: new Set(), staleness: [] });
    }
    return agents.get(id);
  };
  // Markers split across chunks are found through the carried tail; the set drops repeats.
  const scan = (state, text, at) => {
    const window = state.carry + text;
    state.carry = window.slice(-CARRY_CHARS);
    for (const [, stamp] of window.matchAll(MARKER)) {
      if (state.seen.has(stamp)) continue;
      state.seen.add(stamp);
      state.staleness.push({ stamp: Number(stamp), lagMs: at - Number(stamp) });
    }
  };
  // Counts only bytes past the highest offset already delivered, so a snapshot that repeats
  // delivered text adds nothing and a snapshot that starts later records the skipped bytes.
  const advance = (state, start, end) => {
    state.skipped += Math.max(0, start - state.high);
    state.unique += Math.max(0, end - Math.max(start, state.high));
    state.high = Math.max(state.high, end);
    state.offset = end;
  };
  return {
    reset(id, data) {
      const state = agent(id);
      state.resets.push(Math.round(now()));
      advance(state, data.baseOffset, data.baseOffset + byteLength(data.text));
      state.carry = '';
      scan(state, data.text, now());
    },
    append(id, chunk) {
      const state = agent(id);
      advance(state, state.offset, state.offset + byteLength(chunk));
      scan(state, chunk, now());
    },
    summary() {
      return [...agents].map(([id, state]) => ({
        id,
        bytes: state.unique,
        skippedBytes: state.skipped,
        resets: state.resets,
        markers: state.staleness,
      }));
    },
  };
}
