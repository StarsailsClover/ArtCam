// Shared type definitions for ArtCam

export interface Landmark {
  x: number
  y: number
  z: number
}

export interface Vec2 {
  x: number
  y: number
}

export interface HandFrame {
  handedness: 'Left' | 'Right'
  landmarks: Landmark[]
  thumbTip: Landmark
  indexTip: Landmark
  pinchMidpoint: Vec2
  pinchDistance: number
  isPinching: boolean
}

export type EffectCategory =
  | 'segmentation'
  | 'distort'
  | 'stylize'
  | 'color'
  | 'feedback'
  | 'glitch'

export interface ArtEffect {
  id: number
  name: string
  category: EffectCategory
  /** GLSL body. Must assign `vec3 outCol` and (optional) `float outAlpha`. */
  glslBody: string
  params: number[]
  palette: number[]
}

export interface PlacedRect {
  id: string
  /** Normalized 0..1 canvas-space coordinates (already mirrored). */
  x1: number
  y1: number
  x2: number
  y2: number
  effectId: number
  params: number[]
  palette: number[]
  timestamp: number
}

export interface CameraStatus {
  state: 'idle' | 'requesting' | 'granted' | 'denied' | 'error'
  message?: string
}
