import type { EffectCategory } from '@/types'

// Each algorithm body is a GLSL block that:
//   - reads `uv` (vec2, 0..1 within the rectangle, Y up)
//   - reads `time` (float, seconds)
//   - reads `params` (float[8], each in 0..1 unless noted)
//   - reads `palette` (vec3[8]) and uses paletteSample(t) / cosPalette(t)
//   - has access to a rich GLSL preamble (see shaders.ts): hash, vnoise, snoise,
//     fbm, fbmRidge, fbmValue, warp, smin, sdCircle/Box/Segment/Ring/Line,
//     rot2, rotX/Y/Z, polar, cartesian, tri, staircase, lum.
//   - MUST assign `col` (vec3). May also assign `alpha` (float, defaults 1.0).
//
// Algorithms are intentionally pure-generative — they do NOT sample uVideo.
// This keeps the art visually distinctive and avoids the "filter pasted over
// the camera" look that the previous generation of effects had.

export interface Algorithm {
  name: string
  category: EffectCategory
  body: string
  params: number[]
}

export const ALGORITHMS: Algorithm[] = [
  // ====================================================================
  // Fractals
  // ====================================================================
  {
    name: 'JuliaSet',
    category: 'fractal',
    body: `{
    vec2 z = (uv - 0.5) * (2.5 + params[0] * 1.5);
    float ang = time * 0.15 + params[1] * 6.2831;
    vec2 c = vec2(0.7885 * cos(ang), 0.7885 * sin(ang));
    float iter = 0.0;
    const float N = 80.0;
    for (int i = 0; i < 80; i++) {
      z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
      if (dot(z, z) > 16.0) break;
      iter += 1.0;
    }
    float sm = iter - log2(log2(max(dot(z, z), 1.0))) + 4.0;
    float t = sm / N + time * 0.03;
    col = cosPalette(t);
    col = pow(col, vec3(0.85));
}`,
    params: [0.4, 0.3, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'Mandelbrot',
    category: 'fractal',
    body: `{
    float zoom = 1.4 + 0.8 * sin(time * 0.1) + params[0];
    vec2 c = (uv - 0.5) * zoom + vec2(-0.5, 0.0);
    vec2 z = vec2(0.0);
    float iter = 0.0;
    const float N = 80.0;
    for (int i = 0; i < 80; i++) {
      z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
      if (dot(z, z) > 16.0) break;
      iter += 1.0;
    }
    float sm = iter - log2(log2(max(dot(z, z), 1.0)));
    float t = sm / N + params[1] + time * 0.04;
    col = cosPalette(t);
    if (iter >= N) col = vec3(0.0);
}`,
    params: [0.4, 0.2, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'BurningShip',
    category: 'fractal',
    body: `{
    float zoom = 1.6 + 0.4 * sin(time * 0.1) + params[0];
    vec2 c = (uv - 0.5) * zoom + vec2(-0.5, -0.5);
    vec2 z = vec2(0.0);
    float iter = 0.0;
    const float N = 80.0;
    for (int i = 0; i < 80; i++) {
      z = vec2(z.x * z.x - z.y * z.y, 2.0 * abs(z.x * z.y)) + c;
      if (dot(z, z) > 16.0) break;
      iter += 1.0;
    }
    float t = iter / N + params[1] + time * 0.04;
    col = cosPalette(t);
    if (iter >= N) col *= 0.1;
}`,
    params: [0.4, 0.2, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'Newton',
    category: 'fractal',
    body: `{
    // Newton iteration for z^3 - 1 = 0.
    vec2 z = (uv - 0.5) * 3.0 * (1.0 + params[0]);
    float iter = 0.0;
    vec2 root = vec2(0.0);
    for (int i = 0; i < 30; i++) {
      // z' = z - (z^3 - 1) / (3 z^2)
      float r2 = dot(z, z);
      if (r2 < 1e-6) break;
      vec2 z2 = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y);
      vec2 z3 = vec2(z2.x * z.x - z2.y * z.y, z2.x * z.y + z2.y * z.x);
      vec2 num = z3 - vec2(1.0, 0.0);
      vec2 den = 3.0 * z2;
      // complex divide num/den
      float dr = 1.0 / dot(den, den);
      vec2 q = vec2(num.x * den.x + num.y * den.y, num.y * den.x - num.x * den.y) * dr;
      z -= q;
      iter += 1.0;
    }
    // Determine which root (1, omega, omega^2) it converged to.
    float a = atan(z.y, z.x);
    float rootId = floor((a + 3.14159) / 2.0944);  // 2pi/3
    float t = iter / 30.0 + rootId / 3.0 + params[1] + time * 0.05;
    col = cosPalette(t);
}`,
    params: [0.3, 0.2, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'Tricorn',
    category: 'fractal',
    body: `{
    // Mandelbar / Tricorn: z_{n+1} = conj(z)^2 + c
    float zoom = 1.5 + 0.4 * sin(time * 0.1) + params[0];
    vec2 c = (uv - 0.5) * zoom;
    vec2 z = vec2(0.0);
    float iter = 0.0;
    const float N = 70.0;
    for (int i = 0; i < 70; i++) {
      z = vec2(z.x * z.x - z.y * z.y, -2.0 * z.x * z.y) + c;
      if (dot(z, z) > 16.0) break;
      iter += 1.0;
    }
    float t = iter / N + params[1] + time * 0.04;
    col = cosPalette(t);
    if (iter >= N) col *= 0.1;
}`,
    params: [0.4, 0.2, 0, 0, 0, 0, 0, 0],
  },

  // ====================================================================
  // Strange Attractors
  // ====================================================================
  {
    name: 'Clifford',
    category: 'attractor',
    body: `{
    // Clifford attractor — sample (x0,y0) = uv mapped to [-2,2].
    vec2 p = (uv - 0.5) * 4.0;
    float a = 1.7 + 0.2 * sin(time * 0.13 + params[0] * 3.0);
    float b = 1.3 + 0.2 * cos(time * 0.11 + params[1] * 3.0);
    float c = 1.7 + 0.2 * sin(time * 0.09 + params[2] * 3.0);
    float d = 0.9 + 0.2 * cos(time * 0.07 + params[3] * 3.0);
    vec2 z = p;
    float acc = 0.0;
    for (int i = 0; i < 40; i++) {
      vec2 nz = vec2(sin(a * z.y) + c * cos(a * z.x),
                     sin(b * z.x) + d * cos(b * z.y));
      z = nz;
      acc += 0.025;
      if (dot(z, z) > 100.0) break;
    }
    float t = acc * 0.5 + length(z) * 0.1 + time * 0.05;
    col = cosPalette(t);
    col *= 0.4 + 0.6 * smoothstep(0.0, 4.0, length(z));
}`,
    params: [0.4, 0.5, 0.6, 0.5, 0, 0, 0, 0],
  },
  {
    name: 'DeJong',
    category: 'attractor',
    body: `{
    vec2 p = (uv - 0.5) * 4.0;
    float a = 1.6 + 0.3 * sin(time * 0.1 + params[0] * 3.0);
    float b = 1.2 + 0.3 * cos(time * 0.13 + params[1] * 3.0);
    float c = 1.4 + 0.3 * sin(time * 0.08 + params[2] * 3.0);
    float d = 1.0 + 0.3 * cos(time * 0.11 + params[3] * 3.0);
    vec2 z = p;
    for (int i = 0; i < 50; i++) {
      vec2 nz = vec2(sin(a * z.y) - cos(b * z.x),
                     sin(c * z.x) - cos(d * z.y));
      z = nz;
    }
    float t = atan(z.y, z.x) / 6.2831 + 0.5 + length(z) * 0.1 + time * 0.05;
    col = cosPalette(t);
    col *= 0.5 + 0.5 * smoothstep(0.0, 2.5, length(z));
}`,
    params: [0.5, 0.4, 0.5, 0.4, 0, 0, 0, 0],
  },
  {
    name: 'Pickover',
    category: 'attractor',
    body: `{
    // Pickover attractor — 2D map variant.
    vec2 p = (uv - 0.5) * 3.0;
    vec2 z = p;
    float a = 2.24 + 0.1 * sin(time * 0.12);
    float b = 0.43 + 0.05 * cos(time * 0.15) + params[0] * 0.3;
    float c = -0.65 - 0.05 * sin(time * 0.10) + params[1] * 0.3;
    float d = -2.43 - 0.1 * cos(time * 0.13) + params[2] * 0.3;
    float e = 0.55 + 0.05 * sin(time * 0.09) + params[3] * 0.3;
    for (int i = 0; i < 30; i++) {
      vec2 nz;
      nz.x = sin(a * z.y) - cos(b * z.x);
      nz.y = sin(c * z.x) - cos(d * z.y) + e * sin(z.x + z.y);
      z = nz;
    }
    float t = length(z) * 0.25 + atan(z.y, z.x) / 6.2831 + 0.5 + time * 0.05;
    col = cosPalette(t);
}`,
    params: [0.5, 0.4, 0.5, 0.4, 0, 0, 0, 0],
  },
  {
    name: 'Lorenz',
    category: 'attractor',
    body: `{
    // Lorenz attractor projected to XY plane, parameterized by uv.y
    float t0 = uv.x * 8.0 + time * 0.5;
    float z0 = (uv.y - 0.5) * 6.0;
    vec3 p = vec3(0.1, 0.0, z0);
    float sigma = 10.0 + params[0] * 4.0;
    float rho = 28.0;
    float beta = 8.0 / 3.0;
    float dt = 0.01;
    for (int i = 0; i < 60; i++) {
      vec3 d;
      d.x = sigma * (p.y - p.x);
      d.y = p.x * (rho - p.z) - p.y;
      d.z = p.x * p.y - beta * p.z;
      p += d * dt;
      if (float(i) > t0 * 7.5) break;
    }
    float t = (p.x + 25.0) / 50.0 + params[1] + time * 0.03;
    col = cosPalette(t);
    col *= 0.5 + 0.5 * smoothstep(0.0, 30.0, abs(p.z));
}`,
    params: [0.4, 0.2, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'Henon',
    category: 'attractor',
    body: `{
    vec2 z = (uv - 0.5) * 2.0;
    float a = 1.4 + 0.05 * sin(time * 0.1 + params[0] * 3.0);
    float b = 0.3 + 0.02 * cos(time * 0.13 + params[1] * 3.0);
    float acc = 0.0;
    for (int i = 0; i < 40; i++) {
      vec2 nz = vec2(1.0 - a * z.x * z.x + z.y, b * z.x);
      z = nz;
      acc += 0.025;
      if (dot(z, z) > 100.0) break;
    }
    float t = acc * 0.5 + length(z) * 0.15 + time * 0.04 + params[2];
    col = cosPalette(t);
}`,
    params: [0.5, 0.4, 0.2, 0, 0, 0, 0, 0],
  },

  // ====================================================================
  // Domain Warp & Flow
  // ====================================================================
  {
    name: 'DomainWarp',
    category: 'noise',
    body: `{
    vec2 p = (uv - 0.5) * (3.0 + params[0] * 4.0);
    p += vec2(time * 0.07, time * 0.05);
    vec2 q = vec2(fbm(p + vec2(0.0, 0.0), 5),
                  fbm(p + vec2(5.2, 1.3), 5));
    vec2 r = vec2(fbm(p + 4.0 * q + vec2(1.7, 9.2) + 0.15 * time * 0.1, 5),
                  fbm(p + 4.0 * q + vec2(8.3, 2.8) + 0.13 * time * 0.1, 5));
    float f = fbm(p + 4.0 * r, 5);
    float t = f + 0.5 * length(r) + 0.3 * q.x + params[1] + time * 0.05;
    col = cosPalette(t);
    col = pow(col, vec3(0.85));
}`,
    params: [0.6, 0.3, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'FlowField',
    category: 'noise',
    body: `{
    vec2 p = (uv - 0.5) * (3.0 + params[0] * 4.0);
    float t = time * 0.15;
    vec2 path = p;
    for (int i = 0; i < 12; i++) {
      float fi = float(i);
      vec2 f = vec2(fbm(path + t + fi, 3),
                    fbm(path - t + fi * 1.7, 3)) - 0.5;
      path += f * 0.4 * rot2(time * 0.05 + fi);
    }
    float v = fbm(path * 1.5 + t, 5);
    float t2 = v + length(path - p) * 0.2 + params[1] + time * 0.05;
    col = cosPalette(t2);
    col += 0.15 * paletteSample(v * 4.0 + time * 0.1);
}`,
    params: [0.5, 0.3, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'CurlNoise',
    category: 'noise',
    body: `{
    vec2 p = (uv - 0.5) * (4.0 + params[0] * 4.0);
    float t = time * 0.2;
    // Approximate curl of a noise-derived potential field.
    float eps = 0.01;
    float n_xp = fbm(p + vec2(eps, 0.0), 4);
    float n_xm = fbm(p - vec2(eps, 0.0), 4);
    float n_yp = fbm(p + vec2(0.0, eps), 4);
    float n_ym = fbm(p - vec2(0.0, eps), 4);
    vec2 curl = vec2(n_yp - n_ym, -(n_xp - n_xm)) / (2.0 * eps);
    // Advect the sampling point along the curl.
    vec2 adv = p + curl * 0.05 * sin(t);
    float v = fbm(adv + t, 5);
    float mag = length(curl) * 0.5;
    float t2 = v + mag + params[1] + time * 0.05;
    col = cosPalette(t2);
    col *= 0.5 + 0.5 * mag;
}`,
    params: [0.5, 0.3, 0, 0, 0, 0, 0, 0],
  },

  // ====================================================================
  // Noise Field
  // ====================================================================
  {
    name: 'FBMRidge',
    category: 'noise',
    body: `{
    vec2 p = (uv - 0.5) * (3.0 + params[0] * 4.0);
    p *= rot2(time * 0.08);
    p += vec2(time * 0.05, 0.0);
    float r = fbmRidge(p, 6);
    float f = fbm(p * 0.7 + r, 4);
    float t = r * 0.6 + f * 0.4 + params[1] + time * 0.05;
    col = cosPalette(t);
    col = pow(col, vec3(0.9));
}`,
    params: [0.6, 0.3, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'Voronoi',
    category: 'noise',
    body: `{
    vec2 p = uv * (8.0 + params[0] * 16.0);
    p += vec2(time * 0.1, time * 0.07);
    vec2 ip = floor(p);
    vec2 fp = fract(p);
    float md = 1.0;
    float md2 = 1.0;
    vec2 closest = vec2(0.0);
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 n = vec2(float(i), float(j));
        vec2 pt = hash22(ip + n);
        pt = 0.5 + 0.5 * sin(time * 0.6 + 6.2831 * pt);
        float d = length(n + pt - fp);
        if (d < md) { md2 = md; md = d; closest = pt; }
        else if (d < md2) { md2 = d; }
      }
    }
    float edge = smoothstep(0.0, 0.05, md2 - md);
    float t = md * 0.7 + closest.x + params[1] + time * 0.05;
    col = cosPalette(t);
    col *= 0.3 + 0.7 * edge;
    col += paletteSample(closest.y * 3.0) * (1.0 - edge) * 0.4;
}`,
    params: [0.5, 0.2, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'Worley',
    category: 'noise',
    body: `{
    vec2 p = uv * (8.0 + params[0] * 16.0);
    p += vec2(time * 0.07);
    vec2 ip = floor(p);
    vec2 fp = fract(p);
    float md = 1.0;
    float md2 = 1.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 n = vec2(float(i), float(j));
        vec2 pt = hash22(ip + n);
        pt = 0.5 + 0.5 * sin(time * 0.4 + 6.2831 * pt);
        float d = length(n + pt - fp);
        if (d < md) { md2 = md; md = d; }
        else if (d < md2) { md2 = d; }
      }
    }
    // F2 - F1 gives cellular edge highlight.
    float edge = md2 - md;
    float t = (1.0 - md) * 0.7 + edge * 1.5 + params[1] + time * 0.05;
    col = cosPalette(t);
    col *= 0.4 + 0.6 * smoothstep(0.0, 0.4, edge);
}`,
    params: [0.5, 0.2, 0, 0, 0, 0, 0, 0],
  },

  // ====================================================================
  // Sacred Geometry
  // ====================================================================
  {
    name: 'FlowerOfLife',
    category: 'geometric',
    body: `{
    vec2 p = (uv - 0.5) * (6.0 + params[0] * 6.0);
    p *= rot2(time * 0.1);
    float scale = 1.0;
    float d = 1e9;
    // 19 circle centers of the Flower of Life (radius 1).
    vec2 centers[19];
    centers[0]  = vec2( 0.0,  0.0);
    centers[1]  = vec2( 1.0,  0.0);
    centers[2]  = vec2(-1.0,  0.0);
    centers[3]  = vec2( 0.5,  0.866);
    centers[4]  = vec2(-0.5,  0.866);
    centers[5]  = vec2( 0.5, -0.866);
    centers[6]  = vec2(-0.5, -0.866);
    centers[7]  = vec2( 1.5,  0.866);
    centers[8]  = vec2(-1.5,  0.866);
    centers[9]  = vec2( 1.5, -0.866);
    centers[10] = vec2(-1.5, -0.866);
    centers[11] = vec2( 2.0,  0.0);
    centers[12] = vec2(-2.0,  0.0);
    centers[13] = vec2( 0.0,  1.732);
    centers[14] = vec2( 0.0, -1.732);
    centers[15] = vec2( 1.0,  1.732);
    centers[16] = vec2(-1.0,  1.732);
    centers[17] = vec2( 1.0, -1.732);
    centers[18] = vec2(-1.0, -1.732);
    for (int i = 0; i < 19; i++) {
      d = min(d, abs(length(p - centers[i]) - 1.0));
    }
    float ring = smoothstep(0.05, 0.0, d);
    float glow = 0.04 / (d + 0.04);
    float t = length(p) * 0.2 + params[1] + time * 0.05;
    col = cosPalette(t) * ring + cosPalette(t + 0.3) * glow * 0.4;
}`,
    params: [0.5, 0.3, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'Metatron',
    category: 'geometric',
    body: `{
    vec2 p = (uv - 0.5) * (5.0 + params[0] * 5.0);
    p *= rot2(time * 0.12);
    // Concentric rotating rings.
    float d = 1e9;
    for (int i = 0; i < 5; i++) {
      float fi = float(i) + 1.0;
      float r = fi * 0.6;
      float aOff = time * (0.1 + 0.04 * fi) + fi * 0.7;
      vec2 c = vec2(cos(aOff), sin(aOff)) * 0.3 * fi;
      d = smin(d, abs(length(p - c) - r), 0.05);
    }
    float ring = smoothstep(0.05, 0.0, d);
    float glow = 0.05 / (d + 0.05);
    float t = length(p) * 0.15 + params[1] + time * 0.05;
    col = cosPalette(t) * ring + cosPalette(t + 0.4) * glow * 0.5;
}`,
    params: [0.5, 0.3, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'SriYantra',
    category: 'geometric',
    body: `{
    vec2 p = (uv - 0.5) * (4.0 + params[0] * 4.0);
    p *= rot2(time * 0.08);
    // 9 interlocking triangles — approximate by 9 line-SDFs.
    float d = 1e9;
    for (int i = 0; i < 9; i++) {
      float fi = float(i);
      float a = fi * 0.3491 + time * 0.05 + params[1] * 3.14;
      vec2 dir = vec2(cos(a), sin(a));
      vec2 perp = vec2(-dir.y, dir.x);
      float size = 1.0 + 0.08 * sin(fi * 1.7 + time * 0.4);
      vec2 a1 = dir * size + perp * size;
      vec2 a2 = dir * size - perp * size;
      vec2 b1 = -dir * size + perp * size;
      vec2 b2 = -dir * size - perp * size;
      d = smin(d, sdSegment(p, a1, b2), 0.03);
      d = smin(d, sdSegment(p, a2, b1), 0.03);
    }
    float line = smoothstep(0.04, 0.0, d);
    float glow = 0.04 / (d + 0.04);
    float t = length(p) * 0.2 + time * 0.05;
    col = cosPalette(t) * line + cosPalette(t + 0.3) * glow * 0.5;
}`,
    params: [0.4, 0.3, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'Mandala',
    category: 'geometric',
    body: `{
    vec2 p = (uv - 0.5) * (3.0 + params[0] * 4.0);
    float r = length(p);
    float a = atan(p.y, p.x);
    float petals = floor(params[1] * 14.0) + 6.0;
    float seg = 6.2831 / petals;
    a = mod(a + time * 0.2, seg);
    a = abs(a - seg * 0.5);
    vec2 polarP = vec2(cos(a), sin(a)) * r;
    float wave = 0.5 + 0.5 * cos(r * 12.0 - time * 1.5 + a * 4.0);
    float ring = 0.5 + 0.5 * sin(r * 8.0 - time * 0.8);
    float t = wave * 0.5 + ring * 0.3 + polarP.x * 0.3 + time * 0.05;
    col = cosPalette(t);
    col *= 0.6 + 0.4 * wave;
}`,
    params: [0.6, 0.5, 0, 0, 0, 0, 0, 0],
  },

  // ====================================================================
  // Liquid / Reaction
  // ====================================================================
  {
    name: 'LiquidMarble',
    category: 'noise',
    body: `{
    vec2 p = (uv - 0.5) * (3.0 + params[0] * 4.0);
    p = warp(p + vec2(time * 0.05), 0.6);
    float f = fbm(p, 6);
    float g = fbm(p * 2.0 + f, 4);
    // Compute pseudo-normals via finite differences for highlights.
    float e = 0.01;
    float fx = fbm(p + vec2(e, 0.0), 6) - fbm(p - vec2(e, 0.0), 6);
    float fy = fbm(p + vec2(0.0, e), 6) - fbm(p - vec2(0.0, e), 6);
    vec3 n = normalize(vec3(-fx, -fy, 0.5));
    vec3 lightDir = normalize(vec3(0.5, 0.5, 1.0));
    float diff = max(dot(n, lightDir), 0.0);
    float spec = pow(diff, 32.0);
    float t = f * 0.6 + g * 0.4 + params[1] + time * 0.05;
    col = cosPalette(t) * (0.3 + 0.7 * diff) + vec3(spec) * 0.6;
}`,
    params: [0.5, 0.3, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'ReactionDiff',
    category: 'wave',
    body: `{
    // Reaction-diffusion-like pattern via competing FBM fields.
    vec2 p = (uv - 0.5) * (4.0 + params[0] * 4.0);
    p += vec2(time * 0.06);
    float u = fbm(p, 5);
    float v = fbm(p * 1.3 + 5.0 + time * 0.1, 5);
    float w = fbm(p * 0.7 - u * 0.5, 4);
    float reaction = sin((u - v + w) * 8.0 + time * 0.5);
    float t = reaction * 0.5 + 0.5 + params[1] + length(p) * 0.05 + time * 0.05;
    col = cosPalette(t);
    col = pow(col, vec3(0.9));
}`,
    params: [0.5, 0.3, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'PlasmaField',
    category: 'wave',
    body: `{
    vec2 p = (uv - 0.5) * (4.0 + params[0] * 4.0);
    p *= rot2(time * 0.06);
    float v = 0.0;
    v += sin(p.x * 3.0 + time);
    v += sin(p.y * 2.5 + time * 0.7);
    v += sin((p.x + p.y) * 2.0 + time * 1.3);
    v += sin(length(p) * 5.0 - time * 1.8);
    v += sin(p.x * p.y * 4.0 + time * 0.5);
    v *= 0.2;
    float t = v + 0.5 + params[1] + time * 0.04;
    col = cosPalette(t);
    col += paletteSample(v * 2.0 + time * 0.1) * 0.3;
}`,
    params: [0.5, 0.3, 0, 0, 0, 0, 0, 0],
  },

  // ====================================================================
  // Geometric Tiles
  // ====================================================================
  {
    name: 'Kaleidoscope',
    category: 'geometric',
    body: `{
    vec2 p = uv - 0.5;
    float r = length(p);
    float a = atan(p.y, p.x);
    float folds = floor(params[0] * 10.0) + 4.0;
    float seg = 6.2831 / folds;
    a = mod(a + time * 0.3, seg);
    a = abs(a - seg * 0.5);
    vec2 kp = vec2(cos(a), sin(a)) * r * (3.0 + params[1] * 4.0);
    kp += time * 0.1;
    float v = fbm(kp, 5) * 0.6 + fbmRidge(kp * 1.7, 4) * 0.4;
    float t = v + r * 0.6 + time * 0.05;
    col = cosPalette(t);
    col *= 0.5 + 0.5 * smoothstep(0.0, 0.4, v);
}`,
    params: [0.6, 0.5, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'Truchet',
    category: 'geometric',
    body: `{
    float scale = 4.0 + params[0] * 12.0;
    vec2 gp = uv * scale;
    gp += vec2(time * 0.1);
    vec2 ip = floor(gp);
    vec2 fp = fract(gp) - 0.5;
    float r = hash21(ip);
    float angle = floor(r * 4.0) * 1.5708 + time * 0.4;
    fp *= rot2(angle);
    // Two arcs forming an S-curve through the cell.
    vec2 c1 = vec2(-0.5, -0.5);
    vec2 c2 = vec2(0.5, 0.5);
    float d1 = abs(length(fp - c1) - 0.5);
    float d2 = abs(length(fp - c2) - 0.5);
    float d = min(d1, d2);
    float line = smoothstep(0.05, 0.0, d);
    float glow = 0.06 / (d + 0.06);
    float t = r + length(fp) + params[1] + time * 0.05;
    col = cosPalette(t) * line + cosPalette(t + 0.3) * glow * 0.5;
}`,
    params: [0.5, 0.3, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'HexTiling',
    category: 'mosaic',
    body: `{
    vec2 p = uv * (5.0 + params[0] * 10.0);
    p += vec2(time * 0.08);
    // Pointy-top hex grid.
    p.y *= 1.1547;
    vec2 ip = floor(p);
    vec2 fp = fract(p);
    // Distance to nearest of 3 edges of the hex cell.
    float hex = max(abs(fp.x - 0.5), max(abs(fp.x * 0.5 + fp.y - 0.5), abs(-fp.x * 0.5 + fp.y - 0.5)));
    float edge = smoothstep(0.48, 0.5, hex);
    float fill = hash21(ip);
    float pulse = 0.5 + 0.5 * sin(fill * 6.28 + time * 1.2);
    float t = fill * 0.7 + pulse * 0.3 + params[1] + time * 0.05;
    col = mix(cosPalette(t), vec3(0.0), edge * 0.7);
    col += cosPalette(t + 0.4) * (1.0 - edge) * pulse * 0.2;
}`,
    params: [0.5, 0.3, 0, 0, 0, 0, 0, 0],
  },

  // ====================================================================
  // Wave
  // ====================================================================
  {
    name: 'WaveInterfere',
    category: 'wave',
    body: `{
    vec2 p = (uv - 0.5) * (6.0 + params[0] * 8.0);
    float v = 0.0;
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      vec2 c = vec2(sin(time * 0.3 + fi * 1.2), cos(time * 0.4 + fi * 1.7)) * 2.5;
      v += sin(length(p - c) * 3.0 - time * 1.5 - fi);
    }
    v = v * 0.2 + 0.5;
    float t = v + params[1] + length(p) * 0.05 + time * 0.04;
    col = cosPalette(t);
    col = pow(col, vec3(0.85));
}`,
    params: [0.5, 0.2, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'SpiralVortex',
    category: 'fractal',
    body: `{
    vec2 p = (uv - 0.5) * (4.0 + params[0] * 4.0);
    float r = length(p);
    float a = atan(p.y, p.x);
    float arms = floor(params[1] * 6.0) + 2.0;
    float spiral = sin(a * arms + log(r + 0.05) * 6.0 - time * 1.5);
    float twist = fbm(vec2(a * 2.0, r * 3.0) + time * 0.2, 4);
    float t = spiral * 0.5 + 0.5 + twist * 0.4 + params[2] + time * 0.05;
    col = cosPalette(t);
    col *= 0.4 + 0.6 * smoothstep(0.0, 0.3, r);
    col *= 1.0 - smoothstep(0.6, 1.0, r);
}`,
    params: [0.5, 0.5, 0.2, 0, 0, 0, 0, 0],
  },

  // ====================================================================
  // Paint
  // ====================================================================
  {
    name: 'OilFlow',
    category: 'painterly',
    body: `{
    vec2 p = (uv - 0.5) * (3.0 + params[0] * 4.0);
    p = warp(p + vec2(time * 0.05), 0.4);
    float f1 = fbm(p, 5);
    float f2 = fbm(p * 1.7 + f1 * 0.8, 4);
    float f3 = fbmRidge(p * 0.9 - f2 * 0.4, 4);
    float t = f1 * 0.5 + f2 * 0.3 + f3 * 0.2 + params[1] + time * 0.04;
    col = cosPalette(t);
    // Brush-stroke highlight along the gradient direction.
    float br = pow(0.5 + 0.5 * sin(f1 * 8.0 + time), 4.0);
    col += paletteSample(f3 + time * 0.1) * br * 0.3;
    col = pow(col, vec3(0.9));
}`,
    params: [0.5, 0.3, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'Aurora',
    category: 'wave',
    body: `{
    vec2 p = uv;
    p.x *= 1.5 + params[0] * 1.5;
    float bands = 4.0 + params[1] * 6.0;
    float t = time * 0.4;
    // Layered vertical aurora curtains with fbm perturbation.
    float v = 0.0;
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float y = uv.y + 0.2 * fi + 0.05 * sin(uv.x * 6.0 + t + fi);
      float x = uv.x + 0.15 * fbm(vec2(uv.y * bands + fi, t * 0.5 + fi), 4);
      float band = exp(-pow((y - 0.4 - 0.1 * fi) * bands, 2.0));
      v += band * (0.5 + 0.5 * sin(x * 6.28 + t + fi * 1.3));
    }
    float t2 = v * 0.5 + uv.y * 0.3 + params[2] + time * 0.05;
    col = cosPalette(t2) * v;
    col += paletteSample(v * 2.0 + time * 0.1) * 0.2;
    // Star field on top.
    float star = step(0.997, hash21(floor(p * 200.0))) * (0.5 + 0.5 * sin(time * 5.0 + hash21(floor(p * 200.0)) * 30.0));
    col += vec3(star);
}`,
    params: [0.5, 0.5, 0.2, 0, 0, 0, 0, 0],
  },

  // ====================================================================
  // Bonus: distinctive generative scenes
  // ====================================================================
  {
    name: 'Tunnel',
    category: 'fractal',
    body: `{
    vec2 p = (uv - 0.5) * 2.0;
    float r = length(p);
    float a = atan(p.y, p.x);
    float tunnel = 0.5 / (r + 0.001);
    vec2 tuv = vec2(a / 3.1416, tunnel * 0.3 + time * 0.6);
    tuv += vec2(fbm(tuv, 3) * 0.1, fbm(tuv + 5.0, 3) * 0.1);
    float v = fbm(tuv * 3.0, 5);
    float t = v + tunnel * 0.05 + params[0] + time * 0.05;
    col = cosPalette(t);
    // Fade out near center to fake infinite depth.
    col *= smoothstep(0.0, 0.2, r);
}`,
    params: [0.3, 0.3, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'Interference',
    category: 'wave',
    body: `{
    // Double-slit-like interference on a screen.
    vec2 p = (uv - 0.5) * (8.0 + params[0] * 8.0);
    float slit = 0.6 + params[1] * 1.0;
    vec2 s1 = vec2(-slit * 0.5, -2.0);
    vec2 s2 = vec2( slit * 0.5, -2.0);
    float d1 = length(p - s1);
    float d2 = length(p - s2);
    float wave = sin(d1 * 4.0 - time * 2.0) + sin(d2 * 4.0 - time * 2.0);
    wave *= 0.5;
    float env = exp(-pow((uv.y - 0.5) * 3.0, 2.0));
    float t = wave * 0.5 + 0.5 + params[2] + time * 0.05;
    col = cosPalette(t) * (0.4 + 0.6 * env) * (0.5 + 0.5 * wave);
}`,
    params: [0.5, 0.4, 0.2, 0, 0, 0, 0, 0],
  },
  {
    name: 'MagneticField',
    category: 'geometric',
    body: `{
    vec2 p = (uv - 0.5) * (4.0 + params[0] * 4.0);
    // Two opposing "charges" produce a dipole-like field.
    vec2 q1 = vec2(-0.6, 0.0);
    vec2 q2 = vec2( 0.6, 0.0);
    q1 *= rot2(time * 0.3);
    q2 *= rot2(time * 0.3);
    float r1 = max(length(p - q1), 0.05);
    float r2 = max(length(p - q2), 0.05);
    float pot = 1.0 / r1 - 1.0 / r2;
    float a = atan(p.y - q1.y, p.x - q1.x) - atan(p.y - q2.y, p.x - q2.x);
    float lines = sin(pot * 4.0 + time * 0.3);
    float flow = sin(a * 6.0 + pot * 2.0 + time);
    float t = lines * 0.4 + flow * 0.3 + 0.5 + params[1] + time * 0.05;
    col = cosPalette(t);
    col *= 0.5 + 0.5 * (1.0 / r1 + 1.0 / r2) * 0.1;
}`,
    params: [0.4, 0.3, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'BlackHole',
    category: 'fractal',
    body: `{
    vec2 p = (uv - 0.5) * (3.0 + params[0] * 3.0);
    p *= rot2(time * 0.1);
    float r = length(p);
    // Gravitational lensing: bend uv away from singularity.
    float bend = 0.4 / (r * r + 0.1);
    vec2 dir = normalize(p + 1e-4);
    vec2 warped = p + dir * bend * 0.3 * sin(time * 0.5 + params[1] * 3.0);
    warped *= rot2(time * 0.3 + bend * 0.5);
    float v = fbm(warped * 2.0, 6);
    float t = v + bend * 0.2 + time * 0.05;
    col = cosPalette(t);
    // Event horizon shadow.
    col *= smoothstep(0.1, 0.4, r);
    // Photon ring.
    col += cosPalette(t + 0.4) * smoothstep(0.05, 0.0, abs(r - 0.3)) * 0.8;
}`,
    params: [0.5, 0.3, 0, 0, 0, 0, 0, 0],
  },
]
