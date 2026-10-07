---
name: render
description: "Skill for the Render area of open-sector. 1095 symbols across 94 files."
---

# Render

1095 symbols | 94 files | Cohesion: 80%

## When to Use

- Working with code in `gridlock/`
- Understanding how lerpAirAlt, airLiftPx, inAir work
- Modifying render-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `gridlock/packages/client/src/render/mapview.ts` | hpBarFill, sheetCellAlpha, fieldRunIndex, connectedRun, noteBarrages (+293) |
| `gridlock/packages/client/src/render/bridge.ts` | brickDeckElev, rng, drawBrick, deck, at (+56) |
| `gridlock/packages/client/src/render/bridge.js` | brickDeckElev, brickFrame, along, arc, rng (+56) |
| `gridlock/packages/client/src/render/terrain.ts` | blitTerrain, shade, fillQuad, expandQuad, grow (+52) |
| `gridlock/packages/client/src/render/sprites.ts` | wreckSpriteFor, spriteFor, critIcon, unturnedBuildingSprite, wake (+29) |
| `gridlock/packages/client/src/render/fx.ts` | drawFxFrame, fxFrameAt, drawBloodStain, drawMortarSmoke, drawRicochetTrace (+25) |
| `gridlock/packages/client/src/render/explosion.ts` | deathBlastSpec, heBurstSpec, puff, rng, clamp01 (+21) |
| `gridlock/packages/client/src/render/wall.ts` | perpLeft, alongAxis, wallJoins, endOf, wallSectionsConnect (+20) |
| `gridlock/packages/client/src/render/turntable-sheet.ts` | opaqueBBox, makeSheetCanvas, place, revoke, canvasPngUrl (+18) |
| `gridlock/packages/client/src/render/flame-fx.ts` | patchHeat, tonguePose, drawFireGlow, drawBodyFlames, drawTongue (+17) |

## Entry Points

Start here when exploring this area:

- **`lerpAirAlt`** (Function) — `gridlock/packages/client/src/render/aircraft.ts:14`
- **`airLiftPx`** (Function) — `gridlock/packages/client/src/render/aircraft.ts:23`
- **`inAir`** (Function) — `gridlock/packages/client/src/render/aircraft.ts:27`
- **`aircraftShadowScale`** (Function) — `gridlock/packages/client/src/render/aircraft.ts:35`
- **`drawFallingBomb`** (Function) — `gridlock/packages/client/src/render/aircraft.ts:41`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `FogGl` | Class | `gridlock/packages/client/src/render/fog-gl.ts` | 55 |
| `FogFlat` | Class | `gridlock/packages/client/src/render/fog-gl.ts` | 143 |
| `BuildingVeil` | Class | `gridlock/packages/client/src/render/building-fog.ts` | 95 |
| `MapView` | Class | `gridlock/packages/client/src/render/mapview.ts` | 782 |
| `SoundTracker` | Class | `gridlock/packages/client/src/render/sound-events.ts` | 128 |
| `FogField` | Class | `gridlock/packages/client/src/render/fog-field.ts` | 78 |
| `lerpAirAlt` | Function | `gridlock/packages/client/src/render/aircraft.ts` | 14 |
| `airLiftPx` | Function | `gridlock/packages/client/src/render/aircraft.ts` | 23 |
| `inAir` | Function | `gridlock/packages/client/src/render/aircraft.ts` | 27 |
| `aircraftShadowScale` | Function | `gridlock/packages/client/src/render/aircraft.ts` | 35 |
| `drawFallingBomb` | Function | `gridlock/packages/client/src/render/aircraft.ts` | 41 |
| `drawCanopy` | Function | `gridlock/packages/client/src/render/airdrop-fx.ts` | 13 |
| `canopySway` | Function | `gridlock/packages/client/src/render/airdrop-fx.ts` | 65 |
| `mineLamp` | Function | `gridlock/packages/client/src/render/airdrop-fx.ts` | 77 |
| `drawMine` | Function | `gridlock/packages/client/src/render/airdrop-fx.ts` | 90 |
| `drawCrate` | Function | `gridlock/packages/client/src/render/airdrop-fx.ts` | 130 |
| `troopCanopySpan` | Function | `gridlock/packages/client/src/render/airdrop-fx.ts` | 185 |
| `ammoBarRatios` | Function | `gridlock/packages/client/src/render/ammo-bars.ts` | 52 |
| `outOfAmmo` | Function | `gridlock/packages/client/src/render/ammo-bars.ts` | 109 |
| `barrageTracers` | Function | `gridlock/packages/client/src/render/barrage-tracer.ts` | 36 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `DrawSpritedUnit → Find` | cross_community | 8 |
| `DrawSpritedUnit → Map` | intra_community | 7 |
| `DrawSpritedUnit → TurnAt` | cross_community | 7 |
| `OnRight → Map` | cross_community | 7 |
| `DrawBuildingGround → Map` | intra_community | 7 |
| `IsoDraw → PackScrap` | cross_community | 6 |
| `IsoDraw → TileStampBounds` | cross_community | 6 |
| `HitAt → Map` | intra_community | 6 |
| `HitAt → TurnAt` | cross_community | 6 |
| `HitAt → Find` | cross_community | 6 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Ui | 21 calls |

## How to Explore

1. `context({name: "lerpAirAlt"})` — see callers and callees
2. `query({search_query: "render"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
