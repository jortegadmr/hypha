export const MAX_NODES = 128;

export const FULLSCREEN_VS = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const HASH = `
uint hash(uint x) {
  x ^= x >> 16; x *= 0x7feb352du;
  x ^= x >> 15; x *= 0x846ca68bu;
  x ^= x >> 16;
  return x;
}
float rnd(uint h) { return float(h) * (1.0 / 4294967295.0); }
`;

/** One Physarum agent step: sense (trail + food + land), steer, move, maybe respawn at a node. */
export const AGENT_FS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uAgents;
uniform sampler2D uTrail;
uniform sampler2D uFood;
uniform sampler2D uMask;
uniform vec2 uSize;
uniform ivec2 uAgentDim;
uniform float uSensorAngle;
uniform float uSensorDist;
uniform float uTurn;
uniform float uStep;
uniform float uFoodW;
uniform float uRespawn;
uniform uint uFrame;
uniform int uNodeCount;
uniform vec2 uNodes[${MAX_NODES}];
uniform vec3 uBurst;
out vec4 outAgent;
${HASH}
float sense(vec2 p) {
  vec2 uv = p / uSize;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return -50.0;
  if (texture(uMask, uv).r < 0.5) return -50.0;
  vec4 t = texture(uTrail, uv);
  return t.r + 0.55 * t.g + uFoodW * texture(uFood, uv).r;
}
vec2 dirOf(float a) { return vec2(cos(a), sin(a)); }
void main() {
  ivec2 id = ivec2(gl_FragCoord.xy);
  vec4 a = texelFetch(uAgents, id, 0);
  uint idx = uint(id.y * uAgentDim.x + id.x);
  uint h0 = hash(idx * 747796405u + uFrame * 2891336453u + 12345u);
  uint h1 = hash(h0 ^ 0x9e3779b9u);
  uint h2 = hash(h1 + 0x85ebca6bu);
  uint h3 = hash(h2 ^ 0xc2b2ae35u);
  vec2 pos = a.xy;
  float ang = a.z;

  if (uNodeCount > 0) {
    float burstP = uBurst.z * 0.06;
    if (rnd(h1) < burstP) {
      float r = rnd(h2) * 4.0;
      float t = rnd(h3) * 6.2831853;
      pos = uBurst.xy + r * dirOf(t);
      ang = t;
    } else if (rnd(h0) < uRespawn) {
      int k = int(rnd(h2) * float(uNodeCount));
      k = min(k, uNodeCount - 1);
      float t = rnd(h3) * 6.2831853;
      pos = uNodes[k] + 3.0 * dirOf(t);
      ang = t;
    }
  }

  float f = sense(pos + dirOf(ang) * uSensorDist);
  float l = sense(pos + dirOf(ang + uSensorAngle) * uSensorDist);
  float r = sense(pos + dirOf(ang - uSensorAngle) * uSensorDist);
  float jitter = (rnd(h1) - 0.5) * 0.08;
  if (f > l && f > r) {
    ang += jitter;
  } else if (f < l && f < r) {
    ang += (rnd(h2) < 0.5 ? -1.0 : 1.0) * uTurn;
  } else if (l > r) {
    ang += uTurn;
  } else if (r > l) {
    ang -= uTurn;
  } else {
    ang += jitter;
  }
  vec2 np = pos + dirOf(ang) * uStep;
  if (sense(np) < -49.0) {
    ang = rnd(h3) * 6.2831853;
    np = pos;
  }
  outAgent = vec4(np, ang, 0.0);
}`;

export const DEPOSIT_VS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uAgents;
uniform ivec2 uAgentDim;
uniform vec2 uSize;
void main() {
  ivec2 id = ivec2(gl_VertexID % uAgentDim.x, gl_VertexID / uAgentDim.x);
  vec4 a = texelFetch(uAgents, id, 0);
  gl_Position = vec4(a.xy / uSize * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = 1.0;
}`;

export const DEPOSIT_FS = `#version 300 es
precision highp float;
uniform float uDeposit;
out vec4 o;
void main() { o = vec4(uDeposit, 0.0, 0.0, 1.0); }`;

/** Blur + decay of the short-term trail (R) and a slow memory of it (G) that keeps the main highways alive. */
export const DIFFUSE_FS = `#version 300 es
precision highp float;
uniform sampler2D uTrail;
uniform vec2 uTexel;
uniform float uDiffuse;
uniform float uDecay;
uniform float uMemDecay;
uniform float uMemGain;
in vec2 vUv;
out vec4 o;
void main() {
  vec4 c = texture(uTrail, vUv);
  float s = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      s += texture(uTrail, vUv + vec2(float(x), float(y)) * uTexel).r;
    }
  }
  float r = mix(c.r, s / 9.0, uDiffuse) * uDecay;
  float g = c.g * uMemDecay + c.r * uMemGain;
  o = vec4(min(r, 30.0), min(g, 30.0), 0.0, 1.0);
}`;

/** Attraction field around nodes (R) and normalised distance to the nearest node (G, drives the pulse). */
export const FOOD_FS = `#version 300 es
precision highp float;
uniform vec2 uSize;
uniform float uSigma;
uniform int uNodeCount;
uniform vec2 uNodes[${MAX_NODES}];
in vec2 vUv;
out vec4 o;
void main() {
  vec2 p = vUv * uSize;
  float att = 0.0;
  float nearest = 1.0e6;
  for (int i = 0; i < ${MAX_NODES}; i++) {
    if (i >= uNodeCount) break;
    float d = length(p - uNodes[i]);
    nearest = min(nearest, d);
    float q = d / uSigma;
    att += 1.0 / (1.0 + q * q);
  }
  o = vec4(min(att, 4.0), nearest / uSize.y, 0.0, 1.0);
}`;

export const DISPLAY_FS = `#version 300 es
precision highp float;
uniform sampler2D uTrail;
uniform sampler2D uFood;
uniform sampler2D uMask;
uniform vec2 uSize;
uniform float uTime;
uniform float uPulseAmp;
uniform float uPulseSpeed;
uniform float uHasLand;
in vec2 vUv;
out vec4 o;
vec3 ramp(float x) {
  vec3 c0 = vec3(0.0);
  vec3 c1 = vec3(0.26, 0.09, 0.008);
  vec3 c2 = vec3(0.85, 0.46, 0.06);
  vec3 c3 = vec3(1.0, 0.70, 0.18);
  vec3 c4 = vec3(1.0, 0.90, 0.58);
  if (x < 0.25) return mix(c0, c1, x / 0.25);
  if (x < 0.55) return mix(c1, c2, (x - 0.25) / 0.30);
  if (x < 0.82) return mix(c2, c3, (x - 0.55) / 0.27);
  return mix(c3, c4, clamp((x - 0.82) / 0.18, 0.0, 1.0));
}
float h21(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
void main() {
  vec4 t = texture(uTrail, vUv);
  vec2 px = 1.0 / uSize;
  float b = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398;
    b += texture(uTrail, vUv + vec2(cos(a), sin(a)) * px * 4.5).r;
  }
  b /= 8.0;
  float core = t.r * 0.8 + t.g * 0.25;
  float I = 1.0 - exp(-core * 0.62);
  float nearD = texture(uFood, vUv).g;
  float wave = 0.5 + 0.5 * sin(nearD * 62.0 - uTime * uPulseSpeed);
  wave = wave * wave * wave;
  float breathe = 0.5 + 0.5 * sin(uTime * 0.9);
  I *= 1.0 + uPulseAmp * wave * smoothstep(0.05, 0.5, I) + 0.05 * breathe * I;
  vec3 col = ramp(clamp(I, 0.0, 1.0));
  float glow = 1.0 - exp(-b * 1.1);
  col += vec3(1.0, 0.52, 0.10) * glow * 0.42;

  vec4 m = texture(uMask, vUv);
  float land = m.r * uHasLand;
  col += vec3(0.020, 0.013, 0.005) * land;
  float coast = clamp(m.g, 0.0, 1.0) * uHasLand;
  col += vec3(0.60, 0.40, 0.12) * coast * 0.20;

  vec2 q = vUv - 0.5;
  col *= 1.0 - 0.55 * dot(q, q);
  col += (h21(gl_FragCoord.xy + uTime) - 0.5) / 255.0;
  o = vec4(col, 1.0);
}`;

export const NODE_VS = `#version 300 es
precision highp float;
uniform vec2 uNodes[${MAX_NODES}];
uniform float uSize;
uniform float uTime;
uniform float uBeat;
uniform int uHover;
out float vSeed;
out float vHover;
void main() {
  vec2 p = uNodes[gl_VertexID];
  vSeed = fract(sin(float(gl_VertexID) * 12.9898) * 43758.5453);
  vHover = gl_VertexID == uHover ? 1.0 : 0.0;
  float beat = 0.5 + 0.5 * sin(uTime * 2.1 * uBeat + vSeed * 6.2831);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = uSize * (1.0 + 0.10 * beat * uBeat + 0.45 * vHover);
}`;

export const NODE_FS = `#version 300 es
precision highp float;
uniform float uTime;
uniform float uBeat;
in float vSeed;
in float vHover;
out vec4 o;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float beat = 0.5 + 0.5 * sin(uTime * 2.1 * uBeat + vSeed * 6.2831);
  float core = smoothstep(0.17, 0.10, d);
  float ring = smoothstep(0.05, 0.0, abs(d - 0.36 - 0.03 * beat)) * (0.55 + 0.25 * vHover);
  float halo = exp(-d * d * 7.0) * (0.34 + 0.16 * beat + 0.3 * vHover);
  vec3 c = vec3(1.0, 0.90, 0.62) * (core + ring) + vec3(1.0, 0.55, 0.10) * halo;
  o = vec4(c, 1.0);
}`;
