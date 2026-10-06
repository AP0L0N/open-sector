import type { MapDef } from "@gridlock/shared";
import { compileProgram, dataTexture, freeVao, glContext, meshVao, noiseTexture, type MeshVao } from "./gl.js";
import { heightMesh, heightsKey } from "./height-mesh.js";
import { DIRT_TEX, GRASS_TEXS, ROCK_TEX } from "./sprites.js";
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

const FS = `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vPx;
in float vTone;
uniform sampler2D uMatA;
uniform sampler2D uMatB;
uniform sampler2D uNoise;
uniform sampler2D uG0;
uniform sampler2D uG1;
uniform sampler2D uG2;
uniform sampler2D uDirt;
uniform sampler2D uRock;
uniform vec2 uMapSize;
out vec4 o;

vec3 rgb(float r, float g, float b) { return vec3(r, g, b) / 255.0; }

vec3 tex(sampler2D s) {
  return texture(s, vPx / vec2(textureSize(s, 0))).rgb;
}

// Push a blend weight around by noise, but only inside the transition band.
float edge(float w, float n) {
  return clamp(w + (n - 0.5) * 2.4 * w * (1.0 - w), 0.0, 1.0);
}

void main() {
  float n1 = texture(uNoise, vUv / 9.0).r;
  float n2 = texture(uNoise, vUv / 9.0 + vec2(0.37, 0.61)).r;
  float nf = texture(uNoise, vUv / 2.5).r;
  vec2 tuv = (vUv + (vec2(n1, n2) - 0.5) * 1.2) / uMapSize;
  vec4 a = texture(uMatA, tuv);
  vec4 b = texture(uMatB, tuv);
  float dirt = edge(a.r, nf);
  float dry = edge(a.g, nf);
  float damp = edge(a.b, nf);
  float rock = edge(a.a, nf);
  float tree = b.r;
  float water = b.g;
  float blocked = b.b;

  vec3 meadow = mix(mix(tex(uG0), tex(uG1), dry), tex(uG2), damp);
  vec3 floorCol = mix(rgb(62.0, 82.0, 50.0), rgb(49.0, 70.0, 40.0), tree);
  vec3 col = mix(floorCol, meadow, 0.84);
  vec3 bare = mix(rgb(107.0, 88.0, 64.0), tex(uDirt), 0.92);
  col = mix(col, bare, dirt);
  float grain = texture(uNoise, vUv / 1.3).r;
  vec3 noiseStone = mix(rgb(78.0, 73.0, 66.0), rgb(122.0, 114.0, 100.0), clamp(nf * 0.7 + grain * 0.5, 0.0, 1.0));
  vec3 stone = mix(noiseStone, tex(uRock), 0.85);
  col = mix(col, stone, rock);
  col = mix(col, rgb(58.0, 50.0, 40.0), blocked);

  // Scrap yard: churned earth, dark with oil, rust bleeding into it. The cover
  // is already blurred, so the rim is a curve; broad noise bends it, fine noise roughens it.
  float yard = smoothstep(0.34, 0.58, b.a + (n1 - 0.5) * 0.4 + (nf - 0.5) * 0.12);
  vec3 churned = mix(rgb(70.0, 58.0, 45.0), tex(uDirt) * 0.78, 0.55);
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
  mesh: MeshVao | null;
  meshKey: string;
  maxSide: number;
};

let state: State | null | undefined;

function init(): State | null {
  if (state !== undefined) return state;
  state = null;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  const gl = glContext(canvas);
  if (!gl) return null;
  const prog = compileProgram(gl, VS, FS);
  if (!prog) return null;
  const names = ["uAtlasOrigin", "uChunk", "uSize", "uMatA", "uMatB", "uNoise", "uG0", "uG1", "uG2", "uDirt", "uRock", "uMapSize"];
  const dims = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
  const maxRb = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number;
  state = {
    canvas,
    gl,
    prog,
    loc: Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(prog, n)])),
    noise: noiseTexture(gl),
    images: new Map(),
    matA: null,
    matB: null,
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
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
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
 * Paint the land surface (meadow, dirt, rock, blended across tile edges, with
 * smooth hill light) into `ctx` over `rect` of the atlas. Water stays clear.
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
  const g0 = imageTexture(s, GRASS_TEXS[0]!, [62, 82, 50]);
  const g1 = imageTexture(s, GRASS_TEXS[1] ?? GRASS_TEXS[0]!, [62, 82, 50]);
  const g2 = imageTexture(s, GRASS_TEXS[2] ?? GRASS_TEXS[0]!, [62, 82, 50]);
  const dirt = imageTexture(s, DIRT_TEX, [107, 88, 64]);
  const rock = imageTexture(s, ROCK_TEX, [100, 94, 84]);

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
