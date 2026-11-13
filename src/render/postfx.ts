/**
 * WebGL2 light filter and region backgrounds.
 *
 * Each frame: the region background is drawn on the GPU at a third of the screen size, the finished 2D
 * frame (transparent where nothing is drawn) is uploaded, its bright parts are blurred into a glow, and a
 * final pass puts everything together: background lit by the glow and the spark, light dust, floor dots,
 * shock waves, a colour split on hits and a gentle colour grade.
 *
 * The 2D canvas stays the source of truth – if WebGL is missing or the context is lost, the game shows
 * the 2D canvas again, which then draws its own simpler background.
 */

export interface Wave {
  /** Centre in CSS pixels (top-left origin). */
  x: number;
  y: number;
  /** Current ring radius in CSS pixels. */
  radius: number;
  /** Displacement in CSS pixels at the ring. */
  strength: number;
}

export interface SceneParams {
  region: number;
  time: number;
  /** Player offset from the arena centre in [-1, 1] (parallax). */
  parX: number;
  parY: number;
  /** Arena in CSS pixels (top-left corner and world-to-CSS scale) – null hides the floor dots. */
  arena: { x: number; y: number; scale: number; w: number; h: number } | null;
  /** The spark's own light in CSS pixels – null when no spark is shown. */
  light: { x: number; y: number; radius: number; strength: number; color: [number, number, number] } | null;
}

export interface PostParams {
  bloom: number;
  aberration: number;
  tint: [number, number, number];
  waves: Wave[];
  /** Region background; without it the 2D frame is treated as opaque. */
  scene: SceneParams | null;
}

/** Light dust per region: colour, drift (CSS px/s), cell size, dot size, density, twinkle, sway. */
interface Dust {
  color: [number, number, number];
  vel: [number, number];
  cell: number;
  size: number;
  density: number;
  twinkle: number;
  sway: number;
}

const DUST: Dust[] = [
  // Nebelmeer: slow star dust drifting down
  { color: [0.62, 0.6, 1.0], vel: [0, 5], cell: 44, size: 1.5, density: 0.42, twinkle: 1, sway: 0 },
  // Glutwüste: embers rising and swaying
  { color: [1.0, 0.55, 0.22], vel: [0, -16], cell: 54, size: 1.6, density: 0.32, twinkle: 0.6, sway: 7 },
  // Tiefsee: small bubbles rising slowly
  { color: [0.45, 0.95, 0.95], vel: [0, -9], cell: 58, size: 1.7, density: 0.3, twinkle: 0.3, sway: 4 },
  // Polarlicht: still stars
  { color: [0.75, 1.0, 0.85], vel: [0, 1.5], cell: 40, size: 1.4, density: 0.45, twinkle: 1, sway: 0 },
  // Die Leere: few, faint stars
  { color: [0.85, 0.85, 0.95], vel: [0, 0.8], cell: 60, size: 1.3, density: 0.28, twinkle: 0.7, sway: 0 },
  // Kristallgrotte: glints that flash up
  { color: [1.0, 0.6, 0.95], vel: [0, 0], cell: 50, size: 1.8, density: 0.36, twinkle: 1, sway: 0 },
];

const MAX_WAVES = 6;
const FADE_TIME = 1.6;

const VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

/** Hash and noise helpers (no sin-based hashes – they break on mobile GPUs). */
const NOISE = `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
const mat2 ROT = mat2(1.6, 1.2, -1.2, 1.6);
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = ROT * p;
    a *= 0.5;
  }
  return s;
}
float fbm3(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    s += a * vnoise(p);
    p = ROT * p;
    a *= 0.5;
  }
  return s / 0.875;
}
// x: distance to the nearest cell point, y: to the second nearest, z: cell id.
vec3 voronoi(vec2 p) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  vec2 id = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 r = g + hash22(n + g) - f;
      float d = dot(r, r);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        id = n + g;
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  return vec3(sqrt(d1), sqrt(d2), hash12(id));
}`;

/** Region backgrounds. p: aspect-correct coordinates, y up, roughly [-0.5, 0.5] on the short side. */
const FS_BG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform vec2 uRes;
uniform float uTime;
uniform int uRegion;
uniform vec2 uPar;
${NOISE}

// Nebelmeer: slowly folding violet and blue clouds.
vec3 nebula(vec2 p, float t) {
  vec2 q = vec2(fbm(p * 1.6 + vec2(0.0, t * 0.015)), fbm(p * 1.6 + vec2(5.2, 1.3) - vec2(t * 0.012, 0.0)));
  float f = fbm(p * 1.8 + 2.2 * q);
  vec3 c = mix(vec3(0.035, 0.022, 0.09), vec3(0.2, 0.09, 0.38), smoothstep(0.35, 0.9, f));
  c = mix(c, vec3(0.06, 0.17, 0.32), smoothstep(0.45, 0.95, q.x) * 0.55);
  c += vec3(0.28, 0.07, 0.26) * pow(smoothstep(0.5, 1.0, f * q.y * 1.7), 2.0) * 0.55;
  return c;
}

// Glutwüste: dark rock with glowing cracks that breathe.
vec3 ember(vec2 p, float t) {
  float rock = fbm3(p * 2.4 + 11.0);
  vec3 c = mix(vec3(0.035, 0.014, 0.02), vec3(0.11, 0.04, 0.035), rock);
  vec3 v = voronoi(p * 3.2 + vec2(0.0, 0.0));
  float edge = v.y - v.x;
  float heat = smoothstep(0.3, 0.75, fbm3(p * 1.4 + vec2(t * 0.03, -t * 0.02)));
  float pulse = 0.65 + 0.35 * sin(t * 0.7 + v.z * 6.2832);
  c += vec3(1.0, 0.32, 0.06) * smoothstep(0.06, 0.0, edge) * heat * pulse * 0.26;
  c += vec3(0.4, 0.08, 0.03) * smoothstep(0.22, 0.0, edge) * heat * 0.08;
  // Warm haze rising from below.
  c += vec3(0.22, 0.06, 0.02) * smoothstep(0.1, -0.9, p.y) * (0.5 + 0.5 * fbm3(p * 2.0 - vec2(0.0, t * 0.05)));
  return c;
}

// Tiefsee: light patterns rippling over the floor, rays from above.
vec3 deep(vec2 p, float t) {
  float up = clamp(0.5 + p.y * 0.7, 0.0, 1.0);
  vec3 c = mix(vec3(0.008, 0.03, 0.055), vec3(0.025, 0.13, 0.18), up);
  // Caustics: two drifting webs of thin light lines.
  vec2 w = vec2(fbm3(p * 1.5 + t * 0.04), fbm3(p * 1.5 - t * 0.035 + 3.1));
  vec3 v1 = voronoi(p * 4.2 + w * 1.1 + vec2(t * 0.05, t * 0.03));
  vec3 v2 = voronoi(p * 5.6 - w * 0.9 + vec2(-t * 0.04, t * 0.05) + 7.0);
  float web = smoothstep(0.1, 0.0, v1.y - v1.x) + 0.7 * smoothstep(0.1, 0.0, v2.y - v2.x);
  c += vec3(0.25, 0.75, 0.72) * web * 0.07 * (0.45 + up);
  float rays = fbm3(vec2(p.x * 3.0 + p.y * 0.9 + t * 0.02, t * 0.04));
  c += vec3(0.08, 0.26, 0.28) * smoothstep(0.45, 0.85, rays) * up * up * 0.6;
  return c;
}

// Polarlicht: two curtains of light waving above the arena.
vec3 aurora(vec2 p, float t) {
  vec3 c = mix(vec3(0.006, 0.022, 0.022), vec3(0.016, 0.05, 0.06), clamp(p.y + 0.5, 0.0, 1.0));
  for (int k = 0; k < 2; k++) {
    float fk = float(k);
    float h = 0.12 + 0.2 * fk + 0.5 * (fbm3(vec2(p.x * 0.9 + fk * 3.7, t * 0.03 + fk * 2.0)) - 0.5);
    float d = p.y - h;
    float curtain = d > 0.0 ? exp(-d * 3.2) : exp(-d * d * 90.0);
    float streak = 0.35 + 0.65 * vnoise(vec2(p.x * 16.0 + fk * 9.0 + t * 0.2, p.y * 0.7));
    vec3 col = k == 0 ? vec3(0.12, 0.8, 0.42) : vec3(0.5, 0.22, 0.8);
    c += col * curtain * streak * (k == 0 ? 0.2 : 0.13);
  }
  return c;
}

// Die Leere: a far-away whirl of grey dust around a dark centre.
vec3 voidbg(vec2 p, float t) {
  vec2 d = p - vec2(0.28, 0.42);
  float r = length(d);
  float ang = t * 0.025 + 1.6 / (r + 0.12);
  float s = sin(ang);
  float co = cos(ang);
  vec2 rp = mat2(co, -s, s, co) * d;
  float n = fbm(rp * 3.2);
  float disk = smoothstep(0.06, 0.16, r) * exp(-r * 2.6);
  vec3 c = vec3(0.012, 0.012, 0.018);
  c += vec3(0.5, 0.5, 0.58) * disk * n * 0.5;
  c += vec3(0.05, 0.05, 0.07) * fbm3(p * 1.2 + 4.0) * 0.6;
  c *= smoothstep(0.045, 0.1, r);
  return c;
}

// Kristallgrotte: crystal facets in pink and cyan that catch the light now and then.
vec3 crystal(vec2 p, float t) {
  vec3 v = voronoi(p * 2.6);
  float edge = v.y - v.x;
  vec3 c = mix(vec3(0.24, 0.06, 0.21), vec3(0.05, 0.16, 0.21), v.z) * (0.22 + 0.32 * v.x);
  float glint = pow(max(0.0, sin(t * 0.5 + v.z * 40.0)), 14.0);
  c *= 0.6 + 1.1 * glint;
  c += vec3(0.55, 0.38, 0.75) * smoothstep(0.03, 0.0, edge) * 0.2;
  return c * 0.65;
}

void main() {
  vec2 p = (vUv - 0.5) * uRes / min(uRes.x, uRes.y) + uPar;
  float t = uTime;
  vec3 c;
  if (uRegion == 1) c = ember(p, t);
  else if (uRegion == 2) c = deep(p, t);
  else if (uRegion == 3) c = aurora(p, t);
  else if (uRegion == 4) c = voidbg(p, t);
  else if (uRegion == 5) c = crystal(p, t);
  else c = nebula(p, t);
  o = vec4(c, 1.0);
}`;

const FS_BRIGHT = `#version 300 es
precision mediump float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uThreshold;
void main() {
  vec3 c = texture(uTex, vUv + uTexel * vec2(-1.0, -1.0)).rgb
         + texture(uTex, vUv + uTexel * vec2( 1.0, -1.0)).rgb
         + texture(uTex, vUv + uTexel * vec2(-1.0,  1.0)).rgb
         + texture(uTex, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
  c *= 0.25;
  float l = max(c.r, max(c.g, c.b));
  float k = smoothstep(uThreshold, uThreshold + 0.3, l);
  // Small bright shapes lose most of their energy in the blur – lift them back up.
  o = vec4(c * k * 2.0, 1.0);
}`;

const FS_BLUR = `#version 300 es
precision mediump float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uTex;
uniform vec2 uDir;
void main() {
  vec3 c = textureLod(uTex, vUv, 0.0).rgb * 0.2270270270;
  c += textureLod(uTex, vUv + uDir * 1.3846153846, 0.0).rgb * 0.3162162162;
  c += textureLod(uTex, vUv - uDir * 1.3846153846, 0.0).rgb * 0.3162162162;
  c += textureLod(uTex, vUv + uDir * 3.2307692308, 0.0).rgb * 0.0702702703;
  c += textureLod(uTex, vUv - uDir * 3.2307692308, 0.0).rgb * 0.0702702703;
  o = vec4(c, 1.0);
}`;

const FS_COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform sampler2D uBg;
uniform sampler2D uBgPrev;
uniform vec2 uRes;
uniform float uDpr;
uniform float uTime;
uniform vec4 uWaves[${MAX_WAVES}];
uniform int uWaveCount;
uniform float uWaveWidth;
uniform float uBloomStrength;
uniform float uAberration;
uniform vec3 uTint;
uniform float uBgOn;
uniform float uFade;
uniform vec2 uPar;
uniform vec4 uArena;
uniform vec2 uArenaSize;
uniform vec4 uLight;
uniform vec3 uLightColor;
uniform vec3 uDustColor;
uniform vec2 uDustVel;
uniform vec4 uDustCfg;
uniform float uDustSway;
${NOISE}

float dust(vec2 css, float cell, float size, float density, vec2 vel) {
  vec2 c = css - vel * uTime;
  c.x += sin(c.y * 0.03 + uTime * 0.9) * uDustSway;
  vec2 p = c / cell;
  vec2 id = floor(p);
  float h = hash12(id);
  if (h > density) return 0.0;
  vec2 off = (hash22(id) - 0.5) * 0.6;
  float d = length(fract(p) - 0.5 - off) * cell;
  float tw = mix(1.0, 0.25 + 0.75 * pow(0.5 + 0.5 * sin(uTime * (0.7 + 2.0 * fract(h * 7.0)) + h * 50.0), 2.0), uDustCfg.w);
  return smoothstep(size, size * 0.2, d) * tw * (0.35 + 0.65 * fract(h * 13.0));
}

void main() {
  vec2 px = vUv * uRes;
  vec2 off = vec2(0.0);
  for (int i = 0; i < ${MAX_WAVES}; i++) {
    if (i >= uWaveCount) break;
    vec4 w = uWaves[i];
    vec2 d = px - w.xy;
    float dist = length(d);
    float x = (dist - w.z) / uWaveWidth;
    float ring = exp(-x * x);
    if (dist > 0.001) off += (d / dist) * ring * w.w;
  }
  vec2 uv = clamp(vUv + off / uRes, vec2(0.0), vec2(1.0));
  vec2 fromC = uv - 0.5;
  vec2 ab = fromC * (uAberration * (0.004 + 0.02 * dot(fromC, fromC)));
  vec4 sg = texture(uScene, uv);
  vec3 col = vec3(texture(uScene, uv + ab).r, sg.g, texture(uScene, uv - ab).b);

  if (uBgOn > 0.5) {
    vec3 bg = mix(texture(uBgPrev, uv).rgb, texture(uBg, uv).rgb, uFade);
    vec2 css = vec2(uv.x, 1.0 - uv.y) * uRes / uDpr;
    // Light that reaches the background: a wide copy of everything that glows, plus the spark's halo.
    vec3 L = textureLod(uBloom, uv, 2.5).rgb * 2.2;
    if (uLight.w > 0.0) {
      float ld = length(css - uLight.xy) / uLight.z;
      L += uLightColor * uLight.w * exp(-ld * ld * 2.5);
    }
    // Light dust in two depths.
    float s = dust(css + uPar * 6.0, uDustCfg.x, uDustCfg.y, uDustCfg.z, uDustVel)
            + 0.7 * dust(css + uPar * 16.0 + 97.0, uDustCfg.x * 1.8, uDustCfg.y * 1.3, uDustCfg.z * 0.7, uDustVel * 1.7);
    bg += uDustColor * s * 0.55;
    // Floor dots of the arena light up near light.
    if (uArena.w > 0.5) {
      vec2 wp = (css - uArena.xy) / uArena.z;
      if (wp.x > 0.0 && wp.y > 0.0 && wp.x < uArenaSize.x && wp.y < uArenaSize.y) {
        vec2 g = mod(wp, 28.0) - 14.0;
        float r = length(g) * uArena.z;
        float rad = 0.9 * uArena.z;
        float dotm = smoothstep(rad + 0.7, rad - 0.4, r);
        float lum = clamp(dot(L, vec3(0.3333)), 0.0, 1.0);
        bg += (vec3(0.59, 0.55, 1.0) * (0.09 + 0.4 * lum) + L * 0.3) * dotm;
      }
    }
    bg = bg * (0.75 + 1.4 * L) + L * 0.035;
    col += bg * (1.0 - sg.a);
  }

  col += texture(uBloom, uv).rgb * uBloomStrength;
  // Gentle grade: dark areas lean towards the region's colour.
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, col * (0.85 + 0.3 * uTint), (1.0 - clamp(l, 0.0, 1.0)) * 0.25);
  o = vec4(col, 1.0);
}`;

interface Target {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
  w: number;
  h: number;
}

export class PostFx {
  readonly canvas: HTMLCanvasElement;
  /** False after a lost context or a failed setup – the caller then falls back to the 2D canvas. */
  ok = true;
  onLost: (() => void) | null = null;
  private gl: WebGL2RenderingContext;
  private bgProg: WebGLProgram;
  private bright: WebGLProgram;
  private blur: WebGLProgram;
  private composite: WebGLProgram;
  private sceneTex: WebGLTexture;
  private sceneW = 0;
  private sceneH = 0;
  private a: Target | null = null;
  private b: Target | null = null;
  private bgCur: Target | null = null;
  private bgPrev: Target | null = null;
  private region = -1;
  private fadeStart = -99;
  private waveData = new Float32Array(MAX_WAVES * 4);
  private uniforms = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();

  static create(source: HTMLCanvasElement): PostFx | null {
    try {
      return new PostFx(source);
    } catch {
      return null;
    }
  }

  private constructor(private source: HTMLCanvasElement) {
    const canvas = document.createElement('canvas');
    canvas.id = 'game-fx';
    canvas.setAttribute('aria-hidden', 'true');
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('no webgl2');
    this.canvas = canvas;
    this.gl = gl;
    this.bgProg = this.program(FS_BG);
    this.bright = this.program(FS_BRIGHT);
    this.blur = this.program(FS_BLUR);
    this.composite = this.program(FS_COMPOSITE);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    for (const p of [this.bgProg, this.bright, this.blur, this.composite]) {
      const loc = gl.getAttribLocation(p, 'aPos');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    }
    this.sceneTex = this.texture();

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.ok = false;
      this.onLost?.();
    });
    source.insertAdjacentElement('afterend', canvas);
  }

  private program(fs: string): WebGLProgram {
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
    return p;
  }

  private u(p: WebGLProgram, name: string): WebGLUniformLocation | null {
    let m = this.uniforms.get(p);
    if (!m) this.uniforms.set(p, (m = new Map()));
    if (!m.has(name)) m.set(name, this.gl.getUniformLocation(p, name));
    return m.get(name)!;
  }

  private texture(mipmaps = false): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mipmaps ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  private target(w: number, h: number, mipmaps = false): Target {
    const gl = this.gl;
    const tex = this.texture(mipmaps);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    if (mipmaps) gl.generateMipmap(gl.TEXTURE_2D);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fbo, w, h };
  }

  /** Matches the 2D canvas size; the glow buffers run at a quarter of it, the background at a third. */
  resize(): void {
    if (!this.ok) return;
    const gl = this.gl;
    const w = this.source.width;
    const h = this.source.height;
    this.canvas.width = w;
    this.canvas.height = h;
    for (const t of [this.a, this.b, this.bgCur, this.bgPrev]) {
      if (!t) continue;
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fbo);
    }
    const qw = Math.max(1, Math.round(w / 4));
    const qh = Math.max(1, Math.round(h / 4));
    // The first glow buffer keeps smaller copies of itself: the widest one lights the background.
    this.a = this.target(qw, qh, true);
    this.b = this.target(qw, qh);
    const tw = Math.max(1, Math.round(w / 3));
    const th = Math.max(1, Math.round(h / 3));
    this.bgCur = this.target(tw, th);
    this.bgPrev = this.target(tw, th);
    this.fadeStart = -99;
    this.sceneW = 0;
    this.sceneH = 0;
  }

  /** Copies the 2D frame to the GPU and draws it with background and light filter. */
  render(p: PostParams, dpr: number): void {
    if (!this.ok || !this.a || !this.b || !this.bgCur || !this.bgPrev || this.gl.isContextLost()) return;
    const gl = this.gl;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const sc = p.scene;

    // Region background (a fresh region fades in over the last picture of the old one).
    let fade = 1;
    if (sc) {
      if (sc.region !== this.region) {
        if (this.region >= 0) {
          [this.bgCur, this.bgPrev] = [this.bgPrev, this.bgCur];
          this.fadeStart = sc.time;
        }
        this.region = sc.region;
      }
      fade = Math.min(1, Math.max(0, (sc.time - this.fadeStart) / FADE_TIME));
      const t = this.bgCur;
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.viewport(0, 0, t.w, t.h);
      gl.useProgram(this.bgProg);
      gl.uniform2f(this.u(this.bgProg, 'uRes'), t.w, t.h);
      gl.uniform1f(this.u(this.bgProg, 'uTime'), sc.time);
      gl.uniform1i(this.u(this.bgProg, 'uRegion'), sc.region);
      gl.uniform2f(this.u(this.bgProg, 'uPar'), sc.parX * 0.025, -sc.parY * 0.025);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // Upload the 2D frame (allocate once, then update in place). Premultiplied, so empty areas stay empty.
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    if (this.sceneW !== w || this.sceneH !== h) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.source);
      this.sceneW = w;
      this.sceneH = h;
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.source);
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

    // Bright pass into the quarter-size buffer, then two rounds of blur for a wide, soft glow.
    const a = this.a;
    const bb = this.b;
    gl.viewport(0, 0, a.w, a.h);
    gl.useProgram(this.bright);
    gl.bindFramebuffer(gl.FRAMEBUFFER, a.fbo);
    gl.uniform1i(this.u(this.bright, 'uTex'), 0);
    gl.uniform2f(this.u(this.bright, 'uTexel'), 1.5 / w, 1.5 / h);
    gl.uniform1f(this.u(this.bright, 'uThreshold'), 0.5);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.useProgram(this.blur);
    gl.uniform1i(this.u(this.blur, 'uTex'), 0);
    for (const spread of [1, 2]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, bb.fbo);
      gl.bindTexture(gl.TEXTURE_2D, a.tex);
      gl.uniform2f(this.u(this.blur, 'uDir'), spread / a.w, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, a.fbo);
      gl.bindTexture(gl.TEXTURE_2D, bb.tex);
      gl.uniform2f(this.u(this.blur, 'uDir'), 0, spread / a.h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, a.tex);
    gl.generateMipmap(gl.TEXTURE_2D);

    // Composite to the screen.
    gl.viewport(0, 0, w, h);
    const c = this.composite;
    gl.useProgram(c);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, a.tex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.bgCur.tex);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.bgPrev.tex);
    gl.uniform1i(this.u(c, 'uScene'), 0);
    gl.uniform1i(this.u(c, 'uBloom'), 1);
    gl.uniform1i(this.u(c, 'uBg'), 2);
    gl.uniform1i(this.u(c, 'uBgPrev'), 3);
    gl.uniform2f(this.u(c, 'uRes'), w, h);
    gl.uniform1f(this.u(c, 'uDpr'), dpr);
    const n = Math.min(MAX_WAVES, p.waves.length);
    for (let i = 0; i < n; i++) {
      const wv = p.waves[i];
      this.waveData[i * 4] = wv.x * dpr;
      this.waveData[i * 4 + 1] = h - wv.y * dpr;
      this.waveData[i * 4 + 2] = wv.radius * dpr;
      this.waveData[i * 4 + 3] = wv.strength * dpr;
    }
    gl.uniform4fv(this.u(c, 'uWaves'), this.waveData);
    gl.uniform1i(this.u(c, 'uWaveCount'), n);
    gl.uniform1f(this.u(c, 'uWaveWidth'), 26 * dpr);
    gl.uniform1f(this.u(c, 'uBloomStrength'), p.bloom);
    gl.uniform1f(this.u(c, 'uAberration'), p.aberration);
    gl.uniform3f(this.u(c, 'uTint'), p.tint[0], p.tint[1], p.tint[2]);
    gl.uniform1f(this.u(c, 'uBgOn'), sc ? 1 : 0);
    if (sc) {
      const d = DUST[sc.region] ?? DUST[0];
      gl.uniform1f(this.u(c, 'uTime'), sc.time);
      gl.uniform1f(this.u(c, 'uFade'), fade);
      gl.uniform2f(this.u(c, 'uPar'), -sc.parX, -sc.parY);
      gl.uniform3f(this.u(c, 'uDustColor'), d.color[0], d.color[1], d.color[2]);
      gl.uniform2f(this.u(c, 'uDustVel'), d.vel[0], d.vel[1]);
      gl.uniform4f(this.u(c, 'uDustCfg'), d.cell, d.size, d.density, d.twinkle);
      gl.uniform1f(this.u(c, 'uDustSway'), d.sway);
      const ar = sc.arena;
      gl.uniform4f(this.u(c, 'uArena'), ar?.x ?? 0, ar?.y ?? 0, ar?.scale ?? 1, ar ? 1 : 0);
      gl.uniform2f(this.u(c, 'uArenaSize'), ar?.w ?? 0, ar?.h ?? 0);
      const li = sc.light;
      gl.uniform4f(this.u(c, 'uLight'), li?.x ?? 0, li?.y ?? 0, li?.radius ?? 1, li?.strength ?? 0);
      gl.uniform3f(this.u(c, 'uLightColor'), li?.color[0] ?? 0, li?.color[1] ?? 0, li?.color[2] ?? 0);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);
  }

  setVisible(on: boolean): void {
    this.canvas.style.display = on ? 'block' : 'none';
  }

  destroy(): void {
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.canvas.remove();
    this.ok = false;
  }
}
