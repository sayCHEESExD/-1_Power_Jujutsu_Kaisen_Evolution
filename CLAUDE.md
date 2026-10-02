# +1 Power Jujutsu Kaisen Evolution

Browser multiplayer "+1" training game, Jujutsu Kaisen themed: punch training bags for Cursed Energy, break the
walls of 50 cursed stages for Wins, unlock twelve sorcerers, buy upgrades and auras with Wins, rebirth for better
bags, fight in the Culling Arena. Three.js client, Colyseus server, npm workspaces (`shared` / `server` /
`client`). Converted from `D:\+1 Muscle to Break Walls` (networking, Bloxity auth and persistence, Bux grants,
walls/stages/claims, PvP, deploy all kept); the character rigs and paint kit come from Anime Evolution.

## Commands

```bash
npm run dev                 # builds shared, then server (tsx watch, :2790) + Vite client (:5390)
npm run build               # shared + server + client (client/dist)
npm run typecheck           # all workspaces
npm run verify              # progression + assets + run + multiplayer (the last two spawn their own servers)
npm run verify:progression  # the rules, offline: sorcerers, bags, auras, upgrades, stages, collision, pacing sim
npm run verify:run          # own server :2791 - training, walls, boss, claims, run reset, upgrades, auras, bags, rebirth
npm run verify:multiplayer  # own server :2792 - sync between players, the arena, knockouts, boards, rejoin
npm run verify:capacity     # needs `npm run dev` running; 18 clients, expects 15-per-room routing
npm run verify:persistence  # identity/storage/migration/purchases, JSON and Mongo (if mongod is found); own port 2795
npm run size:client         # client/dist size against the 12 MB budget
```

The live suites seed profiles through `scripts/lib/harness.mjs` (a JSON store written before the server opens it,
`JJK_DATA_DIR`). Training gains can roll LUCKY (x3), so suites read gains off `Trained` messages.
Do NOT use python from the Bash tool on this machine. Use node/sed/perl. Never commit or push: the user handles git.
Beware shell escaping when patching files that contain backticks: prefer the Write/Edit tools. After editing
`shared/src`, run `npm run build:shared` (client and server import `shared/dist`).

## Non-negotiable rules

- Ports: server **2790**, Vite **5390**, preview 4390. Room `jjkevolution`, Bloxity slug `power-jujutsu-kaisen-evolution`
  (`shared/src/config/accounts.ts` AND `client/src/bloxity/Bloxity.ts`), 15 per room.
- **Client build under 12 MB** (currently ~4.9 MB, 3.3 MB of it the music). Everything in the world is batched
  primitives (`render/PartBuilder`, prop kit `world/JjkProps.ts`, per-theme scenery `world/Zones.ts`) or
  canvas-painted textures (`world/WallMaterials.ts`, `suits/SuitPainter.ts`). `client/vite.config.ts` prunes
  unused assets; `verify-assets` pins digests. Asset file names must not contain spaces.
- **The body**: every player STARTS as their own Bloxity avatar (`bloxity/AvatarBody.ts`, slot `AVATAR_SLOT`). The
  equipped sorcerer is a painted rig (`suits/SuitBody.ts` + `characters/JjkCharacters.ts`) shown only when
  `morph` is on (equipping from a pedestal/menu turns it on; the Sorcerers window toggles it). The look is
  cosmetic: the power comes from the equipped character either way. Auras: `characters/AuraFx.ts`.
- **Everything is server-authoritative.** Clients send input and requests. `ProgressionService.creditPunch` is
  the ONLY granter of Cursed Energy/XP (it rolls luck); `WallService` the only thing that damages walls and pays
  stage Wins (through `Wallet`); `PvpService` the only thing that hurts players; `CharacterService`,
  `UpgradeService`, `AuraService` check every purchase/equip. Training punches, wall blows and PvP blows share ONE
  rate limit (`ActionLimiter`, refill scaled by Punch Rate). The ONLY passive gain: standing at a bag the player
  can use punches it every `BAG_AUTO_PUNCH_SECONDS` (server-timed `GameRoom.trainAtBag`, `Trained.auto`).
- **One click = one action, chosen by where the player stands** (`Game.chooseAction`, mirrored by the server's
  checks): the next standing wall in reach -> SMASH; an opponent in reach inside the arena -> PUNCH; else TRAIN.
- **Gain** (`progression.ts`): character power x bag (1x off one, or locked) x (1 + rebirths) x aura x Training
  Rate (+5%/level); lucky punches x3 (`luckyChance`). XP = energy gained; XP to next = 60 x 1.12^(L-1).
  **Level cap** = 10 x (R + 1); rebirth needs the cap (`rebirth.ts`) and resets Energy, XP and the run; keeps
  Wins, characters, upgrades, auras. There is NO way to skip the requirement (no Skip Rebirth).
- **Sorcerers** (`characters.ts`): exactly 12 (Yuji +1 free ... Toji +100K at 2.5M), unlocked by LIFETIME Wins
  (spending never relocks). A claim that unlocks a better one auto-equips it. NEVER REORDER (persisted id).
- **Bags** (`bags.ts`, placements `BAGS` in `map.ts`): Bronze 1x R0, Green 2x R1, Red 4x R3, Pink 6x R5, Gold 12x
  R11, Lava 15x R15 - a pair of each in the hall's Training Zone (front row on the floor, back row on the dojo
  dais), two Bronze in every stage nook. Standing on the mat (server position, `bagAt`) applies.
- **Upgrades** (`upgrades.ts`): Speed (max 20), Training Rate, Luck (max 30), Boss Damage, Punch Rate (max 15),
  bought with Wins. **Auras** (`auras.ts`): 15, 2x ... 700x, bought once with Wins (float mask), one equipped.
- **Walls** (`stages.ts`): 50 stages; 10/15/20 walls then 25 (1,220 walls), the last of each a BOSS (its last and
  hardest wall; Boss Damage applies). Wall HP follows ONE curve by wall Level (`lnHpAt`): exactly the reference
  game's Level 1 50, Level 11 376, Level 26 4.1K, Level 46 70.3K (Hermite in ln HP), then per-wall growth easing from
  14% toward `TAIL_GROWTH` 1.2% (last wall ~1.5e17); every wall strictly tougher than the one before. Win Areas: after wall Level 10 +1, 25 +5, 45 +25, then x1.42. Walls fall in order; `wallsBroken`
  (per player, per RUN) is all collision needs. A run resets whenever the player is placed at the spawn; a stage
  teleport counts earlier stages broken AND claimed. Claiming pays once, then the server sends the player home.
  Stages stream in/out on the client (`world/StageWorld.ts`, 3-slot wall pool; sky/fog via `world/Atmosphere.ts`).
- **PvP** (`pvp.ts`): the Culling Arena behind the back wall; its gate is a solid below Rebirth 3. Blows deal 10%
  of 350% Cursed Energy; health is 100 + energy; a KO lies 2 s then goes home.
- **No overlapping solids.** Every solid is in `shared/src/config/map.ts` / `stages.ts`; the client draws exactly
  those boxes. Daises are 0.9 high (under `MOVEMENT.stepHeight`), so they are walked onto.
- **Responsive HUD: one unit** `--u`; the JJK look is `ui/jjkStyles.ts` (`jk-*`, on top of `ui/muscleStyles.ts`
  `sp-*`). Windows in `ui/Windows.ts`, buttons/status in `ui/Hud.ts`, icons `ui/icons.ts`.
- **Bloxity platform hooks**: emotes (`registerFeature('emotes')`, `Game.playEmote`, `PlayerState.emote`), profile
  stats (`server/src/bloxity/statReporter.ts`, no-op without `BLOXITY_REPORT_TOKEN`/`BLOXITY_GAME_ID`), live rooms
  (`server/src/routes/rooms.ts`; it answers 502 on a Legion pod until a cross-pod directory reader is installed -
  `legion-room-reporter.ts` is NOT in this repo), friend-join toasts (`playerInRoom`/`playerJoined` by the VERIFIED
  `PlayerState.username`, set from Bloxity's verify answer, never a client), invite links (`?roomId=`, `client/src/net/deepLink.ts`). There is NO shop in the
  game (no Shop tile, no Bux Store panel); the server's purchase webhook/`BuxGrants` (wins packs) is kept dormant.

## Layout facts (`shared/src/config/map.ts`)

- Spawn (0,0,0) faces +Z; the camera's RIGHT is -X. Hall x -64..64, z -40..40, ceiling 34.
- Sorcerers row LEFT (+X): dais x 48..64, twelve pedestals at x 55, z -30.25..30.25 (Yuji at -Z).
- Training Zone RIGHT (-X): front bags x -36 (Bronze/Green/Red), back row x -56 on the dojo dais (Pink/Gold/Lava).
- Booths flanking the portal: Upgrader (-24, 31), Aura Shrine (24, 31). Gojo/Sukuna statues on the front ledges.
- Back (-Z): four boards (Energy, Rebirths | gate | Wins, Playtime), arena gate x +-8, arena x +-36, z -104..-44.
- Front: portal into the corridor; each stage: a 24-long nook with two bags, walls every 3.4, then its Win Area to
  the side (alternating).

## Verification before calling anything done

`npm run typecheck && npm run verify && npm run build:client && npm run size:client`, then with `npm run dev`
running: `npm run verify:capacity`; and `npm run verify:persistence` after any change to auth, persistence,
join/leave/switch paths or the webhook.
