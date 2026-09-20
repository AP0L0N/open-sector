# Gridlock

Original browser RTS (working title). **Not affiliated with EA.**

## Milestone 2

Menu, lobby, then a match: deploy the **Rig** into a **Core**, build **Dynamo / Smelter / Muster / Armory**, harvest **scrap** with **Maulers**, train **Troopers**, **Tigers**, and **StuG IIIs**, and fight (halt-to-fire). Radar lives in the right command bar.

Camera: fixed **2:1 isometric** (RA2 / Sudden Strike 2 feel). **Arrow keys**, **W**/**D**, or middle-mouse drag pan in screen space (**A** and **S** are orders). **H** homes on your HQ. **+** / **−** change game speed (1×–5×, host only). Select the Rig and press **E**, or click it twice, to unpack a Core. Hovering a unit with a ready special swaps the crosshair for a gold pointer. Specials have a cooldown (2s for deploy/pack). Shared orders: **R** rotate (face a point), **G** guard (click and drag to face), **S** stop, **A** attack-move (halt to fire, then keep going), hold **Ctrl** and click to force-attack a point or any unit including friendlies. Guard overwatch: units group there, hold, and fire 360°, but enemies in the cone are engaged first.

Troopers take buildings instead of shooting them: order an attack, stand next to the structure, and hold until the capture bar fills. Drive them off to stop it. Captured buildings change owner. Tigers and StuG IIIs still shell structures. The StuG has no turret — it hull-steers onto the target.

Units collide and do not pass through each other. Armored vehicles crush opposing infantry if they drive over them. Destroyed Tigers leave a wreck that blocks the tile until you shoot it apart (repair is not in yet). Troopers fire **rifle clips** (eight rounds, then a reload); a **broken arm** swaps to a handgun with its own seven-round magazine. Each trooper is a slightly faster or slower reloader — that pace is rolled when he is trained and never changes. Hits can cripple survivors: infantry may take a **broken arm** (handgun only) or **broken leg** (can only crawl); motor vehicles risk **broken tracks** on a side hit (20%) or a **dead engine** on a rear hit (40%). Status icons sit next to the unit. Troopers can **Stand**, **Crouch** (C), or **Crawl** (Z). Crouch and crawl shrink their silhouette and tighten their aim; crawl is the stronger of the two. They drop prone on their own when someone is shooting at them. Infantry can **slowly swim** water that vehicles cannot enter, but they cannot fire until they reach shore. Tigers carry a mixed rack of about twenty AP / HE / HEAT / Smoke shells — pick the load in the right-hand **Config** panel. Smoke shells lay a screen across several tiles that blocks vision for everyone. Force-attacking with Smoke fires one round, then stops. 75mm rounds show a tracer in flight. A Tiger can **open the hatch** (I / Scout) so a crewman looks out: the tank sees as far as infantry, including over a rise, but that head can be shot (about 3× trooper HP). A hull hit buttons him up; remaining HP never comes back, and a dead scout means no more hatch. Mixed selections get type tabs there. Shared orders (Stop, Move attack, Force attack here, Guard, Rotate, Deploy, Harvest, Sell) sit as quick actions on the bottom left.

**Scrap Yard** has rolling hills and valleys. Units climb slowly and pick cheaper paths around a rise. High ground adds sight and can see the slope below, including each terrace lip; weapon range follows that sight plus 20%. Auto-attack still needs the enemy to be visible — a teammate who sees farther (a hatched tank scout; later: binoculars) is what makes that extra band usable. Accuracy falls off at max range. Ridges block vision past them. Tigers cannot elevate the gun at a steep lip — a hull in a valley or hole cannot hit a target much above it. A hilltop with a clear view fires down; there is no depression limit.

## Prerequisites

- Node.js 22+

## Dev

```bash
cd gridlock && npm install && npm run dev
```

Open two Chrome tabs to http://localhost:5177

## Playtest

Enter a callsign on first launch (saved locally and skipped next time; also in Options).

**Skirmish** is single-player: click Skirmish from the menu and you land in a solo briefing. No Ready switch, no room code, no join.

**Network:**

1. Network → Create game in one tab.
2. Network → Join game by code in the other.
3. Ready both players; host hits Start.
4. You should see a Rig at each spawn. Hover it — the cursor becomes a gold pointer. Click it twice (or select it and press **E**). A progress bar fills for 3 seconds, then a Core appears. Packing is locked for 2 seconds after that.

## Production build

```bash
npm run build && NODE_ENV=production PORT=3010 HOST=127.0.0.1 npm start
```

Ubuntu sketches (systemd + nginx): [`deploy/`](deploy/).

## Legal

Original art and CSS only. No EA / Westwood assets, fonts, music, voices, map files, or traced UI.
