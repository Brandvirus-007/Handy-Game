/**
 * WebGL2 light filter over the finished 2D frame: bloom (soft glow around bright light), ring-shaped
 * distortion waves, a colour split on hits, a light vignette and a biome tint. The 2D canvas stays the
 * source of truth – if WebGL is missing or the context is lost, the game simply shows the 2D canvas again.
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

export interface PostParams {
  bloom: number;
  aberration: number;
  tint: [number, number, number];
  waves: Wave[];
}

const MAX_WAVES = 6;

const VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
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
  vec3 c = texture(uTex, vUv).rgb * 0.2270270270;
  c += texture(uTex, vUv + uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture(uTex, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture(uTex, vUv + uDir * 3.2307692308).rgb * 0.0702702703;
  c += texture(uTex, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
  o = vec4(c, 1.0);
}`;

const FS_COMPOSITE = `#version 300 es
precision mediump float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2 uRes;
uniform vec4 uWaves[${MAX_WAVES}];
uniform int uWaveCount;
uniform float uWaveWidth;
uniform float uBloomStrength;
uniform float uAberration;
uniform vec3 uTint;
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
  vec3 col;
  col.r = texture(uScene, uv + ab).r;
  col.g = texture(uScene, uv).g;
  col.b = texture(uScene, uv - ab).b;
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
  private bright: WebGLProgram;
  private blur: WebGLProgram;
  private composite: WebGLProgram;
  private sceneTex: WebGLTexture;
  private sceneW = 0;
  private sceneH = 0;
  private a: Target | null = null;
  private b: Target | null = null;
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
    this.bright = this.program(FS_BRIGHT);
    this.blur = this.program(FS_BLUR);
    this.composite = this.program(FS_COMPOSITE);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    for (const p of [this.bright, this.blur, this.composite]) {
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

  private texture(): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  private target(w: number, h: number): Target {
    const gl = this.gl;
    const tex = this.texture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fbo, w, h };
  }

  /** Matches the 2D canvas size; the bloom buffers run at a quarter of it. */
  resize(): void {
    if (!this.ok) return;
    const gl = this.gl;
    const w = this.source.width;
    const h = this.source.height;
    this.canvas.width = w;
    this.canvas.height = h;
    for (const t of [this.a, this.b]) {
      if (!t) continue;
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fbo);
    }
    const qw = Math.max(1, Math.round(w / 4));
    const qh = Math.max(1, Math.round(h / 4));
    this.a = this.target(qw, qh);
    this.b = this.target(qw, qh);
    this.sceneW = 0;
    this.sceneH = 0;
  }

  /** Copies the 2D frame to the GPU and draws it with the light filter. */
  render(p: PostParams, dpr: number): void {
    if (!this.ok || !this.a || !this.b || this.gl.isContextLost()) return;
    const gl = this.gl;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Upload the 2D frame (allocate once, then update in place).
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    if (this.sceneW !== w || this.sceneH !== h) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.source);
      this.sceneW = w;
      this.sceneH = h;
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.source);
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

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

    // Composite to the screen.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.composite);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, a.tex);
    gl.uniform1i(this.u(this.composite, 'uScene'), 0);
    gl.uniform1i(this.u(this.composite, 'uBloom'), 1);
    gl.uniform2f(this.u(this.composite, 'uRes'), w, h);
    const n = Math.min(MAX_WAVES, p.waves.length);
    for (let i = 0; i < n; i++) {
      const wv = p.waves[i];
      this.waveData[i * 4] = wv.x * dpr;
      this.waveData[i * 4 + 1] = h - wv.y * dpr;
      this.waveData[i * 4 + 2] = wv.radius * dpr;
      this.waveData[i * 4 + 3] = wv.strength * dpr;
    }
    gl.uniform4fv(this.u(this.composite, 'uWaves'), this.waveData);
    gl.uniform1i(this.u(this.composite, 'uWaveCount'), n);
    gl.uniform1f(this.u(this.composite, 'uWaveWidth'), 26 * dpr);
    gl.uniform1f(this.u(this.composite, 'uBloomStrength'), p.bloom);
    gl.uniform1f(this.u(this.composite, 'uAberration'), p.aberration);
    gl.uniform3f(this.u(this.composite, 'uTint'), p.tint[0], p.tint[1], p.tint[2]);
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
