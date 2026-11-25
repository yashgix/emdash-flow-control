// Matches echo tokens "¤<counter>:<char>¤" from the interactive agent to sent keys.
// The agent's counter only grows, so tokens repainted by a redraw are ignored, and
// matching by character (62 distinct keys in a cycle) skips keys the server never received.
const TOKEN = /¤(\d+):(.)¤/gs;
export const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function createEchoMatcher(keys, now) {
  let buffer = '';
  let lastCounter = -1;
  let next = 0;
  const match = (char, at) => {
    const limit = Math.min(keys.length, next + ALPHABET.length);
    for (let j = next; j < limit; j++) {
      if (keys[j].char !== char) continue;
      keys[j].echoedAt = at;
      next = j + 1;
      return;
    }
  };
  return (chunk) => {
    const at = now();
    buffer += chunk;
    let consumed = 0;
    for (const token of buffer.matchAll(TOKEN)) {
      consumed = token.index + token[0].length;
      const counter = Number(token[1]);
      if (counter <= lastCounter) continue;
      lastCounter = counter;
      match(token[2], at);
    }
    buffer = buffer.slice(Math.max(consumed, buffer.length - 64));
  };
}
