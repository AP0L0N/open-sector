---
name: ui
description: "Skill for the Ui area of open-sector. 459 symbols across 43 files."
---

# Ui

459 symbols | 43 files | Cohesion: 78%

## When to Use

- Working with code in `gridlock/`
- Understanding how forgetDecor, heightsChanged, forgetTerrain work
- Modifying ui-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `gridlock/packages/client/src/ui/builder.ts` | store, myMaps, claimMap, say, undoDepth (+130) |
| `gridlock/packages/client/src/ui/builder-model.ts` | newSheet, sheetFromSpec, scatterSheetClutter, unitIndexAt, garrisonHostAt (+69) |
| `gridlock/packages/client/src/ui/hud.ts` | appendRocketRack, loadoutButton, buildConfigBody, garrisonSeatNode, renderLeaveModal (+52) |
| `gridlock/packages/client/src/ui/builder-iso.ts` | isoChanged, isoHoldBake, isoCommit, drawBeam, drawMapUnit (+35) |
| `gridlock/packages/client/src/ui/pause.ts` | battleModalKey, renderPauseModal, renderMenuLoad, beginLoad, inPlaytest (+14) |
| `gridlock/packages/client/src/ui/audio.ts` | sampleBus, sample, preloadSample, playSample, release (+13) |
| `gridlock/packages/client/src/ui/game-audio.ts` | unitFolder, pick, hasUnitAudio, unitVoice, unitTalking (+12) |
| `gridlock/packages/client/src/ui/saves.ts` | getItem, suggestSaveName, readSaveSlots, dropSaveSlot, setItem (+4) |
| `gridlock/packages/client/src/ui/music.ts` | level, fade, nextUrl, stopCurrent, playNext (+3) |
| `gridlock/packages/client/src/main.ts` | takeCustomMap, syncBattleModal, enterSkirmish, holdSkirmish, resumeSkirmish (+2) |

## Entry Points

Start here when exploring this area:

- **`forgetDecor`** (Function) — `gridlock/packages/client/src/render/decor.ts:341`
- **`heightsChanged`** (Function) — `gridlock/packages/client/src/render/height-mesh.ts:28`
- **`forgetTerrain`** (Function) — `gridlock/packages/client/src/render/terrain.ts:1373`
- **`isoZoomAt`** (Function) — `gridlock/packages/client/src/ui/builder-iso-cam.ts:23`
- **`isoChanged`** (Function) — `gridlock/packages/client/src/ui/builder-iso.ts:254`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `forgetDecor` | Function | `gridlock/packages/client/src/render/decor.ts` | 341 |
| `heightsChanged` | Function | `gridlock/packages/client/src/render/height-mesh.ts` | 28 |
| `forgetTerrain` | Function | `gridlock/packages/client/src/render/terrain.ts` | 1373 |
| `isoZoomAt` | Function | `gridlock/packages/client/src/ui/builder-iso-cam.ts` | 23 |
| `isoChanged` | Function | `gridlock/packages/client/src/ui/builder-iso.ts` | 254 |
| `isoHoldBake` | Function | `gridlock/packages/client/src/ui/builder-iso.ts` | 259 |
| `isoCommit` | Function | `gridlock/packages/client/src/ui/builder-iso.ts` | 264 |
| `newSheet` | Function | `gridlock/packages/client/src/ui/builder-model.ts` | 99 |
| `sheetFromSpec` | Function | `gridlock/packages/client/src/ui/builder-model.ts` | 131 |
| `scatterSheetClutter` | Function | `gridlock/packages/client/src/ui/builder-model.ts` | 271 |
| `unitIndexAt` | Function | `gridlock/packages/client/src/ui/builder-model.ts` | 292 |
| `garrisonHostAt` | Function | `gridlock/packages/client/src/ui/builder-model.ts` | 313 |
| `unitsInside` | Function | `gridlock/packages/client/src/ui/builder-model.ts` | 331 |
| `unloadGarrison` | Function | `gridlock/packages/client/src/ui/builder-model.ts` | 364 |
| `degreesToward` | Function | `gridlock/packages/client/src/ui/builder-model.ts` | 441 |
| `settle` | Function | `gridlock/packages/client/src/ui/builder-model.ts` | 446 |
| `wrapTurn` | Function | `gridlock/packages/client/src/ui/builder-model.ts` | 645 |
| `turnsFine` | Function | `gridlock/packages/client/src/ui/builder-model.ts` | 651 |
| `houseAt` | Function | `gridlock/packages/client/src/ui/builder-model.ts` | 660 |
| `snap` | Function | `gridlock/packages/client/src/ui/builder-model.ts` | 664 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `IsoDraw → PackScrap` | cross_community | 6 |
| `IsoDraw → TileStampBounds` | cross_community | 6 |
| `IsoDraw → LiveMap` | cross_community | 5 |
| `IsoDraw → ScrapOf` | cross_community | 5 |
| `IsoDraw → AtlasSize` | cross_community | 5 |
| `IsoDraw → Kernel` | cross_community | 5 |
| `Run → BuildingGroundElev` | cross_community | 4 |
| `IsoDraw → WhenImagesReady` | cross_community | 4 |
| `IsoDraw → Remember` | cross_community | 4 |
| `IsoDraw → ForgetDecor` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Render | 45 calls |
| Net | 1 calls |

## How to Explore

1. `context({name: "forgetDecor"})` — see callers and callees
2. `query({search_query: "ui"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
