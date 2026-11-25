// Drives Emdash's real desktop transport stack (ssh2 streamlocal channel, Wire stream
// transport, HostConnectionSupervisor, ReplicaLog) against a remote workspace server,
// types into one TUI session and records keystroke-to-echo latency.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { Client } from 'ssh2';
import { createScope } from '@emdash/shared/concurrency';
import { ReplicaLog, ReplicaState } from '@emdash/wire/live';
import { SshClientProxy } from '@core/services/ssh/node/lifecycle/ssh-client-proxy';
import { HostConnectionSupervisor } from '@core/services/hosts/node/connection-supervisor';
import { openSshWorkspaceServerTransport } from '@core/services/hosts/node/workspace-server/connect/ssh-streamlocal-transport';
import type { SshWorkspaceServerTarget } from '@core/services/hosts/api/targets';
import { createBackgroundTracker } from './background-metrics.mjs';
import { ALPHABET, createEchoMatcher } from './echo-match.mjs';

const env = (name: string, fallback: number) => Number(process.env[name] ?? fallback);
const config = {
  host: process.env.REMOTE_HOST ?? 'remote',
  backgroundSessions: env('SESSIONS', 8),
  attachBackground: env('ATTACH_BACKGROUND', 1) === 1,
  durationS: env('DURATION_S', 60),
  keyIntervalMs: env('KEY_INTERVAL_MS', 150),
  // TYPE_ON_S and TYPE_OFF_S (both > 0) type in bursts with pauses; the default is continuous typing.
  typeOnS: env('TYPE_ON_S', 0),
  typeOffS: env('TYPE_OFF_S', 0),
  drainS: env('DRAIN_S', 15),
  stallViewers: env('STALL_VIEWERS', 0),
  stallAtS: env('STALL_AT_S', 10),
  stallForS: env('STALL_FOR_S', 15),
  out: process.env.OUT ?? '/results/emdash.json',
  // sshd sets TCP_NODELAY when the first exec/shell session starts on a connection.
  // Production provisioning runs exec probes first; EXEC_FIRST=0 shows the cost of not.
  execFirst: env('EXEC_FIRST', 1) === 1,
  split: env('SPLIT', 0) === 1,
  // LANE=1 turns on the patched HostRuntimeConnection's interactive lane (production default).
  lane: env('LANE', 0) === 1,
  // WINDOW=1 sizes the bulk channel's receive window from lane round trips (phase 2, needs LANE=1).
  adaptiveWindow: env('WINDOW', 0) === 1,
};
const target: SshWorkspaceServerTarget = {
  kind: 'ssh',
  sshConnectionId: 'bench',
  socketPath: '/home/dev/ws.sock',
};
const wallNow = () => performance.timeOrigin + performance.now();
const events: Array<{ t: number; kind: string; detail?: unknown }> = [];
const note = (kind: string, detail?: unknown) => events.push({ t: wallNow(), kind, detail });
const counters = { resyncs: 0, resyncFailed: 0, inputErrors: 0, inputFailures: 0 };
const background = createBackgroundTracker(wallNow);
const byteEncoder = new TextEncoder();
const byteLength = (text: string) => byteEncoder.encode(text).byteLength;

let currentSsh: Client | undefined;

function connectSsh(proxy: SshClientProxy): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = new Client();
    currentSsh = client;
    client.once('ready', () => {
      proxy.update(client);
      note('ssh-ready');
      if (!config.execFirst) return resolve();
      proxy.execScript('true').then(() => resolve(), reject);
    });
    client.once('error', reject);
    client.on('close', () => note('ssh-close'));
    // Records what ssh2 and sshd agreed on, so a COMPRESS run proves compression was negotiated.
    client.on('handshake', (negotiated) => note(`ssh-handshake compress=${negotiated.cs.compress}/${negotiated.sc.compress}`));
    client.connect({
      host: config.host,
      username: 'dev',
      privateKey: readFileSync('/root/.ssh/id_ed25519'),
      keepaliveInterval: 15_000,
      // COMPRESS=1: phase-3 experiment, SSH zlib on the whole connection (terminal output compresses well).
      ...(process.env.COMPRESS === '1' ? { algorithms: { compress: ['zlib@openssh.com', 'zlib'] } } : {}),
    });
    // Same as SshConnectionManager: disable Nagle before handshake traffic.
    client.setNoDelay(true);
  });
}

function createSshPort(proxy: SshClientProxy) {
  let sshClient: Promise<void> | undefined;
  return {
    connected: () => proxy.isConnected,
    establish: async () => {
      sshClient ??= connectSsh(proxy);
      await sshClient;
    },
    reset: () => {
      sshClient = undefined;
      currentSsh?.end();
      note('ssh-reset');
    },
    // Same probe as SshService: a separate exec channel running `true`.
    probe: async (signal: AbortSignal) => {
      const result = await proxy.execScript('true', { signal, timeoutMs: 5_000 });
      if (result.exitCode !== 0) throw new Error('SSH probe failed');
    },
  };
}

function createSupervisor(proxy: SshClientProxy, ssh: ReturnType<typeof createSshPort>, label: string) {
  const scope = createScope({ label });
  const supervisor = new HostConnectionSupervisor({
    scope,
    host: { type: 'ssh', id: 'bench' } as never,
    intent: {
      enabled: () => true,
      runtimeWanted: () => true,
      restore: async () => {},
      maintainRuntime: () => {},
    },
    ssh,
    runtime: {
      prepare: async () => target,
      open: (t, signal) =>
        openSshWorkspaceServerTransport(t as SshWorkspaceServerTarget, {
          ensureProxy: async () => proxy,
        }, { signal }),
      cancel: () => {},
    },
    interactiveLane: config.lane,
    adaptiveBulkWindow: config.adaptiveWindow,
    log: (state) => note(label === 'bench' ? 'host-state' : `${label}-state`, state.kind),
  });
  return { supervisor, scope };
}

type Pending = { char: string; sentAt: number; pos: number; echoedAt?: number; error?: string };

function echoSink(pending: Pending[]) {
  const feed = createEchoMatcher(pending, wallNow);
  return {
    // A reset replays retained text: echoes missed while stale are first seen here.
    reset: (data: { text: string }) => {
      note('s0-reset', { length: data.text.length });
      feed(data.text);
    },
    append: feed,
  };
}

function backgroundSink(index: number) {
  const id = `c${index}`;
  return {
    reset: (data: { baseOffset: number; text: string }) => background.reset(id, data),
    append: (chunk: string) => background.append(id, chunk),
  };
}

type HarnessLogSink = {
  reset(data: { baseOffset: number; text: string }): void;
  append(chunk: string): void;
};

type StallPhase = 'before' | 'during' | 'after';

type HarnessPressureSignal = {
  readonly paused: boolean;
  onChange(cb: (paused: boolean) => void): () => void;
  setPaused(next: boolean): void;
};

function createPressureSignal(): HarnessPressureSignal {
  let paused = false;
  const listeners = new Set<(paused: boolean) => void>();
  return {
    get paused() {
      return paused;
    },
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    setPaused(next: boolean) {
      if (next === paused) return;
      paused = next;
      for (const cb of [...listeners]) cb(paused);
    },
  };
}

function createStallTrackingSink(
  store: HarnessLogSink,
  phase: () => StallPhase,
  onBytes: (phase: StallPhase, bytes: number) => void
): HarnessLogSink {
  return {
    reset(data: { baseOffset: number; text: string }) {
      onBytes(phase(), byteLength(data.text));
      store.reset(data);
    },
    append(chunk: string) {
      onBytes(phase(), byteLength(chunk));
      store.append(chunk);
    },
  };
}

const instrumentation = {
  resync: (event: unknown) => {
    counters.resyncs += 1;
    note('resync', event);
  },
  resyncFailed: () => {
    counters.resyncFailed += 1;
  },
};

type Client = ReturnType<HostConnectionSupervisor['getAttachment']>['client'];

async function startSession(client: Client, index: number) {
  const result = await client.tuiAgents.startSession({
    conversationId: `c${index}`,
    providerId: 'codebuff',
    cwd: `/home/dev/ws/s${index}`,
    sessionId: null,
    model: null,
    cols: 120,
    rows: 40,
  });
  if (!result.success) throw new Error(`start c${index}: ${JSON.stringify(result.error)}`);
}

function attachOutput(client: Client, index: number, store: HarnessLogSink) {
  return new ReplicaLog(client.tuiAgents.output.handle({ conversationId: `c${index}` }), {
    store,
    instrumentation,
  });
}

type StalledViewerMetrics = {
  beforeBytes: number;
  duringBytes: number;
  afterBytes: number;
  resumeAt: number | null;
  resumeToFirstByteMs: number | null;
};

type StalledViewer = {
  id: string;
  pressure: HarnessPressureSignal;
  replica: ReplicaLog;
  metrics: StalledViewerMetrics;
  pause(): void;
  resume(): void;
};

function createStalledViewer(client: Client, index: number, store: HarnessLogSink): StalledViewer {
  const pressure = createPressureSignal();
  const metrics: StalledViewerMetrics = {
    beforeBytes: 0,
    duringBytes: 0,
    afterBytes: 0,
    resumeAt: null,
    resumeToFirstByteMs: null,
  };
  let phase: StallPhase = 'before';
  const trackingSink = createStallTrackingSink(store, () => phase, (currentPhase, bytes) => {
    if (currentPhase === 'before') {
      metrics.beforeBytes += bytes;
    } else if (currentPhase === 'during') {
      metrics.duringBytes += bytes;
    } else {
      metrics.afterBytes += bytes;
      if (metrics.resumeAt !== null && metrics.resumeToFirstByteMs === null) {
        metrics.resumeToFirstByteMs = wallNow() - metrics.resumeAt;
      }
    }
  });
  const handle = client.tuiAgents.output.handle({ conversationId: `c${index}` });
  const replica = new ReplicaLog(
    {
      topic: handle.topic,
      snapshot: (...args: Parameters<typeof handle.snapshot>) => handle.snapshot(...args),
      attach: (cb: Parameters<typeof handle.attach>[0], options: Parameters<typeof handle.attach>[1]) =>
        handle.attach(cb, { ...(options ?? {}), pressure }),
    },
    { store: trackingSink, instrumentation }
  );
  return {
    id: `c${index}`,
    pressure,
    replica,
    metrics,
    pause() {
      phase = 'during';
      pressure.setPaused(true);
    },
    resume() {
      phase = 'after';
      pressure.setPaused(false);
      metrics.resumeAt = wallNow();
    },
  };
}

// Mirrors the renderer: each keystroke is its own fire-and-forget sendInput call.
function sendKey(client: Client, entry: Pending) {
  client.tuiAgents
    .sendInput({ conversationId: 'c0', data: entry.char })
    .then((result) => {
      if (!result.success) {
        counters.inputFailures += 1;
        entry.error = JSON.stringify(result.error);
      }
    })
    .catch((error: Error) => {
      counters.inputErrors += 1;
      entry.error = error.message;
    });
}

function echoLatencySummary(entries: Pending[], start: number, end: number) {
  const sorted = entries
    .filter((entry) => entry.echoedAt !== undefined && entry.sentAt >= start && entry.sentAt < end)
    .map((entry) => entry.echoedAt! - entry.sentAt)
    .sort((a, b) => a - b);
  if (sorted.length === 0) return { p50: null, p95: null, max: null };
  const quantile = (q: number) => {
    const position = (sorted.length - 1) * q;
    const base = Math.floor(position);
    const rest = position - base;
    const value = sorted[base]!;
    return base + 1 < sorted.length ? value + (sorted[base + 1]! - value) * rest : value;
  };
  return { p50: quantile(0.5), p95: quantile(0.95), max: sorted[sorted.length - 1]! };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Plan p29: typing lasts until every background command has exited (DURATION_S is the cap).
function jobsFinished(): boolean {
  const dir = process.env.JOBS_DIR;
  if (!dir) return false;
  return readdirSync(dir).filter((file) => file.endsWith('.json')).length >= config.backgroundSessions;
}

async function typeKeys(client: Client, pending: Pending[]) {
  const end = wallNow() + config.durationS * 1000;
  const bursty = config.typeOnS > 0 && config.typeOffS > 0;
  let burstStart = wallNow();
  for (let n = 0, pos = 0; wallNow() < end && !jobsFinished(); n++, pos++) {
    if (bursty && wallNow() - burstStart >= config.typeOnS * 1000) {
      await sleep(config.typeOffS * 1000);
      if (wallNow() >= end) break;
      burstStart = wallNow();
      pos = 0;
    }
    // pos is the key's place in its burst, so first keys after a pause can be measured apart.
    const entry = { char: ALPHABET[n % ALPHABET.length]!, sentAt: wallNow(), pos };
    pending.push(entry);
    sendKey(client, entry);
    await sleep(config.keyIntervalMs);
  }
}

async function main() {
  const loopDelay = monitorEventLoopDelay({ resolution: 10 });
  loopDelay.enable();
  const proxy = new SshClientProxy('bench');
  const ssh = createSshPort(proxy);
  const { supervisor, scope } = createSupervisor(proxy, ssh, 'bench');
  supervisor.activate(true);
  await supervisor.awaitUsable();
  note('runtime-ready');
  const { client } = supervisor.getAttachment();
  // SPLIT=1 prototypes a dedicated interactive lane: a second Wire channel on the same
  // SSH connection carries only the typed session's input and output.
  const lane = config.split ? createSupervisor(proxy, ssh, 'lane') : undefined;
  if (lane) {
    lane.supervisor.activate(true);
    await lane.supervisor.awaitUsable();
  }
  const interactive = lane ? lane.supervisor.getAttachment().client : client;

  const pending: Pending[] = [];
  await startSession(interactive, 0);
  const replicas = [attachOutput(interactive, 0, echoSink(pending))];
  const stalledViewers: StalledViewer[] = [];
  for (let i = 1; i <= config.backgroundSessions; i++) {
    await startSession(client, i);
    if (!config.attachBackground) continue;
    const store = backgroundSink(i);
    if (i <= config.stallViewers) {
      const viewer = createStalledViewer(client, i, store);
      stalledViewers.push(viewer);
      replicas.push(viewer.replica);
    } else {
      replicas.push(attachOutput(client, i, store));
    }
  }
  // The desktop main process keeps these two models live for every remote project.
  const models = [
    new ReplicaState(client.tuiAgents.sessions.state(undefined, 'list'), { instrumentation }),
    new ReplicaState(client.tuiAgents.agentStates.state(undefined, 'list'), { instrumentation }),
  ];
  await Promise.all([...replicas, ...models].map((replica) => replica.ready));
  note('sessions-ready');
  await sleep(5_000);

  const typingStart = wallNow();
  writeFileSync(`${config.out}.typing`, String(typingStart));
  if (process.env.JOBS_DIR) writeFileSync(`${process.env.JOBS_DIR}/start`, String(typingStart));
  const stallStart = typingStart + config.stallAtS * 1000;
  const stallEnd = stallStart + config.stallForS * 1000;
  if (stalledViewers.length > 0) {
    setTimeout(() => {
      for (const viewer of stalledViewers) viewer.pause();
      note('stall-pause');
    }, Math.max(0, stallStart - wallNow()));
    setTimeout(() => {
      for (const viewer of stalledViewers) viewer.resume();
      note('stall-resume');
    }, Math.max(0, stallEnd - wallNow()));
  }
  await typeKeys(interactive, pending);
  const typingEnd = wallNow();
  await sleep(config.drainS * 1000);
  loopDelay.disable();

  const result = {
    config,
    counters,
    clientLoopDelayMs: {
      p50: loopDelay.percentile(50) / 1e6,
      p99: loopDelay.percentile(99) / 1e6,
      max: loopDelay.max / 1e6,
    },
    keys: pending,
    typing: { start: typingStart, end: typingEnd },
    background: background.summary(),
    stall: {
      settings: {
        viewers: config.stallViewers,
        atS: config.stallAtS,
        forS: config.stallForS,
      },
      start: stallStart,
      end: stallEnd,
      echo: {
        before: echoLatencySummary(pending, 0, stallStart),
        during: echoLatencySummary(pending, stallStart, stallEnd),
        after: echoLatencySummary(pending, stallEnd, Number.POSITIVE_INFINITY),
      },
      viewers: stalledViewers.map((viewer) => ({
        id: viewer.id,
        bytesBefore: viewer.metrics.beforeBytes,
        bytesDuring: viewer.metrics.duringBytes,
        bytesAfter: viewer.metrics.afterBytes,
        resumeToFirstByteMs: viewer.metrics.resumeToFirstByteMs,
      })),
    },
    events,
  };
  writeFileSync(config.out, JSON.stringify(result));
  console.log(JSON.stringify({ out: config.out, counters, keys: pending.length }));
  await lane?.scope.dispose();
  await scope.dispose();
  process.exit(0);
}

// A run that dies (for example the pin's unhandled WireError: DISCONNECTED) is recorded as failed, not lost.
function abort(error: unknown): never {
  console.error(error);
  if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify({ aborted: String(error), at: wallNow() }));
  process.exit(1);
}

process.on('unhandledRejection', abort);
main().catch(abort);
