/**
 * THE GAMEPLAY LOOP against a real server, played as a client plays it.
 *
 * Spawns its own server (port 2791) over a seeded store, then:
 *
 *   - a FRESH player punches for Cursed Energy (and gains nothing standing
 *     still), walks into the corridor, is stopped by the first wall, breaks
 *     it, and is refused everything it has not earned: forged walls, claims
 *     before the boss falls, locked sorcerers, upgrades, the PvP gate, a
 *     rebirth;
 *   - a SEEDED rookie (energy, no Wins) breaks all ten walls of Stage 1 and
 *     its boss, claims the Win Area (once), unlocks and auto-equips Nobara,
 *     goes home on a fresh run, teleports to Stage 2, buys an upgrade;
 *   - a SEEDED veteran (Rebirth 15, Toji, fourteen auras) buys the fifteenth
 *     aura, trains on the 15x Lava bag for character x bag x rebirth x aura,
 *     the bag punching on its own, and rebirths: Energy and Level reset,
 *     Wins, the sorcerer and the auras kept;
 *   - a SEEDED Rebirth 14 player on the same bag trains at 1x and is told why;
 *   - a bystander in the same room is untouched by all of it.
 *
 * Run: npm run build:server && node scripts/verify-run.mjs
 */
import { Player, S, check, failureCount, profile, section, sleep, startServer, waitFor } from './lib/harness.mjs';

const PORT = 2791;
const stamp = Date.now().toString(36);
const ROOKIE = `rookie_${stamp}`;
const VET = `vet_${stamp}`;
const LOW = `low_${stamp}`;

let fourteen = 0;
for (let id = 1; id <= 14; id += 1) fourteen = S.withAura(fourteen, id);

const server = await startServer({
  port: PORT,
  profiles: {
    [ROOKIE]: profile({ energy: 500, bestEnergy: 500, xp: 500 }),
    [VET]: profile({
      rebirths: 15, wins: 30e9, lifetimeWins: 30e9, character: 12, morph: 1, aura: 14, auraMask: fourteen,
      energy: 5e6, bestEnergy: 5e6, xp: S.xpForLevel(400), bestStage: 6,
    }),
    [LOW]: profile({ rebirths: 14 }),
  },
});

/** Every gain a punch reports is the base, or the base x3 when lucky (and flagged). */
const paid = (message, base) => (message?.lucky ? message.gain === base * S.LUCKY_MULTIPLIER : message?.gain === base);

try {
  const hero = await Player.join(server.endpoint, `hero_${stamp}`, 'Hero');
  const bystander = await Player.join(server.endpoint, `by_${stamp}`, 'Bystander');
  await hero.idle(500);

  section('A fresh player');
  const h = () => hero.me;
  check(h().energy === 0 && h().wins === 0 && h().rebirths === 0, 'starts with 0 Cursed Energy, 0 Wins, Rebirth 0');
  check(h().character === 1 && h().morph === false, 'trains as Yuji (+1) while looking like their own avatar');
  check(h().wallsBroken === 0 && h().wallHp === S.WALLS[0].hp && h().claimed === 0, `a fresh run: every wall standing, the first at ${S.WALLS[0].hp} HP`);
  check(h().level === 1 && h().gainPerPunch === 1, 'Level 1, +1 per punch');

  section('No passive Cursed Energy');
  await hero.idle(2000);
  check(h().energy === 0, 'standing for two seconds pays nothing');

  section('Training');
  await hero.train(12);
  await hero.idle(300);
  const trained = hero.messages[S.MessageType.Trained];
  const sum = trained.reduce((total, m) => total + m.gain, 0);
  check(trained.length === 12 && trained.every((m) => paid(m, 1) && m.bag === 1), `12 punches each pay +1 (or a lucky +3) at 1x (${trained.filter((m) => m.lucky).length} lucky)`);
  check(h().energy === sum && h().xp === sum && h().punchCount === 12, `the energy and XP are their sum (${sum}); the punch count is replicated`);
  await bystander.idle(200);
  check(bystander.see(hero.id)?.punchCount === 12 && bystander.see(hero.id)?.energy === sum, 'the bystander sees every punch and the new Cursed Energy');

  section('The server rate-limits punches');
  const before = h().energy;
  for (let i = 0; i < 40; i += 1) hero.send(S.MessageType.Train);
  await hero.idle(400);
  const burst = hero.messages[S.MessageType.Trained].length - 12;
  check(burst >= 1 && burst <= 5 && h().energy > before, `40 punches sent at once pay only a burst (${burst})`);

  section('The first wall');
  const wall0 = S.WALLS[0];
  hero.send(S.MessageType.Smash, { wall: 0 });
  await hero.idle(400);
  check(h().wallsBroken === 0 && h().wallHp === wall0.hp, 'a blow from the spawn, far from the wall, does nothing');
  await hero.walkTo(0, wall0.z + 10, { maxSeconds: 8 });
  const face = wall0.z - S.WALL_THICKNESS / 2;
  check(h().z < face, `the standing wall stops the player (z ${h().z.toFixed(2)} < face ${face.toFixed(2)})`);
  hero.send(S.MessageType.Smash, { wall: 3 });
  await hero.idle(400);
  check(h().wallsBroken === 0, 'a blow naming a wall further on is refused');
  hero.send(S.MessageType.ClaimStage, { stage: 1 });
  await hero.idle(300);
  check(h().wins === 0, 'a claim before the boss falls pays nothing');
  const energy = h().energy;
  await hero.smash(1, 0);
  await hero.idle(300);
  check(energy < wall0.hp && h().wallHp === wall0.hp - energy, `one blow takes the whole Cursed Energy (${energy}) off the ${wall0.hp} HP wall`);
  let blows = 1;
  while (h().wallsBroken === 0 && blows < 10) {
    await hero.smash(1, 0);
    blows += 1;
  }
  check(h().wallsBroken === 1 && blows === Math.ceil(wall0.hp / energy), `it falls in ceil(${wall0.hp} / ${energy}) = ${Math.ceil(wall0.hp / energy)} blows (took ${blows})`);
  check(h().wallHp === S.WALLS[1].hp && h().totalWalls === 1 && h().attackKind === 1, 'the next wall stands; the break is counted and replicated as a wall blow');

  section('Refusals');
  hero.send(S.MessageType.Teleport, { to: 'spawn' });
  await hero.idle(500);
  hero.send(S.MessageType.EquipCharacter, { id: 4 });
  await hero.idle(300);
  check(h().character === 1, 'Maki (25 Wins) cannot be equipped with 0 Wins');
  hero.send(S.MessageType.BuyUpgrade, { id: 'speed' });
  hero.send(S.MessageType.BuyAura, { id: 1 });
  await hero.idle(300);
  check(h().upgrades.speed === 0 && h().aura === 0 && h().auraMask === 0, 'upgrades and auras cost Wins: refused with none');
  hero.send(S.MessageType.Rebirth);
  await hero.idle(300);
  check(h().rebirths === 0 && h().energy > 0, `a rebirth below the Level ${S.levelCap(0)} cap is refused`);
  await hero.walkTo(0, -60, { maxSeconds: 4 });
  check(h().z > S.HUB.minZ - 1.4 - 0.5 && !h().inPvp, `the arena gate stops a Rebirth 0 player (z ${h().z.toFixed(2)})`);

  section('A seeded rookie clears Stage 1');
  const rookie = await Player.join(server.endpoint, ROOKIE, 'Rookie');
  await rookie.idle(300);
  const r = () => rookie.me;
  const stage1 = S.stageByIndex(1);
  check(r().energy === 500 && r().wins === 0, 'restored: 500 Cursed Energy, no Wins');
  for (let id = 0; id < stage1.wallCount; id += 1) {
    await rookie.walkTo(0, S.WALLS[id].z - 2.2, { stopAt: 0.6, maxSeconds: 6 });
    await rookie.smash(1, id);
  }
  await rookie.idle(300);
  check(r().wallsBroken === stage1.wallCount, `all ${stage1.wallCount} walls fall, one blow each`);
  check(rookie.messages[S.MessageType.Smashed].filter((m) => m.boss).length === 1, 'the last is the boss');
  check(rookie.messages[S.MessageType.StageCleared].some((m) => m.stage === 1 && m.firstClear) && r().bestStage === 1, 'Stage 1 is reported complete, a first clear');
  await rookie.walkTo(0, stage1.claimZ, { maxSeconds: 6 });
  rookie.send(S.MessageType.ClaimStage, { stage: 1 });
  await rookie.idle(400);
  check(r().wins === 0, 'the lane down the middle is not the Win Area: walking past it claims nothing');
  await rookie.walkTo(stage1.claimX, stage1.claimZ, { maxSeconds: 6 });
  rookie.send(S.MessageType.ClaimStage, { stage: 1 });
  await waitFor(() => r().wins === 1, 'the Stage 1 Win', 3000).catch(() => null);
  check(r().wins === 1 && r().lifetimeWins === 1, 'standing on the Win Area banks +1 Win');
  const award = rookie.last(S.MessageType.StageAwarded);
  check(award?.stage === 1 && award?.unlocked === 2 && r().character === 2, 'Nobara (+2) is unlocked and equipped automatically');
  rookie.send(S.MessageType.ClaimStage, { stage: 1 });
  await rookie.idle(300);
  check(r().wins === 1, 'claiming again pays nothing');
  await waitFor(() => rookie.messages[S.MessageType.Respawn].some((m) => m.reason === 'claimed'), 'the trip home', 4000).catch(() => null);
  await rookie.idle(300);
  check(Math.hypot(r().x, r().z) < 1 && r().wallsBroken === 0 && r().claimed === 0, 'then home on a fresh run: every wall stands, every claim is open');

  section('Stage teleports');
  rookie.send(S.MessageType.Teleport, { to: 'stage3' });
  await rookie.idle(400);
  check(S.stageAt(r().z) === 0, 'Stage 3 is refused (best stage 1 opens up to Stage 2)');
  rookie.send(S.MessageType.Teleport, { to: 'stage2' });
  await waitFor(() => S.stageAt(r().z) === 2, 'stage 2', 3000).catch(() => null);
  check(S.stageAt(r().z) === 2 && r().wallsBroken === S.stageByIndex(2).firstWall, 'Stage 2 is open: the walls before it count as broken');
  check(S.isClaimed(r().claimed, 1) && !S.isClaimed(r().claimed, 2), 'and Stage 1 as claimed: no stage pays twice');

  section('Upgrades');
  const speed0 = r().moveSpeed;
  rookie.send(S.MessageType.BuyUpgrade, { id: 'speed' });
  await waitFor(() => r().upgrades.speed === 1, 'the upgrade', 2000).catch(() => null);
  check(r().upgrades.speed === 1 && r().wins === 1 - S.upgradeCost('speed', 0), `Speed level 1 for ${S.upgradeCost('speed', 0)} Win`);
  check(r().moveSpeed > speed0 && Math.abs(r().moveSpeed - S.runSpeedFor(1)) < 1e-3, `and the server runs them faster (${speed0.toFixed(1)} -> ${r().moveSpeed.toFixed(1)})`);
  check(r().lifetimeWins === 1 && r().character === 2, 'spending Wins never relocks a sorcerer');
  rookie.send(S.MessageType.SetMorph, { morph: false });
  await rookie.idle(300);
  check(r().morph === false && r().character === 2, 'the avatar look is a cosmetic choice: the power stays');

  section('A seeded veteran on the 15x Lava bag');
  const vet = await Player.join(server.endpoint, VET, 'Veteran');
  await vet.idle(300);
  const v = () => vet.me;
  check(v().rebirths === 15 && v().character === 12 && v().aura === 14, 'restored: Rebirth 15, Toji, Flow Purple');
  const cost15 = S.AURAS[14].cost;
  vet.send(S.MessageType.BuyAura, { id: 15 });
  await waitFor(() => v().aura === 15, 'the aura', 2000).catch(() => null);
  check(v().aura === 15 && S.ownsAura(v().auraMask, 15) && v().wins === 30e9 - cost15, `buys ${S.AURAS[14].name} for ${S.formatAmount(cost15)} Wins, and wears it`);
  vet.send(S.MessageType.BuyAura, { id: 15 });
  await vet.idle(300);
  check(v().wins === 30e9 - cost15, 'an owned aura cannot be bought twice');
  const lava = S.BAGS.find((b) => b.stage === 0 && b.tier === 5);
  const mat = { x: lava.x + lava.facing * ((S.BAG_SIZE.matNear + S.BAG_SIZE.matFar) / 2), z: lava.z };
  await vet.walkTo(-44, mat.z, { maxSeconds: 6 });
  await vet.walkTo(mat.x, mat.z, { stopAt: 0.3, maxSeconds: 6 });
  check(v().bag === lava.id && v().y >= S.DAIS_HEIGHT - 0.05, `at the Lava bag on the dojo floor (bag ${v().bag}, y ${v().y.toFixed(2)})`);
  const expected = 100_000 * 15 * 16 * S.AURAS[14].multiplier;
  const clicks = () => vet.messages[S.MessageType.Trained].filter((m) => !m.auto);
  const clicked = clicks().length;
  await vet.train(1);
  await vet.idle(200);
  const click = clicks()[clicked];
  check(paid(click, expected) && click.bag === 15, `one punch pays 100K x 15 x 16 x ${S.AURAS[14].multiplier} = ${S.formatAmount(expected)} at the 15x bag (got ${S.formatAmount(click?.gain ?? 0)})`);
  const autos = () => vet.messages[S.MessageType.Trained].filter((m) => m.auto);
  const a0 = autos().length;
  await vet.idle(S.BAG_AUTO_PUNCH_SECONDS * 1000 * 2 + 400);
  const auto = autos().slice(a0);
  check(auto.length >= 2 && auto.every((m) => paid(m, expected) && m.bag === 15), `standing at the bag it punches on its own (${auto.length} automatic punches), paid in full`);

  section('A Rebirth 14 player at the same bag');
  const low = await Player.join(server.endpoint, LOW, 'Low');
  await low.walkTo(-44, mat.z + 0.6, { maxSeconds: 6 });
  await low.walkTo(mat.x, mat.z + 0.6, { stopAt: 0.3, maxSeconds: 6 });
  check(low.me.bag === lava.id, 'stands at the Lava bag');
  await low.train(1);
  await low.idle(300);
  check(paid(low.last(S.MessageType.Trained), 15) && low.last(S.MessageType.Trained)?.bag === 1, 'trains at 1x: +1 x 1 x 15 = 15');
  check(low.messages[S.MessageType.Notice].some((m) => m.kind === 'locked' && /Rebirth 15/.test(m.text)), 'and is told the Lava bag needs Rebirth 15');
  await low.idle(S.BAG_AUTO_PUNCH_SECONDS * 1000 + 600);
  check(!low.messages[S.MessageType.Trained].some((m) => m.auto), 'a bag they cannot use punches nothing on its own');

  section('Rebirth');
  const wins = v().wins;
  vet.send(S.MessageType.Rebirth);
  await waitFor(() => v().rebirths === 16, 'rebirth 16', 3000).catch(() => null);
  check(v().rebirths === 16, `at the Level ${S.levelCap(15)} cap the veteran rebirths to 16`);
  check(v().energy === 0 && v().level === 1, 'Cursed Energy and Level reset');
  check(v().wins === wins && v().character === 12 && v().aura === 15 && S.ownedAuraCount(v().auraMask) === 15, 'Wins, the sorcerer and every aura are kept');
  check(Math.hypot(v().x, v().z) < 1 && v().wallsBroken === 0, 'placed at the spawn on a fresh run');

  section('The bystander');
  const b = bystander.me;
  check(b.energy === 0 && b.wins === 0 && b.wallsBroken === 0 && b.claimed === 0, "untouched by everyone else's training, walls and claims");

  for (const p of [hero, bystander, rookie, vet, low]) await p.leave();
  await sleep(300);
} catch (error) {
  console.error(error);
  check(false, `the run threw: ${error?.message ?? error}`);
} finally {
  await server.stop();
}

const failures = failureCount();
console.log(failures === 0 ? '\nverify:run passed' : `\nverify:run: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
