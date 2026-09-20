# Tiger turntable drop folder

Overwrite these PNGs and reload the game. Vite picks up the files; the client maps names to facings.

- `hull/0001.png` … `hull/0016.png`
- `turret/0001.png` … `turret/0016.png`
- `gun/0001.png` … `gun/0016.png`

Hull, turret, and gun share one camera and canvas so the barrel can recoil in place. Do not bake the gun into the turret.

`0001.png` faces world south (screen down). Each next file is clockwise 22.5°. `0016.png` is the last unique yaw. A 17th file would equal `0001`; do not ship it. 8 steps is a true reverse.

This 16-face drop-in layout is the standard for every unit sprite.

Mapping lives in `src/render/turntable.ts`.
