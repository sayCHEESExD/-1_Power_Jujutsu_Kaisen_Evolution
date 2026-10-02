/**
 * THE RULES, pinned - no server needed. Run after `npm run build:server`
 * (which builds shared/dist).
 *
 *   - the twelve sorcerers: Cursed Energy per click and Wins exactly as
 *     specified, every threshold's boundary;
 *   - the six training bags: 1x/2x/4x/6x/12x/15x at Rebirth 0/1/3/5/11/15,
 *     a pair of each in the hall and two Bronze in every stage's nook;
 *   - the fifteen auras and five upgrades: escalating, affordable in order;
 *   - the stages: 10/15/20 walls then 25, Win Areas at wall Level 10 (+1),
 *     25 (+5) and 45 (+25), always tougher and richer, a boss closing each;
 *     wall HP through the reference curve (Level 1 50, 11 376, 26 4.1K,
 *     46 70.3K), every wall strictly tougher than the last;
 *   - levels, the level cap per rebirth, the gain formula, the arena;
 *   - collision, through the SHARED simulation: walls stand until broken,
 *     the PvP gate stands below Rebirth 3, the dojo floor is a step, and
 *     nothing a player must reach is inside a solid;
 *   - the economy, by a greedy-player simulation: milestones land in sane
 *     windows, so a retune that breaks the pacing fails here.
 */
import * as S from '../shared/dist/index.js';

let failures = 0;
const check = (condition, message) => {
  if (condition) console.log(`  ok    ${message}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${message}`);
  }
};
const section = (title) => console.log(`\n${title}`);

const K = 1_000;
const M = 1_000_000;

// ------------------------------------------------------------- characters
section('Sorcerers');
const SPEC = [
  ['Yuji', 1, 0], ['Nobara', 2, 1], ['Megumi', 5, 5], ['Maki', 25, 25], ['Toge', 50, 100], ['Panda', 100, 500],
  ['Nanami', 250, 2.5 * K], ['Todo', 1 * K, 10 * K], ['Black Flash Yuji', 4 * K, 50 * K], ['Mahito', 10 * K, 250 * K],
  ['Jogo', 25 * K, 1 * M], ['Toji', 100 * K, 2.5 * M],
];
check(S.CHARACTERS.length === 12 && S.STARTER_CHARACTER === 1, 'exactly 12 sorcerers, Yuji the starter');
SPEC.forEach(([name, power, wins], i) => {
  const c = S.CHARACTERS[i];
  check(c?.id === i + 1 && c.name.includes(name) && c.power === power && c.winsRequired === wins, `#${i + 1} ${c?.name}: +${S.formatAmount(power)}/click at ${S.formatWins(wins)} Wins`);
  if (wins > 0) check(!S.characterUnlocked(i + 1, wins - 1) && S.characterUnlocked(i + 1, wins), `#${i + 1} is locked at ${wins - 1} lifetime Wins and unlocked at ${wins}`);
  check(S.bestUnlockedCharacter(wins) === i + 1, `exactly ${S.formatWins(wins)} Wins makes #${i + 1} the best unlocked`);
});
check(S.characterPower(12, 0) === 1, 'a locked sorcerer trains as the starter (+1)');

// ------------------------------------------------------------------- bags
section('Training bags');
const BAGSPEC = [[1, 0], [2, 1], [4, 3], [6, 5], [12, 11], [15, 15]];
check(S.BAG_TIERS.length === 6, 'exactly 6 bag tiers');
BAGSPEC.forEach(([mult, rebirths], tier) => {
  const t = S.BAG_TIERS[tier];
  check(t.multiplier === mult && t.rebirthsRequired === rebirths, `${t.name}: ${mult}x at Rebirth ${rebirths}`);
  if (rebirths > 0) check(!S.canUseBag(tier, rebirths - 1) && S.bagMultiplier(tier, rebirths - 1) === 1, `${t.name} is locked (1x) at Rebirth ${rebirths - 1}`);
  check(S.canUseBag(tier, rebirths) && S.bagMultiplier(tier, rebirths) === mult, `${t.name} pays ${mult}x from Rebirth ${rebirths}`);
});
const hall = S.BAGS.filter((b) => b.stage === 0);
check(hall.length === 12 && BAGSPEC.every((_, tier) => hall.filter((b) => b.tier === tier).length === 2), 'the hall has two of each bag');
check(S.STAGES.every((s) => S.BAGS.filter((b) => b.stage === s.index && b.tier === 0).length === 2), 'every stage nook has two Bronze bags');
const matPoint = (b) => ({ x: b.x + b.facing * ((S.BAG_SIZE.matNear + S.BAG_SIZE.matFar) / 2), y: b.floor, z: b.z });
check(S.BAGS.every((b) => { const p = matPoint(b); return S.bagAt(p.x, p.y, p.z) === b.id; }), 'standing on each mat reads as that bag');
check(S.bagAt(0, 0, 0) === -1, 'the spawn is not a bag');

// ---------------------------------------------------------- auras, upgrades
section('Auras and upgrades');
check(S.AURAS.length === 15, 'exactly 15 auras');
check(S.AURAS.every((a, i) => i === 0 || (a.multiplier > S.AURAS[i - 1].multiplier && a.cost > S.AURAS[i - 1].cost)), 'each aura is stronger and dearer than the last');
let mask = 0;
for (const a of S.AURAS) mask = S.withAura(mask, a.id);
check(S.AURAS.every((a) => S.ownsAura(mask, a.id)) && S.ownedAuraCount(mask) === 15, 'the owned mask holds all fifteen');
check(S.auraMultiplier(0, 0) === 1 && S.auraMultiplier(15, 0) === 1 && S.auraMultiplier(15, mask) === S.AURAS[14].multiplier, 'an aura multiplies only when owned and equipped');
check(S.bestOwnedAura(S.withAura(S.withAura(0, 3), 7)) === 7, 'the best owned aura');
check(S.UPGRADE_IDS.join() === 'speed,trainingRate,luck,bossDamage,punchRate', 'the five upgrades');
check(S.UPGRADE_IDS.every((id) => S.upgradeCost(id, 1) > S.upgradeCost(id, 0)), 'every upgrade gets dearer');
check(!Number.isFinite(S.upgradeCost('speed', 20)) && !Number.isFinite(S.upgradeCost('punchRate', 15)), 'Speed caps at 20, Punch Rate at 15');
check(S.runSpeedFor(0) === S.RUN_SPEED && S.runSpeedFor(4) > S.RUN_SPEED, 'Speed level 0 runs at the base speed, each level faster');
check(S.actionInterval(0) === S.ACTION.interval && S.actionInterval(15) < S.actionInterval(14), 'Punch Rate shortens the punch interval');
check(S.luckyChance(0) > 0 && S.luckyChance(1000) === 0.5, 'Luck raises the lucky chance, capped at 50%');

// ---------------------------------------------------------------- stages
section('Stages');
check(S.STAGES.length >= 30, `${S.STAGES.length} stages (at least 30)`);
check(new Set(S.STAGES.map((s) => s.name)).size === S.STAGES.length, 'every stage has its own name');
const counts = [10, 15, 20];
check(S.STAGES.every((s, i) => s.wallCount === (counts[i] ?? 25) && s.wallHp.length === s.wallCount), 'walls per stage: 10, 15, 20, then 25');
const firstWins = [[10, 1], [25, 5], [45, 25]];
firstWins.forEach(([level, reward], i) => {
  const s = S.STAGES[i];
  check(s.firstWall + s.wallCount === level && s.reward === reward, `the Win Area after wall Level ${level} pays +${reward}`);
});
let ordered = true;
for (let i = 1; i < S.STAGES.length; i += 1) {
  const a = S.STAGES[i - 1];
  const b = S.STAGES[i];
  if (!(b.wallHp[0] > a.wallHp[0] && b.bossHp > a.bossHp && b.reward > a.reward && b.startZ === a.endZ)) ordered = false;
}
check(ordered, 'every stage is tougher and richer than the last, and they adjoin');
check(S.STAGES.every((s) => s.wallHp.every((hp, i) => i === 0 || hp > s.wallHp[i - 1]) && s.wallHp[s.wallCount - 1] === s.bossHp), 'inside a stage the walls only toughen, the last is the boss');
for (const [level, hp] of [[1, 50], [11, 376], [26, 4_100], [46, 70_300]]) {
  check(S.WALLS[level - 1].hp === hp, `wall Level ${level} takes ${S.formatAmount(hp)} Cursed Energy (the reference curve)`);
}
check(S.WALLS.every((w, i) => i === 0 || w.hp > S.WALLS[i - 1].hp), `every one of the ${S.WALLS.length} walls is tougher than the one before it`);
check(S.WALLS.every((w, i) => i < 46 || w.hp / S.WALLS[i - 1].hp >= 1.01), `past Level 46 each wall is still at least 1% tougher (last wall ${S.formatAmount(S.WALLS[S.WALLS.length - 1].hp)})`);
check(S.WALLS.every((w, i) => w.id === i && (i === 0 || w.z > S.WALLS[i - 1].z)), 'walls are numbered in corridor order');
check(S.WALLS.filter((w) => w.boss).length === S.STAGES.length, 'one boss wall per stage');
check(S.STAGES.every((s) => s.bagZ < s.wallZ[0] && s.claimZ > s.wallZ[s.wallZ.length - 1] && s.claimZ < s.endZ), 'each stage: nook, then walls, then the Win Area');
check(S.stageComplete(10, 1) && !S.stageComplete(9, 1) && !S.stageComplete(44, 3) && S.stageComplete(45, 3), 'a stage completes exactly when its boss falls');
check(S.claimedBefore(3) === 3 && S.isClaimed(S.withClaimed(0, 5), 5) && !S.isClaimed(S.withClaimed(0, 5), 4), 'claim masks');
let maskAll = 0;
for (const s of S.STAGES) maskAll = S.withClaimed(maskAll, s.index);
check(S.STAGES.every((s) => S.isClaimed(maskAll, s.index)), `a mask holds all ${S.STAGES.length} claims exactly`);
check(S.damageOfEnergy(759) === 759 && S.damageOfEnergy(0) === 1, 'a blow deals the whole Cursed Energy (at least 1)');
check(S.stageAt(S.STAGES[4].startZ + 1) === 5 && S.stageAt(0) === 0, 'stageAt reads the corridor');

// ----------------------------------------------------------- progression
section('Levels, gain, rebirth, PvP');
check(S.xpToNext(1) === S.XP_BASE && Math.abs(S.xpToNext(2) - S.XP_BASE * S.XP_GROWTH) < 1e-9, 'Level 1 needs 60 XP, each next 12% more');
let levelsOk = true;
for (let i = 0; i < 2000; i += 1) {
  const xp = Math.floor(Math.random() * 10 ** (1 + Math.random() * 12));
  const p = S.levelForXp(xp);
  if (!(S.xpForLevel(p.level) <= xp + 1e-6 && xp < S.xpForLevel(p.level + 1) + 1e-6)) levelsOk = false;
}
check(levelsOk, 'level bands hold for 2,000 random XP totals');
check(S.levelCap(0) === 10 && S.levelCap(1) === 20 && S.levelCap(5) === 60, 'the level cap: 10 per rebirth');
const capped = S.levelOf(1e12, 0);
check(capped.level === 10 && capped.maxed, 'XP past the cap holds at the cap, maxed');
check(!S.levelOf(S.xpForLevel(9), 0).maxed && S.canRebirth(10, 0) && !S.canRebirth(9, 0), 'rebirth needs the cap');
check(S.rebirthMultiplier(0) === 1 && S.rebirthMultiplier(10) === 11, 'rebirth multiplier 1 + R');
const base = { character: 1, lifetimeWins: 0, rebirths: 0, bagTier: -1, aura: 0, auraMask: 0, trainingRate: 0 };
check(S.gainPerPunch(base) === 1, 'a new player punches +1');
const full = { character: 12, lifetimeWins: 2.5 * M, rebirths: 15, bagTier: 5, aura: 15, auraMask: mask, trainingRate: 0 };
check(S.gainPerPunch(full) === 100 * K * 15 * 16 * S.AURAS[14].multiplier, 'gain = character x bag x (1 + rebirths) x aura');
check(S.gainPerPunch({ ...full, rebirths: 14 }) === 100 * K * 15 * S.AURAS[14].multiplier, 'a locked bag pays 1x');
check(S.gainPerPunch({ ...base, trainingRate: 10 }) === 1 && S.energyMultiplier({ ...base, trainingRate: 10 }) === 1.5, 'Training Rate multiplies (+5% a level)');
check(S.PVP.rebirthsRequired === 3 && !S.canEnterPvp(2) && S.canEnterPvp(3), 'the arena needs Rebirth 3');

// -------------------------------------------------------------- formatting
section('Number formatting');
for (const [value, text] of [[999, '999'], [1000, '1K'], [2500, '2.5K'], [100_000, '100K'], [2_500_000, '2.5M'], [1999, '1.9K']]) {
  check(S.formatAmount(value) === text, `${value} prints as ${text}`);
}

// --------------------------------------------------------------- collision
section('Collision (the shared simulation)');
const world = new S.WorldCollision();
const walk = (from, moveX, moveZ, seconds, access, jumpAt = -1) => {
  const motion = S.createMotion();
  S.resetMotion(motion, from.x, from.y ?? 0, from.z, 0);
  const params = { ...S.createSimParams(), ...access };
  const events = S.createSimEvents();
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i += 1) S.stepPlayer(motion, { moveX, moveZ, jump: i === jumpAt, cameraYaw: 0 }, params, 1 / 60, world, events);
  return motion;
};
const wall0 = S.WALLS[0];
const lane = { x: 0, z: wall0.z - 12 };
const shut = walk(lane, 0, 1, 3, { wallsBroken: 0, pvp: false });
check(shut.z < wall0.z - S.WALL_THICKNESS / 2, `the first wall stops a run that has not broken it (z ${shut.z.toFixed(2)})`);
const open = walk(lane, 0, 1, 1.5, { wallsBroken: 1, pvp: false });
check(open.z > wall0.z + 1 && open.z < S.WALLS[1].z, `once broken it is open, up to the next wall (z ${open.z.toFixed(2)})`);
const jumpWall = walk(lane, 0, 1, 3, { wallsBroken: 0, pvp: false }, 30);
check(jumpWall.z < wall0.z, 'no jump clears a standing wall');
const gateShut = walk({ x: 0, z: -30 }, 0, -1, 3, { wallsBroken: 0, pvp: false });
check(gateShut.z > S.HUB.minZ - 2 && !S.inPvpZone(gateShut.x, gateShut.z), `the PvP gate stops Rebirth 0-2 (z ${gateShut.z.toFixed(2)})`);
const gateOpen = walk({ x: 0, z: -30 }, 0, -1, 2, { wallsBroken: 0, pvp: true });
check(S.inPvpZone(gateOpen.x, gateOpen.z), `it lets Rebirth 3 through into the arena (z ${gateOpen.z.toFixed(2)})`);
// Onto the dojo floor between the back-row bags: toward -X is the stick's RIGHT (moveX +1).
const dojo = walk({ x: -40, z: 0 }, 1, 0, 1, { wallsBroken: 0, pvp: false });
check(Math.abs(dojo.y - S.DAIS_HEIGHT) < 0.01, `the dojo floor is a step (y ${dojo.y.toFixed(2)})`);
const free = (x, y, z) => !world.embedded(x, y, z, { wallsBroken: 0, pvp: true });
check(free(0, 0, 0), 'the spawn is clear');
check(S.CHARACTER_PADS.length === 12 && S.CHARACTER_PADS.every((p) => free(p.x, p.y, p.z)), 'every sorcerer pedestal can be stood on');
check(S.BAGS.every((b) => { const p = matPoint(b); return free(p.x, p.y, p.z); }), 'every bag mat can be stood on');
check(S.STAGES.every((s) => free(s.claimX, 0, s.claimZ) && free(0, 0, S.stageEntry(s.index).z)), 'every stage entry and Win Area is clear');
check(S.STAGES.every((s) => Math.abs(s.claimX) - S.CLAIM_PAD_HALF > 4 && s.claimZ - s.wallZ[s.wallZ.length - 1] >= 8 && s.endZ - s.claimZ >= 8), 'every Win Area sits to the side, with room around it');
check(S.BAGS.every((b) => b.stage === 0 || Math.abs(b.z - S.stageByIndex(b.stage).wallZ[0]) > 8), 'nook bags hang well clear of the first wall');
check(Object.values(S.TELEPORTS).every((p) => free(p.x, p.y, p.z)), 'every teleport lands clear');
check(S.BOOTHS.every((b) => S.boothAt(b.x, b.z) === b.kind), 'the booths read where they stand');

// ---------------------------------------------------------------- economy
section('Economy pacing (a greedy, always-clicking player)');
const sim = () => {
  const p = { t: 0, energy: 0, xp: 0, rebirths: 0, wins: 0, life: 0, character: 1, aura: 0, mask: 0, up: S.emptyUpgrades(), best: 0 };
  const at = {};
  const mark = (key) => {
    if (at[key] === undefined) at[key] = p.t;
  };
  const bestBag = () => {
    let tier = -1;
    for (const b of S.BAG_TIERS) if (S.canUseBag(b.tier, p.rebirths)) tier = b.tier;
    return tier;
  };
  const gain = () =>
    S.gainPerPunch({ character: p.character, lifetimeWins: p.life, rebirths: p.rebirths, bagTier: bestBag(), aura: p.aura, auraMask: p.mask, trainingRate: p.up.trainingRate }) *
    (1 + S.luckyChance(p.up.luck) * (S.LUCKY_MULTIPLIER - 1));
  const train = (seconds) => {
    const earned = gain() * seconds * (1 / S.actionInterval(p.up.punchRate) + 1 / S.BAG_AUTO_PUNCH_SECONDS);
    p.energy += earned;
    p.xp += earned;
    p.t += seconds;
  };
  const runCost = (index) => {
    const def = S.stageByIndex(index);
    let blows = 0;
    def.wallHp.forEach((hp, i) => {
      blows += Math.ceil(hp / (S.damageOfEnergy(p.energy) * (i === def.wallCount - 1 ? S.bossDamageFactor(p.up.bossDamage) : 1)));
    });
    return { seconds: blows * S.actionInterval(p.up.punchRate) + (def.endZ - def.startZ) / S.runSpeedFor(p.up.speed) + 7, blows };
  };
  const spend = () => {
    for (let guard = 0; guard < 400; guard += 1) {
      const next = S.AURAS.find((a) => !S.ownsAura(p.mask, a.id));
      if (next && p.wins >= next.cost) {
        p.wins -= next.cost;
        p.mask = S.withAura(p.mask, next.id);
        p.aura = next.id;
        mark(`aura${next.id}`);
        continue;
      }
      const options = S.UPGRADE_IDS.map((id) => ({ id, cost: S.upgradeCost(id, p.up[id]) })).filter((o) => Number.isFinite(o.cost)).sort((a, b) => a.cost - b.cost);
      const cheap = options[0];
      if (cheap && cheap.cost <= (p.wins - (next ? next.cost * 0.5 : 0)) * 0.25) {
        p.wins -= cheap.cost;
        p.up[cheap.id] += 1;
        continue;
      }
      break;
    }
  };
  while (p.t < 3600 * 30 && p.best < S.STAGE_COUNT) {
    if (S.levelOf(p.xp, p.rebirths).maxed) {
      p.rebirths += 1;
      p.energy = 0;
      p.xp = 0;
      p.t += 5;
      mark(`rebirth${p.rebirths}`);
      continue;
    }
    let target = 0;
    for (let s = 1; s <= Math.min(S.STAGE_COUNT, p.best + 1); s += 1) if (runCost(s).blows <= 160) target = s;
    if (target === 0) {
      train(20);
      continue;
    }
    p.t += runCost(target).seconds;
    const def = S.stageByIndex(target);
    p.wins += def.reward;
    p.life += def.reward;
    p.best = Math.max(p.best, target);
    mark(`stage${target}`);
    const best = S.bestUnlockedCharacter(p.life);
    if (best > p.character) {
      p.character = best;
      mark(`character${best}`);
    }
    spend();
    train(30);
  }
  return at;
};
const at = sim();
const minutes = (key) => (at[key] === undefined ? Infinity : at[key] / 60);
const within = (key, lo, hi, label) => check(minutes(key) >= lo && minutes(key) <= hi, `${label} after ${minutes(key).toFixed(1)} min (window ${lo}-${hi})`);
within('stage1', 0.2, 3, 'The first Win');
within('character3', 1, 15, 'Megumi (5 Wins)');
within('rebirth1', 1, 30, 'Rebirth 1');
within('rebirth3', 2, 90, 'Rebirth 3 (the arena)');
within('character12', 180, 1440, 'Toji (2.5M Wins)');
within('stage10', 45, 360, 'Stage 10');
within('stage30', 240, 1440, 'Stage 30');
within('stage40', 480, 1800, 'Stage 40');

console.log(failures === 0 ? '\nverify:progression passed' : `\nverify:progression: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
