import type { MapDef } from "@gridlock/shared";
import { compileProgram, dataTexture, freeVao, glContext, meshVao, noiseTexture, type MeshVao } from "./gl.js";
import { heightMesh, heightsKey } from "./height-mesh.js";
import { DIRT_TEX, GRASS_TEXS, ROCK_TEX, SAND_TEX, STONES_TEX, SWAMP_TEX, TALL_GRASS_TEX } from "./sprites.js";
import { materialBytes, vertexTones } from "./terrain-light.js";

const VS = `#version 300 es
in vec2 aPos;
in vec2 aUv;
in float aTone;
uniform vec2 uAtlasOrigin;
uniform vec2 uChunk;
uniform vec2 uSize;
out vec2 vUv;
out vec2 vPx;
out float vTone;
void main() {
  vec2 px = aPos - uAtlasOrigin;
  vPx = px;
  vUv = aUv;
  vTone = aTone;
  vec2 c = px - uChunk;
  gl_Position = vec4(c.x / uSize.x * 2.0 - 1.0, 1.0 - c.y / uSize.y * 2.0, 0.0, 1.0);
}`;

/**
 * Ground surface. Every texture is read at one texel per atlas pixel, so its
 * grain is at screen scale, and then broken up three ways so a field of any
 * size never shows the repeat:
 *
 * 1. A second read of the same texture at a third of the scale, rotated, is
 *    folded in. The two periods do not line up, so the visible period is the
 *    product of both.
 * 2. Slow noise in tile space shifts the brightness and warms or cools the
 *    hue over 10-30 tile patches: drier knolls, damper hollows.
 * 3. The sample point is jittered by noise, so straight texture rows bend.
 *
 * Material weights come per tile from two textures (A: dirt, dry, damp, rock;
 * B: tree floor, water, blocked, scrap yard; C: sand, tall grass, stones,
 * swamp) and are bilinearly read with a noisy offset, so one cover grades into
 * the next over a ragged band instead of a tile edge.
 */
const FS = `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vPx;
in float vTone;
uniform sampler2D uMatA;
uniform sampler2D uMatB;
uniform sampler2D uMatC;
uniform sampler2D uNoise;
uniform sampler2D uG0;
uniform sampler2D uG1;
uniform sampler2D uG2;
uniform sampler2D uDirt;
uniform sampler2D uRock;
uniform sampler2D uSand;
uniform sampler2D uTall;
uniform sampler2D uStones;
uniform sampler2D uSwamp;
uniform vec2 uMapSize;
out vec4 o;

vec3 rgb(float r, float g, float b) { return vec3(r, g, b) / 255.0; }

const mat2 ROT = mat2(0.866, 0.5, -0.5, 0.866);

// Fine read plus a rotated, slower read of the same sheet: no shared period.
vec3 tex(sampler2D s, vec2 px, vec2 jitter) {
  vec2 size = vec2(textureSize(s, 0));
  vec3 fine = texture(s, (px + jitter) / size).rgb;
  vec3 slow = texture(s, (ROT * px) * 0.37 / size + vec2(0.31, 0.77)).rgb;
  // Mostly the fine grain; the slow read moves the local tone and hides the period.
  return mix(fine, slow, 0.34);
}

// Push a blend weight around by noise, but only inside the transition band.
float edge(float w, float n) {
  return clamp(w + (n - 0.5) * 2.4 * w * (1.0 - w), 0.0, 1.0);
}

void main() {
  float n1 = texture(uNoise, vUv / 9.0).r;
  float n2 = texture(uNoise, vUv / 9.0 + vec2(0.37, 0.61)).r;
  float nf = texture(uNoise, vUv / 2.5).r;
  float nb = texture(uNoise, vUv / 23.0 + vec2(0.13, 0.42)).r;
  float nh = texture(uNoise, vUv / 15.0 + vec2(0.71, 0.09)).r;
  vec2 tuv = (vUv + (vec2(n1, n2) - 0.5) * 1.2) / uMapSize;
  vec4 a = texture(uMatA, tuv);
  vec4 b = texture(uMatB, tuv);
  vec4 c = texture(uMatC, tuv);
  float dirt = edge(a.r, nf);
  float dry = edge(a.g, nf);
  float damp = edge(a.b, nf);
  float rock = edge(a.a, nf);
  float tree = b.r;
  float water = b.g;
  float blocked = b.b;
  float sand = edge(c.r, nf);
  float tall = edge(c.g, nf);
  float stones = edge(c.b, nf);
  float swamp = edge(c.a, nf);

  // The grass grain bends a little with the slow noise so rows never line up.
  vec2 jitter = (vec2(n2, n1) - 0.5) * 6.0;

  vec3 meadow = mix(mix(tex(uG0, vPx, jitter), tex(uG1, vPx, jitter), dry), tex(uG2, vPx, jitter), damp);
  // Macro breakup: brightness and a warm/cool drift across 15-25 tile patches.
  float macro = 0.86 + 0.28 * nb;
  vec3 tint = mix(vec3(0.96, 1.0, 0.92), vec3(1.05, 1.0, 0.9), nh);
  meadow = meadow * macro * tint;
  vec3 floorCol = mix(rgb(44.0, 56.0, 34.0), rgb(30.0, 42.0, 26.0), tree);
  vec3 col = mix(floorCol, meadow, 0.86);
  // Under the trees the floor is dark, trodden, and littered.
  col = mix(col, mix(col, tex(uDirt, vPx, jitter) * 0.75, 0.35) * 0.82, tree);

  // Painted cover. Tall grass first so the grass channels still shape it.
  vec3 tallCol = tex(uTall, vPx, jitter) * macro * tint;
  col = mix(col, tallCol, tall);
  vec3 sandCol = tex(uSand, vPx, jitter * 0.4) * (0.9 + 0.2 * nb);
  col = mix(col, sandCol, sand);
  vec3 stoneCol = tex(uStones, vPx, jitter * 0.2) * (0.92 + 0.16 * nb);
  col = mix(col, stoneCol, stones);
  vec3 swampCol = tex(uSwamp, vPx, jitter * 0.3) * (0.9 + 0.2 * nh);
  col = mix(col, swampCol, swamp);

  vec3 bare = mix(rgb(74.0, 60.0, 44.0), tex(uDirt, vPx, jitter * 0.5), 0.92) * (0.9 + 0.2 * nb);
  col = mix(col, bare, dirt);
  float grain = texture(uNoise, vUv / 1.3).r;
  vec3 noiseStone = mix(rgb(78.0, 73.0, 66.0), rgb(122.0, 114.0, 100.0), clamp(nf * 0.7 + grain * 0.5, 0.0, 1.0));
  vec3 stone = mix(noiseStone, tex(uRock, vPx, vec2(0.0)), 0.85);
  col = mix(col, stone, rock);
  col = mix(col, rgb(58.0, 50.0, 40.0), blocked);

  // Scrap yard: churned earth, dark with oil, rust bleeding into it. The cover
  // is already blurred, so the rim is a curve; broad noise bends it, fine noise roughens it.
  float yard = smoothstep(0.34, 0.58, b.a + (n1 - 0.5) * 0.4 + (nf - 0.5) * 0.12);
  vec3 churned = mix(rgb(70.0, 58.0, 45.0), tex(uDirt, vPx, jitter * 0.5) * 0.78, 0.55);
  vec3 stained = mix(churned, rgb(38.0, 33.0, 29.0), clamp((n1 - 0.45) * 2.2, 0.0, 0.55));
  stained = mix(stained, rgb(104.0, 64.0, 38.0), clamp((grain - 0.62) * 2.5, 0.0, 0.35));
  col = mix(col, stained, yard * (1.0 - water));

  float t = vTone;
  if (t < 1.0) col = mix(col, rgb(10.0, 12.0, 8.0), min(0.55, (1.0 - t) * 0.9));
  else col = mix(col, rgb(250.0, 232.0, 170.0), min(0.4, (t - 1.0) * 0.75));

  float land = clamp(1.0 - water, 0.0, 1.0);
  o = vec4(col * land, land);
}`;

type State = {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  prog: WebGLProgram;
  loc: Record<string, WebGLUniformLocation | null>;
  noise: WebGLTexture | null;
  images: Map<HTMLImageElement, { tex: WebGLTexture; ready: boolean }>;
  matA: WebGLTexture | null;
  matB: WebGLTexture | null;
  matC: WebGLTexture | null;
  mesh: MeshVao | null;
  meshKey: string;
  maxSide: number;
};

let state: State | null | undefined;

const UNIFORMS = [
  "uAtlasOrigin",
  "uChunk",
  "uSize",
  "uMatA",
  "uMatB",
  "uMatC",
  "uNoise",
  "uG0",
  "uG1",
  "uG2",
  "uDirt",
  "uRock",
  "uSand",
  "uTall",
  "uStones",
  "uSwamp",
  "uMapSize",
];

function init(): State | null {
  if (state !== undefined) return state;
  state = null;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  const gl = glContext(canvas);
  if (!gl) return null;
  const prog = compileProgram(gl, VS, FS);
  if (!prog) return null;
  const dims = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
  const maxRb = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number;
  state = {
    canvas,
    gl,
    prog,
    loc: Object.fromEntries(UNIFORMS.map((n) => [n, gl.getUniformLocation(prog, n)])),
    noise: noiseTexture(gl),
    images: new Map(),
    matA: null,
    matB: null,
    matC: null,
    mesh: null,
    meshKey: "",
    maxSide: Math.max(256, Math.min(4096, dims[0] ?? 4096, dims[1] ?? 4096, maxRb)),
  };
  return state;
}

/** True when the smooth GL ground can draw; otherwise the per-tile 2D ground stays. */
export function groundGlReady(): boolean {
  return init() != null;
}

function imageTexture(s: State, img: HTMLImageElement, fallback: [number, number, number]): WebGLTexture | null {
  const ready = img.complete && img.naturalWidth > 0;
  const hit = s.images.get(img);
  if (hit && hit.ready === ready) return hit.tex;
  const gl = s.gl;
  const tex = hit?.tex ?? gl.createTexture();
  if (!tex) return null;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  if (ready) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([...fallback, 255]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  // The slow rotated read lands between texels; linear keeps it from sparkling.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  s.images.set(img, { tex, ready });
  return tex;
}

function ensureMesh(s: State, map: MapDef): void {
  const key = `${map.id}:${map.width}x${map.height}:${heightsKey(map.heights)}`;
  if (s.meshKey === key && s.mesh) return;
  freeVao(s.gl, s.mesh);
  s.mesh = meshVao(s.gl, s.prog, heightMesh(map), vertexTones(map));
  s.meshKey = key;
}

export type AtlasRect = { x: number; y: number; w: number; h: number };

/**
 * Paint the land surface (meadow, painted cover, dirt, rock, blended across
 * tile edges, with smooth hill light) into `ctx` over `rect` of the atlas.
 * Water stays clear.
 */
export function paintGlGround(
  ctx: CanvasRenderingContext2D,
  map: MapDef,
  scrap: ReadonlySet<number>,
  originX: number,
  originY: number,
  rect: AtlasRect,
  clip?: Path2D,
): boolean {
  const s = init();
  if (!s) return false;
  const gl = s.gl;
  ensureMesh(s, map);
  if (!s.mesh) return false;
  const mats = materialBytes(map, scrap);
  s.matA = dataTexture(gl, s.matA, map.width, map.height, mats.a, 4);
  s.matB = dataTexture(gl, s.matB, map.width, map.height, mats.b, 4);
  s.matC = dataTexture(gl, s.matC, map.width, map.height, mats.c, 4);
  const g0 = imageTexture(s, GRASS_TEXS[0]!, [59, 71, 44]);
  const g1 = imageTexture(s, GRASS_TEXS[1] ?? GRASS_TEXS[0]!, [87, 84, 53]);
  const g2 = imageTexture(s, GRASS_TEXS[2] ?? GRASS_TEXS[0]!, [42, 58, 37]);
  const dirt = imageTexture(s, DIRT_TEX, [74, 60, 44]);
  const rock = imageTexture(s, ROCK_TEX, [100, 94, 84]);
  const sand = imageTexture(s, SAND_TEX, [120, 105, 79]);
  const tall = imageTexture(s, TALL_GRASS_TEX, [64, 74, 43]);
  const stones = imageTexture(s, STONES_TEX, [64, 54, 42]);
  const swamp = imageTexture(s, SWAMP_TEX, [42, 54, 42]);

  gl.useProgram(s.prog);
  gl.disable(gl.BLEND);
  const bind = (unit: number, tex: WebGLTexture | null, name: string): void => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(s.loc[name]!, unit);
  };
  bind(0, s.matA, "uMatA");
  bind(1, s.matB, "uMatB");
  bind(2, s.noise, "uNoise");
  bind(3, g0, "uG0");
  bind(4, g1, "uG1");
  bind(5, g2, "uG2");
  bind(6, dirt, "uDirt");
  bind(7, rock, "uRock");
  bind(8, s.matC, "uMatC");
  bind(9, sand, "uSand");
  bind(10, tall, "uTall");
  bind(11, stones, "uStones");
  bind(12, swamp, "uSwamp");
  gl.uniform2f(s.loc.uAtlasOrigin!, originX, originY);
  gl.uniform2f(s.loc.uMapSize!, map.width, map.height);

  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(ctx.canvas.width, Math.ceil(rect.x + rect.w));
  const y1 = Math.min(ctx.canvas.height, Math.ceil(rect.y + rect.h));
  const side = s.maxSide;
  ctx.save();
  if (clip) ctx.clip(clip);
  for (let cy = y0; cy < y1; cy += side) {
    for (let cx = x0; cx < x1; cx += side) {
      const cw = Math.min(side, x1 - cx);
      const ch = Math.min(side, y1 - cy);
      if (s.canvas.width !== cw || s.canvas.height !== ch) {
        s.canvas.width = cw;
        s.canvas.height = ch;
      }
      gl.viewport(0, 0, cw, ch);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(s.loc.uChunk!, cx, cy);
      gl.uniform2f(s.loc.uSize!, cw, ch);
      gl.bindVertexArray(s.mesh.vao);
      gl.drawElements(gl.TRIANGLES, s.mesh.count, gl.UNSIGNED_INT, 0);
      gl.bindVertexArray(null);
      ctx.drawImage(s.canvas, 0, 0, cw, ch, cx, cy, cw, ch);
    }
  }
  ctx.restore();
  return true;
}
