import { ISO_TILE_H, ISO_TILE_W, type MapDef } from "@gridlock/shared";
import { FOG_RGB, FOG_VEIL_ALPHA, fieldBytes, type FogField } from "./fog-field.js";
import { compileProgram, dataTexture, freeVao, glContext, meshVao, noiseTexture, type MeshVao } from "./gl.js";
import { heightMesh, heightsKey } from "./height-mesh.js";

const VS = `#version 300 es
in vec2 aPos;
in vec2 aUv;
uniform vec2 uCam;
uniform float uScale;
uniform vec2 uSize;
out vec2 vUv;
void main() {
  vec2 px = (aPos - uCam) * uScale;
  vUv = aUv;
  gl_Position = vec4(px.x / uSize.x * 2.0 - 1.0, 1.0 - px.y / uSize.y * 2.0, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uPrev;
uniform sampler2D uNext;
uniform sampler2D uNoise;
uniform float uMix;
uniform vec2 uMapSize;
uniform float uTime;
uniform float uAlpha;
uniform vec3 uColor;
out vec4 o;
void main() {
  float n1 = texture(uNoise, vUv / 7.0).r;
  float n2 = texture(uNoise, vUv / 7.0 + vec2(0.5, 0.25)).r;
  vec2 tuv = (vUv + (vec2(n1, n2) - 0.5) * 1.6) / uMapSize;
  float s = mix(texture(uPrev, tuv).r, texture(uNext, tuv).r, uMix);
  float d = 0.82 + 0.36 * texture(uNoise, vUv / 13.0 + uTime * vec2(0.004, 0.0025)).r;
  float a = clamp(uAlpha * (1.0 - s) * d, 0.0, 1.0);
  o = vec4(uColor * a, a);
}`;

export type FogView = {
  camX: number;
  camY: number;
  /** Device pixels per iso pixel (dpr * zoom). */
  scale: number;
  /** Device pixel size of the target canvas. */
  width: number;
  height: number;
  now: number;
  /** Veil alpha and colour; the day veil when missing. */
  alpha?: number;
  rgb?: readonly [number, number, number];
};

/** Ground veil laid on the lifted height mesh, so it follows the hills. */
export class FogGl {
  readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly prog: WebGLProgram;
  private readonly noise: WebGLTexture | null;
  private prevTex: WebGLTexture | null = null;
  private nextTex: WebGLTexture | null = null;
  private mesh: MeshVao | null = null;
  private mapKey = "";
  private mapW = 1;
  private mapH = 1;
  private uploaded = -1;
  private readonly loc: Record<string, WebGLUniformLocation | null>;

  static create(): FogGl | null {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    const gl = glContext(canvas);
    if (!gl) return null;
    const prog = compileProgram(gl, VS, FS);
    if (!prog) return null;
    return new FogGl(canvas, gl, prog);
  }

  private constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext, prog: WebGLProgram) {
    this.canvas = canvas;
    this.gl = gl;
    this.prog = prog;
    this.noise = noiseTexture(gl);
    const names = ["uCam", "uScale", "uSize", "uPrev", "uNext", "uNoise", "uMix", "uMapSize", "uTime", "uAlpha", "uColor"];
    this.loc = Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(prog, n)]));
  }

  setMap(map: MapDef): void {
    const key = `${map.id}:${map.width}x${map.height}:${heightsKey(map.heights)}`;
    if (key === this.mapKey) return;
    freeVao(this.gl, this.mesh);
    this.mesh = meshVao(this.gl, this.prog, heightMesh(map));
    this.mapKey = key;
    this.mapW = map.width;
    this.mapH = map.height;
    this.uploaded = -1;
  }

  render(field: FogField, view: FogView): void {
    const gl = this.gl;
    if (this.canvas.width !== view.width || this.canvas.height !== view.height) {
      this.canvas.width = view.width;
      this.canvas.height = view.height;
    }
    gl.viewport(0, 0, view.width, view.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.mesh || field.w !== this.mapW || field.h !== this.mapH) return;
    if (this.uploaded !== field.version) {
      this.prevTex = dataTexture(gl, this.prevTex, field.w, field.h, fieldBytes(field.prev), 1);
      this.nextTex = dataTexture(gl, this.nextTex, field.w, field.h, fieldBytes(field.next), 1);
      this.uploaded = field.version;
    }
    gl.useProgram(this.prog);
    gl.disable(gl.BLEND);
    const bind = (unit: number, tex: WebGLTexture | null, name: string): void => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(this.loc[name]!, unit);
    };
    bind(0, this.prevTex, "uPrev");
    bind(1, this.nextTex, "uNext");
    bind(2, this.noise, "uNoise");
    gl.uniform2f(this.loc.uCam!, view.camX, view.camY);
    gl.uniform1f(this.loc.uScale!, view.scale);
    gl.uniform2f(this.loc.uSize!, view.width, view.height);
    gl.uniform1f(this.loc.uMix!, field.mix(view.now));
    gl.uniform2f(this.loc.uMapSize!, field.w, field.h);
    gl.uniform1f(this.loc.uTime!, (view.now / 1000) % 10000);
    const rgb = view.rgb ?? FOG_RGB;
    gl.uniform1f(this.loc.uAlpha!, view.alpha ?? FOG_VEIL_ALPHA);
    gl.uniform3f(this.loc.uColor!, rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
    gl.bindVertexArray(this.mesh.vao);
    gl.drawElements(gl.TRIANGLES, this.mesh.count, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
  }
}

/**
 * No-WebGL fallback: the field as one smoothed image laid flat on the iso
 * plane. It ignores hill lift, but it has no grid.
 */
export class FogFlat {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private data: ImageData | null = null;
  private drawn = -1;
  private drawnMix = -1;
  private drawnLook = "";

  constructor() {
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d");
  }

  draw(
    ctx: CanvasRenderingContext2D,
    field: FogField,
    camX: number,
    camY: number,
    now: number,
    look: { alpha: number; rgb: readonly [number, number, number] } = { alpha: FOG_VEIL_ALPHA, rgb: FOG_RGB },
  ): void {
    const g = this.ctx;
    if (!g) return;
    if (this.canvas.width !== field.w || this.canvas.height !== field.h || !this.data) {
      this.canvas.width = field.w;
      this.canvas.height = field.h;
      this.data = g.createImageData(field.w, field.h);
      this.drawn = -1;
    }
    const t = field.mix(now);
    const lookKey = `${look.alpha.toFixed(3)}:${look.rgb.map((v) => Math.round(v)).join(",")}`;
    if (this.drawn !== field.version || Math.abs(this.drawnMix - t) > 0.02 || this.drawnLook !== lookKey) {
      this.drawnLook = lookKey;
      const pix = this.data.data;
      for (let i = 0; i < field.prev.length; i++) {
        const s = field.prev[i]! + (field.next[i]! - field.prev[i]!) * t;
        const o = i * 4;
        pix[o] = look.rgb[0];
        pix[o + 1] = look.rgb[1];
        pix[o + 2] = look.rgb[2];
        pix[o + 3] = Math.round(look.alpha * (1 - s) * 255);
      }
      g.putImageData(this.data, 0, 0);
      this.drawn = field.version;
      this.drawnMix = t;
    }
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.translate(-camX, -camY);
    ctx.transform(ISO_TILE_W / 2, ISO_TILE_H / 2, -ISO_TILE_W / 2, ISO_TILE_H / 2, 0, 0);
    ctx.drawImage(this.canvas, 0, 0);
    ctx.restore();
  }
}
