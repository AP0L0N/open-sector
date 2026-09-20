# StuG III turntable drop folder

Casemate assault gun — the gun does not rotate independently, so every facing lives here (no `hull/` / `turret/` split).

Overwrite these PNGs and reload the game. Vite picks up the files; the client maps names to facings.

- `0001.png` … `0016.png`

`0001.png` faces world south (screen down). Each next file is clockwise 22.5°. `0016.png` is the last unique yaw. A 17th file would equal `0001`; do not ship it.

Vehicle spec: `stug-iii-ausf-g-late-saukopf.md`. Mapping lives in `src/render/turntable.ts`.
