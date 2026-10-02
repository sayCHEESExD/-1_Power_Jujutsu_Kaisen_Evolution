/**
 * MULTIPLAYER AND THE PVP ARENA against a real server (its own, port 2792,
 * over a seeded store).
 *
 *   - two players see each other: movement, every punch, the sorcerer held;
 *   - the arena: a Rebirth 0 player is stopped at the gate; Rebirth 3
 *     fighters walk in; a blow deals 350% Cursed Energy x 10% and knocks the
 *     victim back; nobody outside the arena can hit or be hit; forged,
 *     far-off and self-aimed blows do nothing; blows are rate limited;
 *   - a knockout: the loser lies still (no moving, no training), then goes
 *     home at full health; the winner's KO is counted;
 *   - the boards rank the seeded players; leaving and rejoining keeps progress.
 *
 * Run: npm run build:server && node scripts/verify-multiplayer.mjs
 */
import { Player, S, check, failureCount, profile, section, sleep, startServer, waitFor } from './lib/harness.mjs';

const PORT = 2792;
const stamp = Date.now().toString(36);
const ids = { a: `fa_${stamp}`, b: `fb_${stamp}`, big: `big_${stamp}`, novice: `nov_${stamp}` };
const server = await startServer({
  port: PORT,
  profiles: {
    [ids.a]: profile({ rebirths: 3, energy: 1000, bestEnergy: 1000, xp: 1000, wins: 30, lifetimeWins: 30, character: 4, displayName: 'Fighter A' }),
    [ids.b]: profile({ rebirths: 3, energy: 1000, bestEnergy: 1000, xp: 1000, wins: 5, lifetimeWins: 5, character: 3, displayName: 'Fighter B' }),
    [ids.big]: profile({ rebirths: 5, energy: 100_000, bestEnergy: 100_000, xp: 100_000, wins: 800, lifetimeWins: 800, character: 6, displayName: 'Big One' }),
  },
});

try {
  section('Two players see each other');
  const p1 = await Player.join(server.endpoint, `see1_${stamp}`, 'Watcher');
  const p2 = await Player.join(server.endpoint, `see2_${stamp}`, 'Walker');
  check(p1.room.roomId === p2.room.roomId, 'both land in the same room');
  await p2.walkTo(-10, 12, { maxSeconds: 4 });
  await p1.idle(300);
  const seen = p1.see(p2.id);
  check(seen && Math.hypot(seen.x - p2.me.x, seen.z - p2.me.z) < 0.5, `the watcher sees the walker where the server has them (${seen?.x.toFixed(1)}, ${seen?.z.toFixed(1)})`);
  await p2.train(3);
  await p1.idle(300);
  const paid = p2.messages[S.MessageType.Trained].reduce((total, m) => total + m.gain, 0);
  check(p1.see(p2.id)?.punchCount === 3 && p1.see(p2.id)?.energy === paid, 'and every punch, and the Cursed Energy it paid');
  check(p1.see(p2.id)?.character === 1 && p1.see(p2.id)?.displayName === 'Walker', 'and the sorcerer held and the name');

  section('The arena gate');
  const a = await Player.join(server.endpoint, ids.a, 'Fighter A');
  const b = await Player.join(server.endpoint, ids.b, 'Fighter B');
  const novice = await Player.join(server.endpoint, ids.novice, 'Novice');
  await novice.walkTo(0, -60, { maxSeconds: 4 });
  check(!novice.me.inPvp && novice.me.z > S.HUB.minZ - 3, `a Rebirth 0 player is stopped at the gate (z ${novice.me.z.toFixed(2)})`);
  await Promise.all([a.walkTo(0, -60, { maxSeconds: 5 }), b.walkTo(0, -63, { maxSeconds: 5 })]);
  check(a.me.inPvp && b.me.inPvp, 'two Rebirth 3 fighters walk in, and the server marks them in the arena');
  check(a.me.maxHealth === 1100 && b.me.health === 1100, 'each has 100 + Cursed Energy health (1,100)');

  section('A blow');
  const before = { x: b.me.x, z: b.me.z, hurt: b.me.hurtCount };
  a.send(S.MessageType.Punch, { target: b.id });
  // A real client sends input every frame, idle or not: the victim's flight is simulated on those frames.
  await Promise.all([a.idle(450), b.idle(450)]);
  check(b.me.health === 750, `350% of 1K Cursed Energy, 10% a blow: 350 damage (health ${b.me.health})`);
  check(b.me.hurtCount === before.hurt + 1, 'the victim\'s flinch is counted');
  check(a.last(S.MessageType.Punched)?.damage === 350 && a.me.attackKind === 2, 'the attacker is told, and the blow is replicated as a blow at a player');
  const pushed = (b.me.z - before.z) * Math.sign(b.me.z - a.me.z || -1);
  check(Math.hypot(b.me.x - before.x, b.me.z - before.z) > 0.8 && pushed > 0, `the victim is knocked back, away from the attacker (moved ${Math.hypot(b.me.x - before.x, b.me.z - before.z).toFixed(2)})`);
  await novice.idle(100);
  check(novice.see(a.id)?.attackCount === a.me.attackCount && novice.see(b.id)?.health === 750, 'a bystander sees the blow and the health it took');

  section('Refused blows');
  const h0 = b.me.health;
  a.send(S.MessageType.Punch, { target: novice.id });
  await a.idle(350);
  check(novice.me.health === novice.me.maxHealth, 'nobody outside the arena can be hit');
  novice.send(S.MessageType.Punch, { target: a.id });
  await novice.idle(350);
  check(a.me.health === a.me.maxHealth, 'nobody outside the arena can hit');
  a.send(S.MessageType.Punch, { target: a.id });
  a.send(S.MessageType.Punch, { target: 'not-a-player' });
  await a.idle(350);
  check(a.me.health === a.me.maxHealth && b.me.health === h0, 'self-aimed and made-up targets do nothing');
  await b.walkTo(0, -95, { maxSeconds: 4 });
  a.send(S.MessageType.Punch, { target: b.id });
  await a.idle(350);
  check(b.me.health >= h0, `a blow from across the arena does nothing (${Math.abs(b.me.z - a.me.z).toFixed(1)} apart)`);

  section('Rate limit');
  await b.walkTo(0, -62.5, { maxSeconds: 4 });
  await a.idle(1200);
  const h1 = b.me.health;
  for (let i = 0; i < 20; i += 1) a.send(S.MessageType.Punch, { target: b.id });
  await a.idle(150);
  const landed = Math.round((h1 - b.me.health) / 350);
  check(landed >= 1 && landed <= 3, `20 blows at once land at most the burst (${landed})`);

  section('A knockout');
  const big = await Player.join(server.endpoint, ids.big, 'Big One');
  check(big.me.energy === 100_000 && big.me.rebirths === 5, 'a seeded heavy hitter joins (100K Cursed Energy)');
  await big.walkTo(0, -60, { maxSeconds: 5 });
  await b.walkTo(big.me.x, big.me.z - 2.5, { stopAt: 0.5, maxSeconds: 3 });
  big.send(S.MessageType.Punch, { target: b.id });
  await waitFor(() => b.me.health === 0, 'the knockout', 2000).catch(() => null);
  check(b.me.health === 0, 'one blow of 35K knocks a 1K player out');
  check(big.me.pvpKos === 1 && big.last(S.MessageType.Punched)?.knockedOut === true, 'the KO is counted and reported');
  const lyingAt = { x: b.me.x, z: b.me.z, s: b.me.energy };
  await b.train(2);
  for (let i = 0; i < 30; i += 1) {
    b.step(0, -1);
    await sleep(1000 / 60);
  }
  check(b.me.energy === lyingAt.s && Math.hypot(b.me.x - lyingAt.x, b.me.z - lyingAt.z) < 0.3, 'knocked out, the player can neither train nor move');
  await waitFor(() => b.me.health > 0, 'the respawn', 4000).catch(() => null);
  check(b.me.health === b.me.maxHealth && Math.hypot(b.me.x, b.me.z) < 1 && !b.me.inPvp, 'then goes home at full health, out of the arena');

  section('Boards and rejoining');
  await waitFor(() => p1.room.state.leaderboard.energy[0]?.value === 100_000, 'the board', 4000).catch(() => null);
  check(p1.room.state.leaderboard.energy[0]?.name === 'Big One', 'Top Cursed Energy ranks the heavy hitter first');
  check(p1.room.state.leaderboard.wins[0]?.value === 800 && p1.room.state.leaderboard.rebirths[0]?.value === 5, 'Top Wins and Top Rebirths too');
  const winsA = a.me.wins;
  await a.leave();
  await sleep(500);
  const back = await Player.join(server.endpoint, ids.a, 'Fighter A');
  check(back.me.wins === winsA && back.me.rebirths === 3 && back.me.energy === 1000 && back.me.character === 4, 'leaving and rejoining keeps every figure');
  check(back.me.wallsBroken === 0 && back.me.health === back.me.maxHealth, 'and starts a fresh run at full health');

  for (const p of [p1, p2, b, novice, big, back]) await p.leave();
  await sleep(300);
} catch (error) {
  console.error(error);
  check(false, `the suite threw: ${error?.message ?? error}`);
} finally {
  await server.stop();
}

const failures = failureCount();
console.log(failures === 0 ? '\nverify:multiplayer passed' : `\nverify:multiplayer: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
