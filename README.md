# +1 Power Jujutsu Kaisen Evolution

A browser multiplayer training game set in the world of Jujutsu Kaisen. You start as your own Bloxity avatar;
every click is a punch for Cursed Energy. Train on six tiers of bags (Bronze 1x to Lava 15x), run the corridor and
break the walls of 50 themed stages - the Training Grounds, Tokyo streets, Jujutsu High, Shibuya, the Culling
Game, Infinite Void and on to the Throne of the Strongest - each ending in a boss wall and a Win Area. Wins unlock
twelve sorcerers (Yuji to Toji), buy upgrades (Speed, Training Rate, Luck, Boss Damage, Punch Rate) and fifteen
auras, rebirth to raise your level cap and open better bags, and fight in the Culling Arena from Rebirth 3.

Three.js client, authoritative Colyseus server (15 players per room), hosted on Bloxity.

## Play

| Action | PC | Mobile |
| --- | --- | --- |
| Run | WASD / arrows | left stick |
| Jump | Space | JUMP |
| Punch / smash a wall / strike in the arena | click (hold) | PUNCH (it says SMASH or STRIKE when that is what it will do) |
| Auto Click | C | Auto Click button |
| Rebirth / Upgrades / Sorcerers / Worlds / Auras / Boards | R / U / B / T / Y / L | left buttons |
| Music | M | Music button |

Step on a sorcerer's pedestal to equip it, onto a bag's mat to train at its multiplier (it keeps punching on
its own while you stand there), and onto a stage's Win Area once its boss is down to claim its Wins. Walk into
the Upgrader or the Aura Shrine beside the portal to open their menus.

## Develop

```bash
npm install
npm run dev
```

Client on http://localhost:5390, server on :2790. See `CLAUDE.md` for the rules, verification scripts and
layout facts.

## Deploy (Bloxity Hosting)

`.github/workflows/deploy.yml` publishes on every push:

| Branch | Channel | Frontend | Backend (WebSocket) |
| --- | --- | --- | --- |
| `dev` | DEV | https://power-jujutsu-kaisen-evolution.dev.play.bloxity.io | wss://power-jujutsu-kaisen-evolution.dev.host.bloxity.io |
| `main` | PROD | https://power-jujutsu-kaisen-evolution.play.bloxity.io | wss://power-jujutsu-kaisen-evolution.host.bloxity.io |

Any other branch does not deploy. A manual run (Actions, "Run workflow") follows the same mapping.

The run is ordered `verify` -> `server` -> `frontend`: nothing publishes unless the typecheck, the verification
suites, the client build and the 12 MB budget pass, and the frontend is uploaded only after its backend rolled,
so the two halves of a push always ship together.

- **Backend:** the Colyseus server is built from the root `Dockerfile` and pushed to
  `ghcr.io/<owner>/power-jujutsu-kaisen-evolution-server:<channel>-<sha>`. It is rolled with
  `POST https://legion.bloxity.io/v1/apps/power-jujutsu-kaisen-evolution/deploy`, using the commit SHA as the version,
  `seatCap` 15 (the room size) and `maxReplicas` 5. Legion injects `PORT` and `MONGODB_URI`, and
  probes `/health`.
- **Frontend:** `client/dist` is built with that channel's WebSocket URL baked in, zipped with
  `index.html` at the root, and uploaded raw to
  `POST https://api.bloxity.io/v1/hosting/games/power-jujutsu-kaisen-evolution/frontend?channel=<channel>&version=<sha>`.

One-time setup:

1. Create the game `power-jujutsu-kaisen-evolution` on https://hosting.bloxity.io (My Games).
2. Add the repository secret `LEGION_DEPLOY_TOKEN` (the token from My Games, behind the eye icon).
3. After the first run, make the GHCR package `power-jujutsu-kaisen-evolution-server` public (repository, Packages,
   Package settings, Change visibility) so Legion can pull it.
4. Optional, for the store page's Servers panel: in the portal's Developer panel set `allRoomsUrl` to
   `https://power-jujutsu-kaisen-evolution.host.bloxity.io/api/coly-matchmaker/all-rooms?mode=0`.
5. Optional, for profile stats: the server reports them only when the pod has `BLOXITY_REPORT_TOKEN` (the hosting
   docs do not list it among the injected variables, so it has to come from Bloxity). Without it reporting is off.

Progress lives in the Legion-injected MongoDB, per channel, so deploys never reset players.
