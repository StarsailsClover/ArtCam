import type { ArtEffect, EffectCategory } from '@/types'
import { PALETTES } from './palettes'
import { ALGORITHMS } from './algorithms'

// Generate the full effect registry by combining each algorithm with each palette.
// 34 algorithms × 8 palettes = 272 distinct effects (≥ 200 required).
//
// Each variant lightly scales the first parameter by the palette index so the same
// algorithm produces visually different density/scale per palette.

function buildEffects(): ArtEffect[] {
  const out: ArtEffect[] = []
  let id = 0
  for (const algo of ALGORITHMS) {
    PALETTES.forEach((palette, pIdx) => {
      const params = algo.params.slice()
      // Slight per-palette parameter drift to make variants visually distinct.
      params[0] = Math.max(0.05, params[0] * (0.7 + pIdx * 0.12))
      if (params[1] !== 0) {
        params[1] = Math.max(0, Math.min(1, params[1] * (0.6 + pIdx * 0.1)))
      }
      // Tuck palette index into a rarely-used slot so the shader can use it if needed.
      params[7] = pIdx / 7
      out.push({
        id: id++,
        name: `${algo.name} · ${palette.name}`,
        category: algo.category,
        glslBody: algo.body,
        params,
        palette: palette.data,
      })
    })
  }
  return out
}

export const EFFECTS: ArtEffect[] = buildEffects()

export const EFFECT_COUNT = EFFECTS.length

export function getEffect(id: number): ArtEffect | undefined {
  return EFFECTS[id]
}

export function randomEffect(): ArtEffect {
  return EFFECTS[Math.floor(Math.random() * EFFECTS.length)]
}

export const CATEGORY_LIST: EffectCategory[] = [
  'noise',
  'fractal',
  'attractor',
  'geometric',
  'painterly',
  'wave',
  'mosaic',
]

export const CATEGORY_LABEL: Record<EffectCategory, string> = {
  noise: 'Noise',
  fractal: 'Fractal',
  attractor: 'Attractor',
  geometric: 'Geometric',
  painterly: 'Painterly',
  wave: 'Wave',
  mosaic: 'Mosaic',
}

export function effectsByCategory(cat: EffectCategory): ArtEffect[] {
  return EFFECTS.filter((e) => e.category === cat)
}
