# StuG III turntable drop folder

Casemate assault gun — the gun does not traverse on its own, but it is a separate sheet so it can recoil.

Overwrite these PNGs and reload the game. Vite picks up the files; the client maps names to facings.

- `hull/0001.png` … `hull/0016.png`
- `gun/0001.png` … `gun/0016.png`

Hull and gun share one camera and canvas. Do not bake the barrel into the hull.

`0001.png` faces world south (screen down). Each next file is clockwise 22.5°. `0016.png` is the last unique yaw. A 17th file would equal `0001`; do not ship it.

Vehicle spec: `stug-iii-ausf-g-late-saukopf.md`. Mapping lives in `src/render/turntable.ts`.
