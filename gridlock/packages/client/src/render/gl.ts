import { noiseBytes, type HeightMesh } from "./height-mesh.js";

export function compileProgram(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram | null {
  const make = (type: number, src: string): WebGLShader | null => {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn("[gl] shader", gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  };
  const v = make(gl.VERTEX_SHADER, vs);
  const f = make(gl.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, v);
  gl.attachShader(prog, f);
  gl.linkProgram(prog);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn("[gl] link", gl.getProgramInfoLog(prog));
    return null;
  }
  return prog;
}

export function glContext(canvas: HTMLCanvasElement): WebGL2RenderingContext | null {
  try {
    return canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: true,
    });
  } catch {
    return null;
  }
}

export function dataTexture(
  gl: WebGL2RenderingContext,
  tex: WebGLTexture | null,
  w: number,
  h: number,
  data: Uint8Array,
  channels: 1 | 4,
  wrap: "clamp" | "repeat" = "clamp",
): WebGLTexture | null {
  const t = tex ?? gl.createTexture();
  if (!t) return null;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  const fmt = channels === 1 ? gl.RED : gl.RGBA;
  const ifmt = channels === 1 ? gl.R8 : gl.RGBA8;
  gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, gl.UNSIGNED_BYTE, data);
  const mode = wrap === "repeat" ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, mode);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, mode);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return t;
}

export const NOISE_SIZE = 64;

export function noiseTexture(gl: WebGL2RenderingContext): WebGLTexture | null {
  return dataTexture(gl, null, NOISE_SIZE, NOISE_SIZE, noiseBytes(NOISE_SIZE), 1, "repeat");
}

export type MeshVao = { vao: WebGLVertexArrayObject; count: number; buffers: WebGLBuffer[] };

/** Binds `aPos` and `aUv` (and optional `aTone`) of `prog` to the mesh. */
export function meshVao(
  gl: WebGL2RenderingContext,
  prog: WebGLProgram,
  mesh: HeightMesh,
  tone?: Float32Array,
): MeshVao | null {
  const vao = gl.createVertexArray();
  if (!vao) return null;
  gl.bindVertexArray(vao);
  const buffers: WebGLBuffer[] = [];
  const attr = (name: string, data: Float32Array, size: number): void => {
    const loc = gl.getAttribLocation(prog, name);
    if (loc < 0) return;
    const buf = gl.createBuffer();
    if (!buf) return;
    buffers.push(buf);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  };
  attr("aPos", mesh.pos, 2);
  attr("aUv", mesh.uv, 2);
  if (tone) attr("aTone", tone, 1);
  const ib = gl.createBuffer();
  if (ib) {
    buffers.push(ib);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.index, gl.STATIC_DRAW);
  }
  gl.bindVertexArray(null);
  return { vao, count: mesh.index.length, buffers };
}

export function freeVao(gl: WebGL2RenderingContext, m: MeshVao | null): void {
  if (!m) return;
  gl.deleteVertexArray(m.vao);
  for (const b of m.buffers) gl.deleteBuffer(b);
}
