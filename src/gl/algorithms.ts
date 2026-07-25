import type { EffectCategory } from '@/types'

// Each algorithm body is a GLSL block that transforms the camera scene.
// Available helpers (defined in shaders.ts EFFECT_FRAGMENT_TEMPLATE):
//   sampleVideo(uv)      vec3  — camera RGB at rect-local uv (0..1)
//   sampleVideoCanvas(c) vec3  — camera RGB at canvas-space 0..1 position
//   sampleMask(uv)       float — person mask at rect-local uv (1=person, 0=bg)
//   sampleMaskCanvas(c)  float — person mask at canvas-space 0..1 position
// Plus the GLSL preamble: hash, vnoise, snoise, fbm, fbmRidge, warp, smin,
// sdCircle/Box/Segment/Ring/Line, cosPalette, paletteSample, rot2, polar,
// cartesian, tri, staircase, lum, etc.
//
// Each body MUST assign `col` (vec3). `alpha` defaults to 1.0.
// `uv` is the rect-local 0..1 coordinate (Y up).

export interface Algorithm {
  name: string
  category: EffectCategory
  body: string
  params: number[]
}

export const ALGORITHMS: Algorithm[] = [
  // ====================================================================
  // Segmentation — uses person mask to treat subject vs background differently
  // ====================================================================
  {
    name: 'Silhouette',
    category: 'segmentation',
    body: `{
    vec3 v = sampleVideo(uv);
    float m = sampleMask(uv);
    float t = uv.y + time * 0.1 + params[0];
    vec3 sil = cosPalette(t);
    // Edge glow: where the mask transitions from 0 to 1.
    float edge = smoothstep(0.35, 0.65, m);
    col = mix(v, sil, m);
    col += sil * (1.0 - abs(m - 0.5) * 2.0) * 0.6;
    col += sil * edge * 0.2;
}`,
    params: [0.3, 0, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'PersonVoronoi',
    category: 'segmentation',
    body: `{
    vec3 v = sampleVideo(uv);
    float m = sampleMask(uv);
    vec2 p = uv * (8.0 + params[0] * 16.0);
    p += vec2(time * 0.1);
    vec2 ip = floor(p);
    vec2 fp = fract(p);
    float md = 1.0;
    float md2 = 1.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 n = vec2(float(i), float(j));
        vec2 pt = hash22(ip + n);
        pt = 0.5 + 0.5 * sin(time * 0.6 + 6.2831 * pt);
        float d = length(n + pt - fp);
        if (d < md) { md2 = md; md = d; }
        else if (d < md2) { md2 = d; }
      }
    }
    float t = md * 0.7 + params[1] + time * 0.05;
    vec3 gen = cosPalette(t);
    col = mix(v, gen, m);
}`,
    params: [0.5, 0.2, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'PersonFractal',
    category: 'segmentation',
    body: `{
    vec3 v = sampleVideo(uv);
    float m = sampleMask(uv);
    vec2 z = (uv - 0.5) * (2.5 + params[0] * 1.5);
    float ang = time * 0.15 + params[1] * 6.2831;
    vec2 c = vec2(0.7885 * cos(ang), 0.7885 * sin(ang));
    float iter = 0.0;
    for (int i = 0; i < 60; i++) {
      z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
      if (dot(z, z) > 16.0) break;
      iter += 1.0;
    }
    float t = iter / 60.0 + time * 0.03;
    vec3 gen = cosPalette(t);
    col = mix(v, gen, m);
}`,
    params: [0.4, 0.3, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'PersonPlasma',
    category: 'segmentation',
    body: `{
    vec3 v = sampleVideo(uv);
    float m = sampleMask(uv);
    vec2 p = (uv - 0.5) * (4.0 + params[0] * 4.0);
    float v1 = sin(p.x * 3.0 + time);
    float v2 = sin(p.y * 2.5 + time * 0.7);
    float v3 = sin((p.x + p.y) * 2.0 + time * 1.3);
    float v4 = sin(length(p) * 5.0 - time * 1.8);
    float f = (v1 + v2 + v3 + v4) * 0.125 + 0.5;
    vec3 gen = cosPalette(f + params[1] + time * 0.04);
    col = mix(v, gen, m);
}`,
    params: [0.5, 0.3, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'BgReplace',
    category: 'segmentation',
    body: `{
    vec3 v = sampleVideo(uv);
    float m = sampleMask(uv);
    vec2 p = (uv - 0.5) * (3.0 + params[0] * 4.0);
    vec2 q = vec2(fbm(p + vec2(0.0, 0.0), 4), fbm(p + vec2(5.2, 1.3), 4));
    vec2 r = vec2(fbm(p + 4.0 * q + vec2(1.7, 9.2) + 0.15 * time * 0.1, 4),
                  fbm(p + 4.0 * q + vec2(8.3, 2.8) + 0.13 * time * 0.1, 4));
    float f = fbm(p + 4.0 * r, 5);
    float t = f + 0.5 * length(r) + 0.3 * q.x + params[1] + time * 0.05;
    vec3 gen = cosPalette(t);
    col = mix(gen, v, m);
}`,
    params: [0.5, 0.3, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'BgBlur',
    category: 'segmentation',
    body: `{
    float m = sampleMask(uv);
    vec3 sharp = sampleVideo(uv);
    vec2 px = uRectSize / max(uResolution.x, uResolution.y) * 5.0;
    vec3 sum = vec3(0.0);
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        sum += sampleVideo(uv + vec2(float(i), float(j)) * px);
      }
    }
    vec3 blurred = sum / 9.0;
    float t = uv.y + params[0] + time * 0.05;
    blurred = mix(blurred, blurred * cosPalette(t), 0.4);
    col = mix(blurred, sharp, m);
}`,
    params: [0.3, 0, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'EdgePerson',
    category: 'segmentation',
    body: `{
    float m = sampleMask(uv);
    vec3 v = sampleVideo(uv);
    vec2 px = uRectSize / max(uResolution.x, uResolution.y) * 2.0;
    float m00 = sampleMask(uv + vec2(-px.x, -px.y));
    float m20 = sampleMask(uv + vec2( px.x, -px.y));
    float m01 = sampleMask(uv + vec2(-px.x,  0.0));
    float m21 = sampleMask(uv + vec2( px.x,  0.0));
    float m02 = sampleMask(uv + vec2(-px.x,  px.y));
    float m12 = sampleMask(uv + vec2( 0.0,   px.y));
    float m22 = sampleMask(uv + vec2( px.x,  px.y));
    float m10 = sampleMask(uv + vec2( 0.0,  -px.y));
    float gx = m20 + 2.0 * m21 + m22 - m00 - 2.0 * m01 - m02;
    float gy = m02 + 2.0 * m12 + m22 - m00 - 2.0 * m10 - m20;
    float edge = clamp(sqrt(gx * gx + gy * gy), 0.0, 1.0);
    vec3 edgeCol = cosPalette(edge * 4.0 + params[0] + time * 0.1);
    vec3 personCol = v + edgeCol * edge * 1.5;
    vec3 bgCol = v * 0.25;
    col = mix(bgCol, personCol, m);
}`,
    params: [0.3, 0, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'PersonMosaic',
    category: 'segmentation',
    body: `{
    float m = sampleMask(uv);
    float blocks = 8.0 + params[0] * 30.0;
    vec2 mosaicUv = floor(uv * blocks) / blocks + 0.5 / blocks;
    vec3 mosaic = sampleVideo(mosaicUv);
    vec3 sharp = sampleVideo(uv);
    col = mix(sharp, mosaic, m);
    float t = floor(uv.x * blocks) * 0.1 + floor(uv.y * blocks) * 0.1 + params[1] + time * 0.05;
    col = mix(col, col * cosPalette(t), m * 0.3);
}`,
    params: [0.5, 0.3, 0, 0, 0, 0, 0, 0],
  },

  // ====================================================================
  // Distort — geometric / field-based displacement of video pixels
  // ====================================================================
  {
    name: 'Kaleidoscope',
    category: 'distort',
    body: `{
    vec2 p = uv - 0.5;
    float r = length(p);
    float a = atan(p.y, p.x);
    float folds = floor(params[0] * 10.0) + 4.0;
    float seg = 6.2831 / folds;
    a = mod(a + time * 0.3, seg);
    a = abs(a - seg * 0.5);
    vec2 kUv = vec2(cos(a), sin(a)) * r + 0.5;
    col = sampleVideo(kUv);
    float t = r * 2.0 + params[1] + time * 0.05;
    col = mix(col, col * cosPalette(t), 0.25);
}`,
    params: [0.6, 0.3, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'LiquidWarp',
    category: 'distort',
    body: `{
    vec2 p = (uv - 0.5) * (3.0 + params[0] * 4.0);
    vec2 q = vec2(fbm(p + vec2(0.0, 0.0) + time * 0.1, 4),
                  fbm(p + vec2(5.2, 1.3) + time * 0.1, 4));
    vec2 r = vec2(fbm(p + 4.0 * q + vec2(1.7, 9.2), 4),
                  fbm(p + 4.0 * q + vec2(8.3, 2.8), 4));
    vec2 warpedUv = uv + (r - 0.5) * 0.3;
    col = sampleVideo(warpedUv);
    float t = length(r) + params[1] + time * 0.05;
    col = mix(col, col * cosPalette(t), 0.3);
}`,
    params: [0.5, 0.3, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'FlowDisplace',
    category: 'distort',
    body: `{
    vec2 p = (uv - 0.5) * (3.0 + params[0] * 4.0);
    vec2 flow = vec2(fbm(p + time * 0.2, 4), fbm(p + 5.0 - time * 0.2, 4)) - 0.5;
    vec2 dispUv = uv + flow * 0.25;
    col = sampleVideo(dispUv);
    float mag = length(flow);
    col += cosPalette(mag * 2.0 + params[1] + time * 0.1) * mag * 0.3;
}`,
    params: [0.5, 0.3, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'WaveDistort',
    category: 'distort',
    body: `{
    float amp = 0.04 + params[0] * 0.12;
    float freq = 5.0 + params[1] * 20.0;
    vec2 dispUv = uv + vec2(
      sin(uv.y * freq + time * 2.0) * amp,
      cos(uv.x * freq + time * 1.7) * amp
    );
    col = sampleVideo(dispUv);
    float t = uv.x + uv.y + time * 0.05;
    col = mix(col, col * cosPalette(t), 0.15);
}`,
    params: [0.5, 0.4, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'RGBShift',
    category: 'distort',
    body: `{
    float shift = 0.005 + params[0] * 0.04;
    float ang = time * 0.3;
    vec2 dir = vec2(cos(ang), sin(ang)) * shift;
    vec3 vR = sampleVideo(uv + dir);
    vec3 vG = sampleVideo(uv);
    vec3 vB = sampleVideo(uv - dir);
    col = vec3(vR.r, vG.g, vB.b);
    float fringe = abs(vR.r - vB.b) + abs(vG.g - vR.r);
    col += cosPalette(fringe * 5.0 + params[1] + time * 0.1) * fringe * 0.5;
}`,
    params: [0.4, 0.3, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'SpiralWarp',
    category: 'distort',
    body: `{
    vec2 p = uv - 0.5;
    float r = length(p);
    float a = atan(p.y, p.x);
    float twist = (1.0 - r) * (3.0 + params[0] * 5.0) + time * 0.5;
    a += twist;
    vec2 sUv = vec2(cos(a), sin(a)) * r + 0.5;
    col = sampleVideo(sUv);
    float t = r * 2.0 + params[1] + time * 0.05;
    col = mix(col, col * cosPalette(t), 0.25);
}`,
    params: [0.5, 0.3, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'Mosaic',
    category: 'distort',
    body: `{
    float blocks = 8.0 + params[0] * 40.0;
    vec2 mosaicUv = floor(uv * blocks) / blocks + 0.5 / blocks;
    col = sampleVideo(mosaicUv);
    float t = floor(uv.x * blocks) * 0.1 + floor(uv.y * blocks) * 0.1 + params[1] + time * 0.05;
    col = mix(col, col * cosPalette(t), 0.2);
}`,
    params: [0.5, 0.3, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'PixelSort',
    category: 'distort',
    body: `{
    vec3 v = sampleVideo(uv);
    float l = lum(v);
    float sortOffset = (l - 0.5) * (0.1 + params[0] * 0.3) * sin(time * 0.5 + uv.y * 10.0);
    vec3 sorted = sampleVideo(uv + vec2(sortOffset, 0.0));
    col = mix(v, sorted, 0.7);
    float t = l + params[1] + time * 0.05;
    col = mix(col, col * cosPalette(t), 0.2);
}`,
    params: [0.5, 0.3, 0, 0, 0, 0, 0, 0],
  },

  // ====================================================================
  // Stylize — non-photorealistic rendering of the video
  // ====================================================================
  {
    name: 'Halftone',
    category: 'stylize',
    body: `{
    float dpi = 8.0 + params[0] * 30.0;
    vec2 gp = uv * dpi;
    vec2 ip = floor(gp);
    vec2 fp = fract(gp) - 0.5;
    vec2 cellUv = (ip + 0.5) / dpi;
    vec3 v = sampleVideo(cellUv);
    float l = lum(v);
    float dotRadius = (1.0 - l) * 0.55;
    float d = length(fp);
    float dot = smoothstep(dotRadius + 0.05, dotRadius - 0.05, d);
    float t = l + params[1] + time * 0.05;
    vec3 ink = cosPalette(t);
    vec3 paper = mix(vec3(1.0), ink, 0.1);
    col = mix(paper, ink, dot);
}`,
    params: [0.5, 0.3, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'ASCII',
    category: 'stylize',
    body: `{
    float chars = 12.0 + params[0] * 24.0;
    vec2 aspect = vec2(chars * 0.6, chars);
    vec2 gp = uv * aspect;
    vec2 ip = floor(gp);
    vec2 fp = fract(gp) - 0.5;
    vec2 cellUv = (ip + 0.5) / aspect;
    vec3 v = sampleVideo(cellUv);
    float l = lum(v);
    float density = pow(l, 1.5);
    float d = length(fp);
    float chr = smoothstep(density * 0.5 + 0.05, density * 0.5 - 0.05, d);
    float charSeed = hash21(ip);
    chr *= step(0.2, charSeed + l * 0.8);
    float t = l + params[1] + time * 0.05;
    vec3 ink = cosPalette(t);
    col = mix(vec3(0.02), ink, chr);
}`,
    params: [0.5, 0.3, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'Pointillism',
    category: 'stylize',
    body: `{
    float density = 20.0 + params[0] * 40.0;
    vec2 p = uv * density;
    vec2 ip = floor(p);
    vec2 fp = fract(p) - 0.5;
    vec2 jitter = (hash22(ip) - 0.5) * 0.8;
    vec2 cellUv = (ip + 0.5 + jitter) / density;
    vec3 v = sampleVideo(cellUv);
    float d = length(fp - jitter);
    float dot = smoothstep(0.45, 0.3, d);
    float t = lum(v) + params[1] + time * 0.05;
    col = mix(vec3(0.0), cosPalette(t) * v * 2.0, dot);
}`,
    params: [0.5, 0.3, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'OilPaint',
    category: 'stylize',
    body: `{
    vec2 px = uRectSize / max(uResolution.x, uResolution.y) * 2.0;
    vec3 v = sampleVideo(uv);
    vec3 m = v;
    float maxL = lum(v);
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec3 s = sampleVideo(uv + vec2(float(i), float(j)) * px);
        float l = lum(s);
        if (l > maxL) { maxL = l; m = s; }
      }
    }
    col = m;
    float t = maxL + params[0] + time * 0.05;
    col = mix(col, col * cosPalette(t), 0.3);
}`,
    params: [0.3, 0, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'EdgeTrace',
    category: 'stylize',
    body: `{
    vec2 px = uRectSize / max(uResolution.x, uResolution.y) * 2.0;
    float l00 = lum(sampleVideo(uv + vec2(-px.x, -px.y)));
    float l10 = lum(sampleVideo(uv + vec2( 0.0,  -px.y)));
    float l20 = lum(sampleVideo(uv + vec2( px.x, -px.y)));
    float l01 = lum(sampleVideo(uv + vec2(-px.x,  0.0)));
    float l21 = lum(sampleVideo(uv + vec2( px.x,  0.0)));
    float l02 = lum(sampleVideo(uv + vec2(-px.x,  px.y)));
    float l12 = lum(sampleVideo(uv + vec2( 0.0,   px.y)));
    float l22 = lum(sampleVideo(uv + vec2( px.x,  px.y)));
    float gx = l20 + 2.0 * l21 + l22 - l00 - 2.0 * l01 - l02;
    float gy = l02 + 2.0 * l12 + l22 - l00 - 2.0 * l10 - l20;
    float edge = clamp(sqrt(gx * gx + gy * gy), 0.0, 1.0);
    vec3 v = sampleVideo(uv);
    float t = edge * 3.0 + params[0] + time * 0.05;
    vec3 edgeCol = cosPalette(t);
    col = mix(v * 0.3, edgeCol, edge);
}`,
    params: [0.3, 0, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'Posterize',
    category: 'stylize',
    body: `{
    vec3 v = sampleVideo(uv);
    float levels = 3.0 + params[0] * 6.0;
    vec2 bp = floor(uv * uResolution * 0.5);
    float dither = (hash21(bp) - 0.5) / levels;
    v += dither;
    v = floor(v * levels + 0.5) / levels;
    float t = lum(v) + params[1] + time * 0.05;
    col = mix(v, v * cosPalette(t), 0.4);
}`,
    params: [0.5, 0.3, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'Crosshatch',
    category: 'stylize',
    body: `{
    vec3 v = sampleVideo(uv);
    float l = lum(v);
    float density = 5.0 + params[0] * 20.0;
    float h1 = 1.0 - smoothstep(0.0, 0.02, abs(fract(uv.x * density + time * 0.1) - 0.5));
    float h2 = 1.0 - smoothstep(0.0, 0.02, abs(fract(uv.y * density + time * 0.1) - 0.5));
    float h3 = 1.0 - smoothstep(0.0, 0.02, abs(fract((uv.x + uv.y) * density + time * 0.1) - 0.5));
    float h4 = 1.0 - smoothstep(0.0, 0.02, abs(fract((uv.x - uv.y) * density + time * 0.1) - 0.5));
    float ink = 0.0;
    ink = max(ink, h1 * (1.0 - smoothstep(0.6, 0.75, l)));
    ink = max(ink, h2 * (1.0 - smoothstep(0.35, 0.5, l)));
    ink = max(ink, h3 * (1.0 - smoothstep(0.1, 0.25, l)));
    ink = max(ink, h4 * (1.0 - smoothstep(0.0, 0.1, l)));
    float t = l + params[1] + time * 0.05;
    col = mix(vec3(1.0), cosPalette(t), ink);
}`,
    params: [0.5, 0.3, 0, 0, 0, 0, 0, 0],
  },

  // ====================================================================
  // Color — palette-driven color grading of the video
  // ====================================================================
  {
    name: 'PaletteMap',
    category: 'color',
    body: `{
    vec3 v = sampleVideo(uv);
    float l = lum(v);
    float t = l + params[0] + time * 0.05;
    vec3 mapped = cosPalette(t);
    col = mapped * l;
}`,
    params: [0.3, 0, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'DuoTone',
    category: 'color',
    body: `{
    vec3 v = sampleVideo(uv);
    float l = lum(v);
    vec3 dark = cosPalette(params[0] + time * 0.05);
    vec3 light = cosPalette(params[1] + time * 0.05 + 0.3);
    col = mix(dark, light, l);
}`,
    params: [0.3, 0.6, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'NeonGlow',
    category: 'color',
    body: `{
    vec2 px = uRectSize / max(uResolution.x, uResolution.y) * 2.0;
    float l00 = lum(sampleVideo(uv + vec2(-px.x, -px.y)));
    float l10 = lum(sampleVideo(uv + vec2( 0.0,  -px.y)));
    float l20 = lum(sampleVideo(uv + vec2( px.x, -px.y)));
    float l01 = lum(sampleVideo(uv + vec2(-px.x,  0.0)));
    float l21 = lum(sampleVideo(uv + vec2( px.x,  0.0)));
    float l02 = lum(sampleVideo(uv + vec2(-px.x,  px.y)));
    float l12 = lum(sampleVideo(uv + vec2( 0.0,   px.y)));
    float l22 = lum(sampleVideo(uv + vec2( px.x,  px.y)));
    float gx = l20 + 2.0 * l21 + l22 - l00 - 2.0 * l01 - l02;
    float gy = l02 + 2.0 * l12 + l22 - l00 - 2.0 * l10 - l20;
    float edge = clamp(sqrt(gx * gx + gy * gy), 0.0, 1.0);
    vec3 v = sampleVideo(uv);
    float t = edge * 4.0 + params[0] + time * 0.2;
    vec3 neon = cosPalette(t);
    col = v * 0.15 + neon * edge * 1.5;
    col += neon * edge * edge * 0.5;
}`,
    params: [0.3, 0, 0, 0, 0, 0, 0, 0],
  },

  // ====================================================================
  // Feedback — motion / time-based effects (simulated via spatial sampling)
  // ====================================================================
  {
    name: 'EchoTrail',
    category: 'feedback',
    body: `{
    vec2 dir = vec2(cos(time * 0.5), sin(time * 0.5)) * (0.02 + params[0] * 0.06);
    vec3 v0 = sampleVideo(uv);
    vec3 v1 = sampleVideo(uv - dir);
    vec3 v2 = sampleVideo(uv - dir * 2.0);
    float l0 = lum(v0);
    float l1 = lum(v1);
    float l2 = lum(v2);
    vec3 c0 = cosPalette(l0 + params[1] + time * 0.05);
    vec3 c1 = cosPalette(l1 + params[1] + 0.2 + time * 0.05);
    vec3 c2 = cosPalette(l2 + params[1] + 0.4 + time * 0.05);
    col = c0 * 0.5 + c1 * 0.3 + c2 * 0.2;
}`,
    params: [0.4, 0.3, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'MotionBlur',
    category: 'feedback',
    body: `{
    vec2 dir = vec2(cos(time * 0.3 + params[0] * 6.28), sin(time * 0.3 + params[0] * 6.28)) * (0.01 + params[1] * 0.05);
    vec3 sum = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      float fi = float(i);
      sum += sampleVideo(uv + dir * (fi - 3.5));
    }
    col = sum / 8.0;
    float t = lum(col) + params[0] + time * 0.05;
    col = mix(col, col * cosPalette(t), 0.2);
}`,
    params: [0.3, 0.4, 0, 0, 0, 0, 0, 0],
  },

  // ====================================================================
  // Glitch — CRT / VHS / datamosh-style effects
  // ====================================================================
  {
    name: 'ScanlineCRT',
    category: 'glitch',
    body: `{
    vec2 p = uv - 0.5;
    float r2 = dot(p, p);
    vec2 distorted = uv + p * r2 * (0.1 + params[0] * 0.2);
    vec3 v = sampleVideo(clamp(distorted, 0.0, 1.0));
    float scan = 0.7 + 0.3 * sin(distorted.y * uResolution.y * 1.5);
    v *= scan;
    v.r *= 0.8 + 0.2 * sin(distorted.x * uResolution.x * 3.14);
    v.g *= 0.8 + 0.2 * sin(distorted.x * uResolution.x * 3.14 + 2.09);
    v.b *= 0.8 + 0.2 * sin(distorted.x * uResolution.x * 3.14 + 4.18);
    v *= 1.0 - r2 * 0.6;
    float t = lum(v) + params[1] + time * 0.05;
    col = mix(v, v * cosPalette(t), 0.2);
}`,
    params: [0.4, 0.3, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'VHSNoise',
    category: 'glitch',
    body: `{
    float trackLine = sin(uv.y * 8.0 + time * 2.0);
    float jitter = (hash21(vec2(floor(uv.y * 200.0), floor(time * 30.0))) - 0.5) * 0.02 * params[0];
    vec2 dispUv = uv + vec2(jitter + trackLine * 0.005, 0.0);
    vec3 v = sampleVideo(dispUv);
    v.r = lum(sampleVideo(dispUv + vec2(0.005, 0.0)));
    v.b = lum(sampleVideo(dispUv - vec2(0.005, 0.0)));
    float noise = hash21(uv * 1000.0 + time) * 0.15;
    v += noise;
    v *= 0.85 + 0.15 * sin(uv.y * uResolution.y);
    float t = lum(v) + params[1] + time * 0.05;
    col = mix(v, v * cosPalette(t), 0.3);
}`,
    params: [0.5, 0.3, 0, 0, 0, 0, 0, 0],
  },
]
