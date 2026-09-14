# Gridlock

Original browser RTS (working title). **Not affiliated with EA.**

## Milestone 2

Menu, lobby, then a match: deploy the **Rig** into a **Core**, build **Dynamo / Smelter / Muster / Armory**, harvest **scrap** with **Maulers**, train **Troopers** and **Wardens**, and fight (halt-to-fire). Radar lives in the right command bar.

Camera: fixed **2:1 isometric** (RA2 / Sudden Strike 2 feel). **WASD** or arrow keys pan in screen space. **H** homes on your HQ. **+** / **−** change game speed (1×–5×, host only). Select the Rig and press **E**, or click it twice, to unpack a Core. Hovering a unit with a ready special swaps the crosshair for a gold pointer. Specials have a cooldown (2s for deploy/pack). **X** stops selected units. **F** (or Attack here) is attack-move: click a point, units halt to fire at anything in range, then keep going.

Units collide and do not pass through each other. Armored vehicles crush opposing infantry if they drive over them. Destroyed Wardens leave a wreck that blocks the tile until you shoot it apart (repair is not in yet). Hits can cripple survivors: infantry may take a **broken arm** (handgun only) or **broken leg** (slow); motor vehicles risk **broken tracks** on a side hit (20%) or a **dead engine** on a rear hit (40%). Status icons sit next to the unit. Wardens carry a mixed rack of about twenty AP / HE / HEAT shells — pick the load in the right-hand **Config** panel. Mixed selections get type tabs there. Shared orders (Stop, Attack here, Deploy, Harvest, Sell) sit as quick actions on the bottom left.

**Scrap Yard** has rolling hills. Units climb slowly and pick cheaper paths around a rise. High ground adds sight and weapon range; ridges block vision past them.

## Prerequisites

- Node.js 22+

## Dev

```bash
cd gridlock && npm install && npm run dev
```

Open two Chrome tabs to http://localhost:5173

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
