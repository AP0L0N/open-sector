# Tiger turntable drop folder

Overwrite these PNGs and reload the game. Vite picks up the files; the client maps names to facings.

- `hull/0001.png` … `hull/0016.png`
- `turret/0001.png` … `turret/0016.png`

`0001.png` faces the camera (screen south). Each next file is clockwise 22.5°. `0017.png` is ignored (Blender loop duplicate of 0001).

Mapping lives in `src/render/turntable.ts`.
