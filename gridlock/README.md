# Gridlock

Original browser RTS (working title). **Not affiliated with EA.**

## Milestone 2

Menu, lobby, then a match: deploy the **Rig** into a **Core**, build **Dynamo / Smelter / Muster / Armory**, harvest **scrap** with **Haulers**, train **Troopers** and **Wardens**, and fight (halt-to-fire). Radar lives in the right command bar.

Camera: fixed **2:1 isometric** (RA2 / Sudden Strike 2 feel). **WASD** or arrow keys pan in screen space. **H** homes on your HQ. Select the Rig and press **E**, or click it twice, to unpack a Core. The cursor changes when a unit has a special action.

## Prerequisites

- Node.js 22+

## Dev

```bash
cd gridlock && npm install && npm run dev
```

Open two Chrome tabs to http://localhost:5173

## Playtest

1. Create a room in one tab.
2. Join by code in the other.
3. Ready both players; host hits Start.
4. You should see a Rig at each spawn. Click it twice (or select it and press **E**). A progress bar fills for 3 seconds, then a Core appears.

## Production build

```bash
npm run build && NODE_ENV=production PORT=3010 HOST=127.0.0.1 npm start
```

Ubuntu sketches (systemd + nginx): [`deploy/`](deploy/).

## Legal

Original art and CSS only. No EA / Westwood assets, fonts, music, voices, map files, or traced UI.
