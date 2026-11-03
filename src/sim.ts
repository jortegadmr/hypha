import {
  AGENT_FS,
  DEPOSIT_FS,
  DEPOSIT_VS,
  DIFFUSE_FS,
  DISPLAY_FS,
  FOOD_FS,
  FULLSCREEN_VS,
  MAX_NODES,
  NODE_FS,
  NODE_VS,
} from './shaders';
import type { Scene, SceneNode, Vec2 } from './geo';

export class WebGL2Unavailable extends Error {}

export interface Layout {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Params {
  /** Simulation steps per frame (fractional allowed). */
  speed: number;
  /** Trail persistence per step, 0.90 to 0.995. */
  decay: number;
  paused: boolean;
  reducedMotion: boolean;
}

/** Agent texture side lengths: 512^2 = 262k, 384^2 = 147k, 256^2 = 65k agents. */
const AGENT_TIERS = [512, 384, 256];

interface Target {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
  w: number;
  h: number;
}

type Uniforms = Record<string, WebGLUniformLocation | null>;

interface Program {
  prog: WebGLProgram;
  u: Uniforms;
}

export class Sim {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;
  params: Params = { speed: 1.6, decay: 0.965, paused: false, reducedMotion: false };

  scene: Scene | null = null;
  nodes: SceneNode[] = [];
  hover = -1;

  /** Sim size in texels and the world-to-texel fit. */
  simW = 2;
  simH = 2;
  private fit = { scale: 1, ox: 0, oy: 0 };
  private cssW = 1;
  private cssH = 1;
  private layout: Layout = { top: 0, right: 0, bottom: 0, left: 0 };
  private canvasScale = 1;

  private progs: Record<string, Program> = {};
  private trail: Target[] = [];
  private agents: Target[] = [];
  private food!: Target;
  private maskTex!: WebGLTexture;
  private whiteTex!: WebGLTexture;
  private hasLand = false;
  private tierIndex = 0;
  private agentSide = AGENT_TIERS[0];
  private trailCur = 0;
  private agentCur = 0;
  private frameNo = 0;
  private acc = 0;
  private time = 0;
  private last = 0;
  private boost = 0;
  private burst = { x: 0, y: 0, s: 0 };
  private nodeBuf = new Float32Array(MAX_NODES * 2);
  private nodeUv = new Float32Array(MAX_NODES * 2);
  private slowFrames = 0;
  private fastFrames = 0;
  private emaMs = 16;
  private lastTierChange = 0;
  adaptive = true;
  onTier?: (agents: number) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new WebGL2Unavailable('WebGL2 is not available');
    if (!gl.getExtension('EXT_color_buffer_float')) {
      throw new WebGL2Unavailable('Floating point render targets are not available');
    }
    this.gl = gl;
    gl.getExtension('OES_texture_float_linear');
    this.progs.agent = this.program(FULLSCREEN_VS, AGENT_FS);
    this.progs.deposit = this.program(DEPOSIT_VS, DEPOSIT_FS);
    this.progs.diffuse = this.program(FULLSCREEN_VS, DIFFUSE_FS);
    this.progs.food = this.program(FULLSCREEN_VS, FOOD_FS);
    this.progs.display = this.program(FULLSCREEN_VS, DISPLAY_FS);
    this.progs.node = this.program(NODE_VS, NODE_FS);
    gl.bindVertexArray(gl.createVertexArray());
    this.whiteTex = this.makeTexture(1, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 0, 0, 255]), gl.LINEAR);
    this.maskTex = this.whiteTex;
  }

  get agentCount(): number {
    return this.agentSide * this.agentSide;
  }

  // ---------------------------------------------------------------- setup

  private compile(type: number, src: string): WebGLShader {
    const gl = this.gl;
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error('Shader error: ' + gl.getShaderInfoLog(s));
    }
    return s;
  }

  private program(vs: string, fs: string): Program {
    const gl = this.gl;
    const p = gl.createProgram()!;
    gl.attachShader(p, this.compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, this.compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('Link error: ' + gl.getProgramInfoLog(p));
    }
    const u: Uniforms = new Proxy({} as Uniforms, {
      get: (cache, name: string) => {
        if (!(name in cache)) cache[name] = gl.getUniformLocation(p, name);
        return cache[name];
      },
    });
    return { prog: p, u };
  }

  private makeTexture(
    w: number,
    h: number,
    internal: number,
    format: number,
    type: number,
    data: ArrayBufferView | null,
    filter: number,
  ): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  private makeTarget(w: number, h: number, internal: number, type: number, filter: number): Target {
    const gl = this.gl;
    const tex = this.makeTexture(w, h, internal, gl.RGBA, type, null, filter);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new WebGL2Unavailable('Framebuffer is not complete');
    }
    return { tex, fbo, w, h };
  }

  private freeTarget(t: Target | undefined): void {
    if (!t) return;
    this.gl.deleteTexture(t.tex);
    this.gl.deleteFramebuffer(t.fbo);
  }

  /** Resize the canvas and rebuild the simulation textures. */
  resize(cssW: number, cssH: number, dpr: number, layout: Layout): void {
    const gl = this.gl;
    this.cssW = cssW;
    this.cssH = cssH;
    this.layout = layout;
    const cs = Math.min(dpr, 1.5);
    const cw = Math.max(2, Math.round(cssW * cs));
    const ch = Math.max(2, Math.round(cssH * cs));
    this.canvas.width = cw;
    this.canvas.height = ch;
    const maxDim = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE) as number, cssW < 700 ? 960 : 1500);
    this.canvasScale = Math.min(1, maxDim / Math.max(cw, ch));
    this.simW = Math.max(2, Math.round(cw * this.canvasScale));
    this.simH = Math.max(2, Math.round(ch * this.canvasScale));

    this.trail.forEach((t) => this.freeTarget(t));
    this.freeTarget(this.food);
    this.trail = [0, 1].map(() => this.makeTarget(this.simW, this.simH, gl.RGBA16F, gl.HALF_FLOAT, gl.LINEAR));
    this.food = this.makeTarget(
      Math.max(2, this.simW >> 1),
      Math.max(2, this.simH >> 1),
      gl.RGBA16F,
      gl.HALF_FLOAT,
      gl.LINEAR,
    );
    this.rebuildAgents();
    this.updateFit();
    this.rebuildMask();
    this.rebuildFood();
    this.regrow();
  }

  private rebuildAgents(): void {
    const gl = this.gl;
    this.agents.forEach((t) => this.freeTarget(t));
    const s = this.agentSide;
    this.agents = [0, 1].map(() => this.makeTarget(s, s, gl.RGBA32F, gl.FLOAT, gl.NEAREST));
  }

  private get unit(): number {
    // Keeps behaviour independent of the simulation resolution.
    return Math.max(0.55, Math.min(1.7, this.simH / 800));
  }

  // ---------------------------------------------------------------- world

  private updateFit(): void {
    const sc = this.simW / this.cssW;
    const L = this.layout;
    const left = L.left * sc;
    const right = L.right * sc;
    const top = L.top * sc;
    const bottom = L.bottom * sc;
    const aw = Math.max(10, this.simW - left - right);
    const ah = Math.max(10, this.simH - top - bottom);
    const w = this.scene?.w ?? 1;
    const h = this.scene?.h ?? 1;
    const scale = Math.min(aw / w, ah / h);
    this.fit = {
      scale,
      ox: left + (aw - w * scale) / 2,
      oy: bottom + (ah - h * scale) / 2,
    };
  }

  worldToSim(p: Vec2): Vec2 {
    return { x: this.fit.ox + p.x * this.fit.scale, y: this.fit.oy + p.y * this.fit.scale };
  }

  /** CSS pixel position (origin top-left) of a world point. */
  worldToCss(p: Vec2): Vec2 {
    const s = this.worldToSim(p);
    return { x: (s.x / this.simW) * this.cssW, y: (1 - s.y / this.simH) * this.cssH };
  }

  cssToWorld(x: number, y: number): Vec2 {
    const sx = (x / this.cssW) * this.simW;
    const sy = (1 - y / this.cssH) * this.simH;
    return { x: (sx - this.fit.ox) / this.fit.scale, y: (sy - this.fit.oy) / this.fit.scale };
  }

  /** True when a world point lies on land (or when the scene has no coastline). */
  isLand(p: Vec2): boolean {
    const land = this.scene?.land;
    if (!land) {
      return p.x >= 0 && p.y >= 0 && p.x <= (this.scene?.w ?? 0) && p.y <= (this.scene?.h ?? 0);
    }
    const margin = 0.12;
    return land.some((ring) => pointInRing(p, ring) || nearRing(p, ring, margin));
  }

  setScene(scene: Scene): void {
    this.scene = scene;
    this.nodes = scene.nodes.map((n) => ({ ...n }));
    this.hover = -1;
    this.updateFit();
    this.rebuildMask();
    this.rebuildFood();
    this.regrow();
  }

  /** Adds a node, or removes the one under the pointer. Returns what happened. */
  toggleNode(p: Vec2, radiusWorld: number): 'added' | 'removed' | 'blocked' {
    let best = -1;
    let bd = radiusWorld;
    this.nodes.forEach((n, i) => {
      const d = Math.hypot(n.x - p.x, n.y - p.y);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    if (best >= 0) {
      this.nodes.splice(best, 1);
      this.hover = -1;
      this.rebuildFood();
      return 'removed';
    }
    if (!this.isLand(p) || this.nodes.length >= MAX_NODES) return 'blocked';
    this.nodes.push({ x: p.x, y: p.y });
    const s = this.worldToSim(p);
    this.burst = { x: s.x, y: s.y, s: this.params.reducedMotion ? 0.4 : 1 };
    this.boost = Math.max(this.boost, 1.2);
    this.rebuildFood();
    return 'added';
  }

  clearNodes(): void {
    this.nodes = [];
    this.hover = -1;
    this.rebuildFood();
    this.regrow();
  }

  nearestNode(p: Vec2, radiusWorld: number): number {
    let best = -1;
    let bd = radiusWorld;
    this.nodes.forEach((n, i) => {
      const d = Math.hypot(n.x - p.x, n.y - p.y);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  /** World units covered by one CSS pixel. */
  get worldPerCssPx(): number {
    return this.simW / this.cssW / this.fit.scale;
  }

  // ------------------------------------------------------------ resources

  private rebuildMask(): void {
    const gl = this.gl;
    if (this.maskTex !== this.whiteTex) gl.deleteTexture(this.maskTex);
    const land = this.scene?.land;
    this.hasLand = !!land;
    if (!land) {
      this.maskTex = this.whiteTex;
      return;
    }
    const c = document.createElement('canvas');
    c.width = this.simW;
    c.height = this.simH;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, c.width, c.height);
    const path = () => {
      ctx.beginPath();
      for (const ring of land) {
        ring.forEach((p, i) => {
          const s = this.worldToSim(p);
          if (i === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        });
        ctx.closePath();
      }
    };
    ctx.lineJoin = 'round';
    ctx.fillStyle = '#f00';
    ctx.strokeStyle = '#f00';
    ctx.lineWidth = 7 * this.unit;
    path();
    ctx.fill();
    ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = '#0f0';
    ctx.lineWidth = Math.max(1.2, 1.6 * this.unit);
    ctx.filter = `blur(${0.7 * this.unit}px)`;
    path();
    ctx.stroke();
    this.maskTex = this.makeTexture(c.width, c.height, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, null, gl.LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, c);
  }

  private syncNodes(): void {
    const n = Math.min(this.nodes.length, MAX_NODES);
    for (let i = 0; i < n; i++) {
      const s = this.worldToSim(this.nodes[i]);
      this.nodeBuf[i * 2] = s.x;
      this.nodeBuf[i * 2 + 1] = s.y;
      this.nodeUv[i * 2] = s.x / this.simW;
      this.nodeUv[i * 2 + 1] = s.y / this.simH;
    }
  }

  private rebuildFood(): void {
    const gl = this.gl;
    if (!this.food) return;
    this.syncNodes();
    const p = this.progs.food;
    gl.useProgram(p.prog);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.food.fbo);
    gl.viewport(0, 0, this.food.w, this.food.h);
    gl.disable(gl.BLEND);
    gl.uniform2f(p.u.uSize, this.simW, this.simH);
    gl.uniform1f(p.u.uSigma, 0.045 * this.simH);
    gl.uniform1i(p.u.uNodeCount, this.nodes.length);
    gl.uniform2fv(p.u.uNodes, this.nodeBuf);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Re-seed agents at the nodes and wipe the trail. */
  regrow(): void {
    const gl = this.gl;
    if (!this.agents.length) return;
    const s = this.agentSide;
    const data = new Float32Array(s * s * 4);
    const n = this.nodes.length;
    for (let i = 0; i < s * s; i++) {
      const a = Math.random() * Math.PI * 2;
      let x: number;
      let y: number;
      if (n > 0) {
        const node = this.worldToSim(this.nodes[(Math.random() * n) | 0]);
        const r = Math.random() * 6;
        x = node.x + Math.cos(a) * r;
        y = node.y + Math.sin(a) * r;
      } else {
        x = Math.random() * this.simW;
        y = Math.random() * this.simH;
      }
      data[i * 4] = x;
      data[i * 4 + 1] = y;
      data[i * 4 + 2] = a;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.agents[this.agentCur].tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, s, s, gl.RGBA, gl.FLOAT, data);
    gl.disable(gl.BLEND);
    for (const t of this.trail) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    this.boost = this.params.reducedMotion ? 0.4 : 1.6;
    this.burst.s = 0;
  }

  // ----------------------------------------------------------------- loop

  private bindTex(unit: number, tex: WebGLTexture): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
  }

  private stepOnce(): void {
    const gl = this.gl;
    const k = this.unit;
    const s = this.agentSide;

    // 1. agents sense and move
    let p = this.progs.agent;
    gl.useProgram(p.prog);
    gl.disable(gl.BLEND);
    const src = this.agents[this.agentCur];
    const dst = this.agents[1 - this.agentCur];
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
    gl.viewport(0, 0, s, s);
    this.bindTex(0, src.tex);
    this.bindTex(1, this.trail[this.trailCur].tex);
    this.bindTex(2, this.food.tex);
    this.bindTex(3, this.maskTex);
    gl.uniform1i(p.u.uAgents, 0);
    gl.uniform1i(p.u.uTrail, 1);
    gl.uniform1i(p.u.uFood, 2);
    gl.uniform1i(p.u.uMask, 3);
    gl.uniform2f(p.u.uSize, this.simW, this.simH);
    gl.uniform2i(p.u.uAgentDim, s, s);
    gl.uniform1f(p.u.uSensorAngle, 0.62);
    gl.uniform1f(p.u.uSensorDist, 7 * k);
    gl.uniform1f(p.u.uTurn, 0.42);
    gl.uniform1f(p.u.uStep, 1.15 * k);
    gl.uniform1f(p.u.uFoodW, 0.14);
    gl.uniform1f(p.u.uRespawn, 0.0022);
    gl.uniform1ui(p.u.uFrame, this.frameNo++ >>> 0);
    gl.uniform1i(p.u.uNodeCount, this.nodes.length);
    gl.uniform2fv(p.u.uNodes, this.nodeBuf);
    gl.uniform3f(p.u.uBurst, this.burst.x, this.burst.y, this.burst.s);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.agentCur = 1 - this.agentCur;

    // 2. agents deposit onto the trail map
    p = this.progs.deposit;
    gl.useProgram(p.prog);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.trail[this.trailCur].fbo);
    gl.viewport(0, 0, this.simW, this.simH);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    this.bindTex(0, this.agents[this.agentCur].tex);
    gl.uniform1i(p.u.uAgents, 0);
    gl.uniform2i(p.u.uAgentDim, s, s);
    gl.uniform2f(p.u.uSize, this.simW, this.simH);
    gl.uniform1f(p.u.uDeposit, 0.12 * (262144 / (s * s)));
    gl.drawArrays(gl.POINTS, 0, s * s);
    gl.disable(gl.BLEND);

    // 3. diffuse and decay
    p = this.progs.diffuse;
    gl.useProgram(p.prog);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.trail[1 - this.trailCur].fbo);
    this.bindTex(0, this.trail[this.trailCur].tex);
    gl.uniform1i(p.u.uTrail, 0);
    gl.uniform2f(p.u.uTexel, 1 / this.simW, 1 / this.simH);
    gl.uniform1f(p.u.uDiffuse, 0.32);
    gl.uniform1f(p.u.uDecay, this.params.decay);
    gl.uniform1f(p.u.uMemDecay, 0.9965);
    gl.uniform1f(p.u.uMemGain, 0.005);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.trailCur = 1 - this.trailCur;
  }

  private draw(): void {
    const gl = this.gl;
    let p = this.progs.display;
    gl.useProgram(p.prog);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.disable(gl.BLEND);
    this.bindTex(0, this.trail[this.trailCur].tex);
    this.bindTex(1, this.food.tex);
    this.bindTex(2, this.maskTex);
    gl.uniform1i(p.u.uTrail, 0);
    gl.uniform1i(p.u.uFood, 1);
    gl.uniform1i(p.u.uMask, 2);
    gl.uniform2f(p.u.uSize, this.simW, this.simH);
    gl.uniform1f(p.u.uTime, this.time);
    const calm = this.params.reducedMotion;
    gl.uniform1f(p.u.uPulseAmp, calm ? 0.25 : 0.85);
    gl.uniform1f(p.u.uPulseSpeed, calm ? 0.9 : 2.6);
    gl.uniform1f(p.u.uHasLand, this.hasLand ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const n = Math.min(this.nodes.length, MAX_NODES);
    if (n > 0) {
      p = this.progs.node;
      gl.useProgram(p.prog);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.uniform2fv(p.u.uNodes, this.nodeUv);
      const cs = this.canvas.width / this.cssW;
      gl.uniform1f(p.u.uSize, Math.min(64, 40 * cs));
      gl.uniform1f(p.u.uTime, this.time);
      gl.uniform1f(p.u.uBeat, this.params.reducedMotion ? 0.35 : 1);
      gl.uniform1i(p.u.uHover, this.hover);
      gl.drawArrays(gl.POINTS, 0, n);
      gl.disable(gl.BLEND);
    }
  }

  private adapt(dtMs: number, now: number): void {
    if (!this.adaptive || this.params.paused) return;
    this.emaMs = this.emaMs * 0.9 + Math.min(dtMs, 200) * 0.1;
    if (now - this.lastTierChange < 2500) return;
    if (this.emaMs > 26) this.slowFrames++;
    else this.slowFrames = 0;
    if (this.slowFrames > 20 && this.tierIndex < AGENT_TIERS.length - 1) {
      this.setTier(this.tierIndex + 1, now);
    }
    void this.fastFrames;
  }

  setTier(i: number, now = performance.now()): void {
    this.tierIndex = Math.max(0, Math.min(AGENT_TIERS.length - 1, i));
    this.agentSide = AGENT_TIERS[this.tierIndex];
    this.slowFrames = 0;
    this.lastTierChange = now;
    this.rebuildAgents();
    this.regrow();
    this.onTier?.(this.agentCount);
  }

  frame(now: number): void {
    const dtMs = this.last ? now - this.last : 16;
    this.last = now;
    const dt = Math.min(0.05, dtMs / 1000);
    this.time += dt;
    this.adapt(dtMs, now);
    if (!this.params.paused) {
      this.syncNodes();
      this.boost = Math.max(0, this.boost - dt * 0.7);
      this.burst.s = Math.max(0, this.burst.s - dt * 0.9);
      this.acc += this.params.speed * (1 + this.boost * 2.2);
      const steps = Math.min(8, Math.floor(this.acc));
      this.acc -= steps;
      for (let i = 0; i < steps; i++) this.stepOnce();
    }
    this.draw();
  }
}

function pointInRing(p: Vec2, ring: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function nearRing(p: Vec2, ring: Vec2[], margin: number): boolean {
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    if (Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y) < margin) return true;
  }
  return false;
}
