# Open Sector

Open Sector is an original browser RTS. The code package is Gridlock. Art briefs call the same game Narrow Front. Build the game that is already in the tree.

A match is a small combined-arms fight on a dirt map with hills, buildings, trees, and water. The player unpacks a Rig into a Core, spends scrap, and trains replacements. Power comes from buildings. When use exceeds supply, production slows and never fully stops. Losing the Core eliminates that player and removes their units. A winner is declared only when the match started with at least two humans. Solo play is a sandbox.

The fight is about the ground and the single unit in it:

- Sight, cover, elevation, and smoke decide who can fire.
- Infantry are individuals: a clip, a personal reload pace, stand / crouch / crawl, crippling hits, and a corpse on open ground.
- Vehicles are hulls: armor by facing, a chosen shell, tracks that finish their yaw before they roll, and a wreck that blocks until it is shot apart.
- Infantry take buildings by standing the capture. Tanks shell them. A captured structure changes owner.

The picture is a fixed 2:1 isometric canvas and a readable command bar. Original art and interface only. Historical notes beside a unit constrain stats for systems the game already has. They are not a request to add the missing historical feature.

When a request can go several ways, pick the one that makes one soldier or one tank's situation clearer, uses the ground as the reason, and keeps scrap, power, training, and the Core as the whole economy. An explicit request wins over that preference.

## Where a change goes

| Concern | Home |
|---|---|
| Match rules, orders, combat, movement, sight, economy | `gridlock/packages/shared` |
| Stats, costs, type ids, player-facing names, blurbs | `gridlock/packages/shared/src/catalog.ts` |
| Wire types and `PROTOCOL_VERSION` | `gridlock/packages/shared/src/protocol.ts` |
| Lobby, rooms, ticking, per-player snapshots | `gridlock/packages/server` |
| Drawing, input, HUD, effects that do not change the outcome | `gridlock/packages/client` |

The server runs the shared sim. It does not grow its own combat. Two clients must see the same outcome because both are rendering one sim. The playable client is the Vite canvas app. `gridlock/README.md` still mentions a Godot client; that tree is not in the repo. Leave it out of unrelated work.

`step()` in `gridlock/packages/shared/src/sim/match.ts` is the tick. Read it before adding a phase. New work belongs in the phase that already owns that behavior. `stepMatch` repeats the tick by game speed (capped at 5) and then runs AI.

Sim randomness uses a seeded generator tied to the match or the event. A snapshot or command field that changes shape bumps `PROTOCOL_VERSION` in the same change as its readers and writers.

Keep catalog type ids (`rifleman`, `gunner`, `sniper`, `hauler`, `warden`, `ss3`, buildings as named). The name on screen is `catalog.name`. Read `TRAIN_TYPES` for the current roster. The opening army is `START_UNITS`; the hauler is omitted so it does not start harvesting.

## How to work

1. Read the module and the test beside it. Match their patterns. The code wins when the README or an old note disagrees.
2. GitNexus impact runs before a function, class, or method is edited. Report the blast radius. Warn before a high or critical risk edit. `detect_changes()` runs before a commit. Renames go through GitNexus rename. The index name is `open-sector`.
3. Put the rule in the sim module that already owns it, and the numbers in the catalog.
4. Extend the `node:test` file next to that module. A match fixture that is not about the opening army passes `{ startingUnits: false }`. Copy `waypoints.length` to a local before later assertions so TypeScript does not narrow it to a constant.
5. Run the package you changed, from `gridlock/`:
   - `npm test -w @gridlock/shared`
   - `npm test -w @gridlock/server`
   - `npm test -w @gridlock/client`
   - `npm run typecheck` when the change crosses packages
6. A change the player can see gets exercised in the browser at the Vite origin (`gridlock/packages/client/vite.config.ts`, currently port 5177). `cd gridlock && npm run dev` serves the client and the hub (port 3010). If the browser is unavailable, say which tests ran and which clicks you could not make.

Unit sheets, turrets, hatch heads, and stance sheets follow `narrow-front-sprite-agent-brief.md`. Buildings stay on four facings. Tiles stay a single image.

Ship the request that was made. A new unit is a catalog entry, sprites, training, and tests. A new weapon behavior is a sim rule plus a catalog number. A new visual stays in the client when it does not change who wins. Update the README when you left a fact it states untrue, or when the user asks.

## Legal

Original art, interface, and code. No Westwood, EA, or Fireglow assets, fonts, music, voices, map files, or traced UI.
