/**
 * A test harness for the live-server suites: spawn a REAL server (the built
 * `server/dist`) on its own port with a seeded JSON store, join it as browsers
 * do, and drive players with real-time input - the server simulates every
 * step, exactly as for a player.
 *
 * Seeding is how a suite gets a Rebirth 10 player without training for an hour:
 * the profile is written to the store before the server opens it, which is
 * exactly what a returning player's save is.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'colyseus.js';
import * as S from '../../shared/dist/index.js';

export { S };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SERVER_ENTRY = path.join(ROOT, 'server', 'dist', 'index.js');

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let failures = 0;
export const check = (condition, message) => {
  if (condition) console.log(`  ok    ${message}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${message}`);
  }
  return condition;
};
export const failureCount = () => failures;
export const section = (title) => console.log(`\n${title}`);

export const waitFor = async (probe, label, timeoutMs = 5000, everyMs = 40) => {
  const start = Date.now();
  for (;;) {
    let value = null;
    try {
      value = await probe();
    } catch {
      value = null;
    }
    if (value) return value;
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${label}`);
    await sleep(everyMs);
  }
};

/** A full profile as the store holds it, from a few overrides. */
export const profile = (overrides = {}) => ({
  xp: 0,
  energy: 0,
  bestEnergy: 0,
  wins: 0,
  lifetimeWins: 0,
  rebirths: 0,
  character: 1,
  morph: 0,
  aura: 0,
  auraMask: 0,
  upSpeed: 0,
  upTraining: 0,
  upLuck: 0,
  upBoss: 0,
  upPunch: 0,
  bestStage: 0,
  totalWalls: 0,
  pvpKos: 0,
  playSeconds: 0,
  displayName: '',
  avatarUrl: '',
  updatedAt: Date.now(),
  ...overrides,
});

/**
 * Start a server on `port` over a fresh data directory seeded with
 * `profiles` ({ guestKey: profile }). Returns { port, endpoint, log, stop }.
 */
export const startServer = async ({ port, profiles = {} } = {}) => {
  if (!existsSync(SERVER_ENTRY)) throw new Error(`server/dist is missing - run "npm run build:server" first`);
  const dataDir = mkdtempSync(path.join(tmpdir(), 'jjkevolution-test-'));
  writeFileSync(path.join(dataDir, 'profiles.json'), JSON.stringify(profiles, null, 2));
  const proc = spawn(process.execPath, [SERVER_ENTRY, '--port', String(port)], {
    cwd: ROOT,
    env: { ...process.env, JJK_DATA_DIR: dataDir, MONGODB_URI: '', HOST: '127.0.0.1', PORT: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  proc.stdout.on('data', (chunk) => (log += chunk));
  proc.stderr.on('data', (chunk) => (log += chunk));
  const exited = new Promise((resolve) => proc.on('exit', resolve));
  const healthy = async () => {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    return response.ok;
  };
  try {
    await waitFor(healthy, `server on ${port}`, 30_000, 100);
  } catch (error) {
    console.error(log);
    proc.kill('SIGKILL');
    throw error;
  }
  return {
    port,
    endpoint: `ws://127.0.0.1:${port}`,
    get log() {
      return log;
    },
    async stop() {
      if (proc.exitCode === null) {
        proc.kill('SIGKILL');
        await exited;
      }
      try {
        rmSync(dataDir, { recursive: true, force: true });
      } catch {
        /* a locked temp file on Windows: harmless */
      }
    },
  };
};

/**
 * A test player: a joined room plus helpers that act the way the client
 * does - input frames at 60 Hz, actions at the client's own interval.
 */
export class Player {
  static async join(endpoint, playerId, name = '') {
    const client = new Client(endpoint);
    const options = { playerId };
    if (name) options.identity = { displayName: name, avatarUrl: '' };
    const room = await client.joinOrCreate(S.ROOM_NAME, options);
    const player = new Player(room);
    await waitFor(() => room.state?.players?.get(room.sessionId)?.ready || room.state?.players?.get(room.sessionId), 'own state');
    return player;
  }

  constructor(room) {
    this.room = room;
    this.seq = 0;
    this.messages = {};
    for (const type of Object.values(S.MessageType)) {
      this.messages[type] = [];
      room.onMessage(type, (message) => this.messages[type].push(message));
    }
  }

  get id() {
    return this.room.sessionId;
  }

  get me() {
    return this.room.state.players.get(this.room.sessionId);
  }

  /** Another player as THIS client sees them. */
  see(sessionId) {
    return this.room.state.players.get(sessionId);
  }

  last(type) {
    const list = this.messages[type];
    return list[list.length - 1];
  }

  clear(type) {
    this.messages[type].length = 0;
  }

  /** One input frame toward (moveX, moveZ) in camera space at yaw 0: +moveZ is world +Z, +moveX is world -X. */
  step(moveX, moveZ, jump = false) {
    this.seq += 1;
    this.room.send(S.MessageType.Move, { seq: this.seq, dt: 1 / 60, moveX, moveZ, jump, cameraYaw: 0 });
  }

  /** Walk (real time) until within `stopAt` of (x, z), or until `maxSeconds`. Returns the final distance. */
  async walkTo(x, z, { stopAt = 0.8, maxSeconds = 20 } = {}) {
    const start = Date.now();
    while (Date.now() - start < maxSeconds * 1000) {
      const p = this.me;
      const dx = x - p.x;
      const dz = z - p.z;
      const d = Math.hypot(dx, dz);
      if (d <= stopAt) break;
      // Camera yaw 0: world +X is the stick's LEFT.
      const scale = d > 2 ? 1 : 0.5;
      this.step((-dx / d) * scale, (dz / d) * scale);
      await sleep(1000 / 60);
    }
    // Come to rest.
    for (let i = 0; i < 12; i += 1) {
      this.step(0, 0);
      await sleep(1000 / 60);
    }
    await sleep(150);
    return Math.hypot(x - this.me.x, z - this.me.z);
  }

  /** Stand still for a while, still sending input (a real client always does). */
  async idle(ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      this.step(0, 0);
      await sleep(1000 / 60);
    }
  }

  async train(times, gapMs = 360) {
    for (let i = 0; i < times; i += 1) {
      this.room.send(S.MessageType.Train, {});
      await this.idle(gapMs);
    }
  }

  async smash(times, wall, gapMs = 360) {
    for (let i = 0; i < times; i += 1) {
      this.room.send(S.MessageType.Smash, { wall: wall ?? this.me.wallsBroken });
      await this.idle(gapMs);
    }
  }

  send(type, message = {}) {
    this.room.send(type, message);
  }

  async leave() {
    try {
      await this.room.leave();
    } catch {
      /* already gone */
    }
  }
}
