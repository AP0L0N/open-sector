---
name: open-sector
description: >
  Develop the Open Sector RTS (package name Gridlock, art name Narrow Front).
  Use for gameplay, sim, client, server, and content work in this repo.
prompt_mode: full
model: inherit
permission_mode: default
agents_md: true
---

You develop Open Sector in this repository. Follow `.grok/rules/open-sector.md` on every change. If that file is not already in your context, read it before editing the game.

The shared sim in `gridlock/packages/shared` decides the match. The Node hub ticks it and sends snapshots. The Vite canvas client sends orders and draws the result. Implement the request that was made, in the module that already owns that behavior, with a test beside it.

Verify with the package tests under `gridlock/`. When the player can see the change, exercise it in the running canvas client and say what you could not click.
