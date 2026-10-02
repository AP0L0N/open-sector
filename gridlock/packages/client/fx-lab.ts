// Scratch FX lab. Not shipped.
import * as fx from "./src/render/fx";
import { CRATER_FACES, drawPropSprite } from "./src/render/sprites";
import dirtUrl from "./src/assets/terrain/ground-dirt.png";
import grassUrl from "./src/assets/terrain/grass-dry.png";
const q = new URLSearchParams(location.search);
const Z = Number(q.get("zoom") ?? 2);
const TS = (q.get("t") ?? "0.02,0.06,0.12,0.2,0.32,0.5,0.7,0.9").split(",").map(Number);
type Row = { name: string; draw: (c: CanvasRenderingContext2D, x: number, y: number, t: number, seed: number) => void };
const g = fx as any;
import * as ex from "./src/render/explosion";
const W = (src: ex.BurstSource) => (c: CanvasRenderingContext2D, x: number, y: number, t: number, sd: number) => {
  const spec = ex.burstSpec(src);
  ex.drawExplosion(c, x, y, t * ex.burstLifeMs(spec), sd, spec, 0.9, 0.45);
};
const rows: Row[] = [
  { name: "75 AP", draw: W({ caliber: 75, damage: 55, shell: "ap" }) },
  { name: "75 HE", draw: W({ caliber: 75, damage: 90, shell: "he" }) },
  { name: "105 HE apoc", draw: W({ caliber: 105, damage: 95, shell: "he" }) },
  { name: "mortar", draw: W({ caliber: 60, damage: 56, mortar: true }) },
  { name: "titan", draw: W({ caliber: 80, damage: 42, rocket: true }) },
  { name: "nebel", draw: W({ caliber: 150, damage: 30, rocket: true }) },
  { name: "artillery", draw: W({ caliber: 105, damage: 150, mortar: true, bomb: true }) },
  { name: "bomb", draw: W({ caliber: 250, damage: 70, mortar: true, bomb: true }) },
];
const CW = Number(q.get("cw") ?? 150), RH = Number(q.get("rh") ?? 130);
const cv = document.getElementById("c") as HTMLCanvasElement;
const crRow = 1;
cv.width = (CW * TS.length + 60) * Z; cv.height = (RH * (rows.length + crRow)) * Z;
const ctx = cv.getContext("2d")!;
function img(u: string) { return new Promise<HTMLImageElement>((r) => { const i = new Image(); i.onload = () => r(i); i.src = u; }); }
(async () => {
  const [dirt, grass] = await Promise.all([img(dirtUrl), img(grassUrl)]);
  await new Promise((r) => setTimeout(r, 400));
  ctx.setTransform(Z, 0, 0, Z, 0, 0);
  const pd = ctx.createPattern(dirt, "repeat")!; const pg = ctx.createPattern(grass, "repeat")!;
  ctx.fillStyle = pd; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = pg; ctx.fillRect(0, RH * rows.length, cv.width, RH);
  rows.forEach((r, i) => {
    ctx.fillStyle = "#fff"; ctx.font = "10px monospace"; ctx.fillText(r.name, 2, RH * i + 12);
    TS.forEach((t, j) => { r.draw(ctx, 60 + CW * j + CW / 2, RH * i + RH * 0.72, t, 1234 + i * 7); });
  });
  const radii = [7.5, 11.2, 14, 19.6, 28, 46.7];
  radii.forEach((wr, j) => {
    const face = CRATER_FACES[j % CRATER_FACES.length]!;
    const rx = wr * 1.118;
    const x = 60 + CW * j + CW / 2, y = RH * rows.length + RH * 0.5;
    if (g.drawCraterLab) g.drawCraterLab(ctx, x, y, rx, j);
    else drawPropSprite(ctx, face, x, y, (face.image.naturalHeight * rx * 2.05) / face.bowl, false);
    ctx.fillStyle = "#fff"; ctx.fillText(String(wr), x - 8, RH * rows.length + 12);
  });
  (window as any).LAB_DONE = true;
})();
