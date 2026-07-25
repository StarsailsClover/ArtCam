// GLSL shader sources shared across the renderer.
//
// Coordinate conventions:
//   - Video is uploaded with UNPACK_FLIP_Y_WEBGL = true, so texture(uVideo, vec2(u, v))
//     returns the video pixel at column u (left=0) and row v (bottom=0).
//   - The composite shader handles Y mapping so the canvas displays correctly.
//
// Effect shaders receive:
//   vUv            - rect-local 0..1 uv (Y up)
//   uRectOrigin    - vec2, bottom-left of rect in canvas 0..1 space
//   uRectSize      - vec2, rect size in canvas 0..1 space
//   uVideo         - sampler2D, the live camera feed (sample at uRectOrigin + kuv * uRectSize)
//   time           - float, seconds since renderer startup
//   params[8]      - float array, per-effect parameters
//   palette[8]     - vec3 array, 8 anchor colors sampled via paletteSample(t)

export const GLSL_PREAMBLE = /* glsl */ `
// ---------- hashing ----------
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
vec2 hash22(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}
vec3 hash33(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
           dot(p, vec3(269.5, 183.3, 246.1)),
           dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453);
}

// ---------- value noise ----------
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float vnoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash33(i).x;
  float n100 = hash33(i + vec3(1, 0, 0)).x;
  float n010 = hash33(i + vec3(0, 1, 0)).x;
  float n110 = hash33(i + vec3(1, 1, 0)).x;
  float n001 = hash33(i + vec3(0, 0, 1)).x;
  float n101 = hash33(i + vec3(1, 0, 1)).x;
  float n011 = hash33(i + vec3(0, 1, 1)).x;
  float n111 = hash33(i + vec3(1, 1, 1)).x;
  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);
  float nxy0 = mix(nx00, nx10, f.y);
  float nxy1 = mix(nx01, nx11, f.y);
  return mix(nxy0, nxy1, f.z);
}

// ---------- simplex noise ----------
vec3 mod289v3(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289v2(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289v3(((x * 34.0) + 1.0) * x); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289v2(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

// ---------- fbm and ridged noise ----------
float ridge(float x) { return 1.0 - abs(x); }
float fbm(vec2 p, int octaves) {
  float v = 0.0;
  float a = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    v += a * snoise(p * freq);
    freq *= 2.0;
    a *= 0.5;
  }
  return v;
}
float fbmRidge(vec2 p, int octaves) {
  float v = 0.0;
  float a = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    v += a * ridge(snoise(p * freq));
    freq *= 2.0;
    a *= 0.5;
  }
  return v;
}
float fbmValue(vec2 p, int octaves) {
  float v = 0.0;
  float a = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    v += a * vnoise(p * freq);
    freq *= 2.0;
    a *= 0.5;
  }
  return v;
}

// ---------- domain warp ----------
// Classic Inigo Quilez two-iteration domain warp.
vec2 warp(vec2 p, float strength) {
  vec2 q = vec2(fbm(p + vec2(0.0, 0.0), 4),
                fbm(p + vec2(5.2, 1.3), 4));
  vec2 r = vec2(fbm(p + 4.0 * q + vec2(1.7, 9.2) + 0.15 * strength, 4),
                fbm(p + 4.0 * q + vec2(8.3, 2.8) + 0.13 * strength, 4));
  return p + 4.0 * r * strength;
}

// ---------- smooth min / SDFs ----------
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
float smax(float a, float b, float k) {
  return -smin(-a, -b, k);
}
float sdCircle(vec2 p, float r) { return length(p) - r; }
float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}
float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}
float sdRing(vec2 p, vec2 c, float r, float w) {
  return abs(length(p - c) - r) - w;
}
float sdLine(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

// ---------- palette ----------
vec3 paletteSample(float t) {
  t = fract(t);
  float f = t * 8.0;
  int i = int(floor(f));
  vec3 a = palette[i % 8];
  vec3 b = palette[(i + 1) % 8];
  return mix(a, b, fract(f));
}
// IQ cosine palette — derives 4 control points from palette anchors.
// Output is clamped to [0,1] so negative results don't clip to pure black.
vec3 cosPalette(float t) {
  t = fract(t);
  vec3 a = palette[0];
  vec3 b = palette[2] - palette[0];
  vec3 c = palette[4] * 2.0 + 0.5;
  vec3 d = palette[6];
  return clamp(a + b * cos(6.28318 * (c * t + d)), 0.0, 1.0);
}

// ---------- rotation / utility ----------
mat2 rot2(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c); }
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c); }
mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, -s, 0.0, s, c, 0.0, 0.0, 0.0, 1.0); }
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float tri(float x) { return abs(fract(x) - 0.5) * 2.0; }
vec2 polar(vec2 p) {
  return vec2(atan(p.y, p.x), length(p));
}
vec2 cartesian(float a, float r) {
  return vec2(cos(a), sin(a)) * r;
}
float staircase(float x, float steps) {
  return floor(x * steps) / steps;
}
`

// Fullscreen quad vertex shader. vUv is 0..1 with Y up (matches GL convention).
export const VERTEX_SHADER = /* glsl */ `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`

// Vertex shader for placing a rectangle quad in canvas-space (0..1, Y up).
export const RECT_VERTEX_SHADER = /* glsl */ `#version 300 es
in vec2 aPos;
uniform vec2 uRectOrigin;
uniform vec2 uRectSize;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  vec2 pos = uRectOrigin + vUv * uRectSize;
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}
`

// Composite shader: renders the camera frame as background, overlays the art FBO.
// When uMirror is true, the X axis is flipped for both layers so the user sees a
// selfie view, and the rectangle art stays aligned with the underlying video.
export const COMPOSITE_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uVideo;
uniform sampler2D uArt;
uniform vec2 uResolution;
uniform bool uMirror;
out vec4 fragColor;
void main() {
  vec2 uv = vUv;
  vec2 dispUv = vec2(uMirror ? 1.0 - uv.x : uv.x, uv.y);
  vec4 videoCol = texture(uVideo, dispUv);
  vec4 artCol = texture(uArt, dispUv);
  vec3 col = mix(videoCol.rgb, artCol.rgb, artCol.a);
  fragColor = vec4(col, 1.0);
}
`

// Effect shader template. `%%BODY%%` is replaced with each effect's GLSL body.
//
// Effects are TRUE visual effects applied to the camera scene: they sample
// `uVideo` (the live camera feed) and transform it. `uMask` is a person-
// segmentation mask (1 = person, 0 = background) from MediaPipe
// SelfieSegmentation, so effects can treat subject and background differently.
//
// Coordinate convention: `vUv` is rect-local 0..1 (Y up). `uRectOrigin` and
// `uRectSize` define the rect's position in canvas 0..1 space (Y up, already
// flipped from MediaPipe's top-down convention by the renderer). To sample
// the video/mask at the current rect-local uv, use the helpers below.
export const EFFECT_FRAGMENT_TEMPLATE = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uVideo;
uniform sampler2D uMask;
uniform vec2 uResolution;
uniform vec2 uRectOrigin;
uniform vec2 uRectSize;
uniform float time;
uniform float params[8];
uniform vec3 palette[8];
out vec4 fragColor;

${GLSL_PREAMBLE}

// Sample the camera frame at rect-local uv (0..1 within this rect).
vec3 sampleVideo(vec2 uv) {
  return texture(uVideo, uRectOrigin + uv * uRectSize).rgb;
}
// Sample the camera frame at an arbitrary canvas-space 0..1 position.
vec3 sampleVideoCanvas(vec2 canvasUv) {
  return texture(uVideo, canvasUv).rgb;
}
// Person mask at rect-local uv. Returns 1.0 for person, 0.0 for background.
float sampleMask(vec2 uv) {
  return texture(uMask, uRectOrigin + uv * uRectSize).r;
}
// Person mask at arbitrary canvas-space 0..1 position.
float sampleMaskCanvas(vec2 canvasUv) {
  return texture(uMask, canvasUv).r;
}

void main() {
  vec2 uv = vUv;
  vec3 col = vec3(0.0);
  float alpha = 1.0;
  %%BODY%%
  fragColor = vec4(col, alpha);
}
`
