#!/usr/bin/env node
// Stand-in for an agent CLI inside a PTY: echoes keystrokes at once and, when the
// working directory holds .replay.json, replays a recorded output trace in a loop.
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const configPath = join(process.cwd(), '.replay.json');
const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : null;

const wallNow = () => performance.timeOrigin + performance.now();

function startEcho(echoLog) {
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  let counter = 0;
  process.stdin.on('data', (data) => {
    if (data.includes(0x03)) process.exit(0);
    // Numbered tokens let the client tell a fresh echo from a repainted one.
    const tokens = [...data.toString('latin1')].map((char) => `\u00a4${counter++}:${char}\u00a4\r\n`);
    process.stdout.write(tokens.join(''));
    if (echoLog) appendFileSync(echoLog, `${wallNow().toFixed(2)} ${data.toString('latin1')}\n`);
  });
}

function loadTrace(path) {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let replayedBytes = 0;

// Synthetic status-line redraw, the kind agent TUIs repaint while working.
function startSpinner(hz) {
  const frames = '|/-\\';
  let n = 0;
  setInterval(() => {
    const status = `\x1b[s\x1b[40;1H\x1b[2K\x1b[36m${frames[n++ % 4]} Working (${n} ticks) \x1b[0m\x1b[u`;
    process.stdout.write(status);
  }, 1000 / hz);
}

// Chunks are scheduled against cumulative deadlines, so sub-millisecond gaps keep their place
// and long replays do not drift.
async function replay({ trace, speed = 1, offsetMs = 0, pauseMs = 0 }) {
  const chunks = loadTrace(trace);
  await sleep(offsetMs);
  for (;;) {
    const start = performance.now();
    for (const { t, d } of chunks) {
      const wait = start + t / speed - performance.now();
      if (wait > 0) await sleep(wait);
      const chunk = Buffer.from(d, 'base64');
      process.stdout.write(chunk);
      replayedBytes += chunk.length;
    }
    await sleep(pauseMs / speed);
  }
}

// Wall-clock markers in the output let the client measure how stale background output is.
function startMarkers(everyMs) {
  setInterval(() => process.stdout.write(`\u00a7${Math.round(wallNow())}\u00a7\r\n`), everyMs);
}

// Plan p28: records how much of the trace this agent actually wrote, so back-pressure on the agent is visible.
if (existsSync('/tmp/agent-bytes')) {
  const path = `/tmp/agent-bytes/${process.pid}.log`;
  setInterval(() => writeFileSync(path, `${Math.round(wallNow())} ${replayedBytes}\n`), 500);
}

// Plan p29: runs one real command when the start file appears. Its output goes through this terminal, so a blocked
// terminal blocks the command.
function runJobOnStart({ command, cwd, log, startFile }) {
  const poll = setInterval(() => {
    if (!existsSync(startFile)) return;
    clearInterval(poll);
    const startedAt = wallNow();
    let bytes = 0;
    let tail = '';
    const child = spawn('bash', ['-c', command], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    const forward = (chunk) => {
      bytes += chunk.length;
      tail = (tail + chunk.toString()).slice(-2000);
      process.stdout.write(chunk);
    };
    child.stdout.on('data', forward);
    child.stderr.on('data', forward);
    child.on('close', (code) => {
      writeFileSync(log.replace(/\.json$/, '.tail'), tail);
      writeFileSync(log, JSON.stringify({ startedAt, endedAt: wallNow(), code, bytes }));
    });
  }, 50);
}

startEcho(config?.echoLog);
if (config?.spinnerHz) startSpinner(config.spinnerHz);
if (config?.trace) void replay(config);
if (config?.markEveryMs) startMarkers(config.markEveryMs);
if (config?.job) runJobOnStart(config.job);
