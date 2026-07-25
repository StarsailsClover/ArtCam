import { create } from 'zustand'
import type { CameraStatus, PlacedRect } from '@/types'

interface ArtState {
  cameraStatus: CameraStatus
  placedRects: PlacedRect[]
  showSkeleton: boolean
  mirror: boolean
  selectedEffectId: number | null  // null = random
  placedCount: number
  fps: number

  setCameraStatus: (status: CameraStatus) => void
  addPlacedRect: (rect: PlacedRect) => void
  undoLastRect: () => void
  clearAll: () => void
  toggleSkeleton: () => void
  setMirror: (mirror: boolean) => void
  setSelectedEffectId: (id: number | null) => void
  setFps: (fps: number) => void
}

export const useArtStore = create<ArtState>((set) => ({
  cameraStatus: { state: 'idle' },
  placedRects: [],
  showSkeleton: true,
  mirror: true,
  selectedEffectId: null,
  placedCount: 0,
  fps: 0,

  setCameraStatus: (status) => set({ cameraStatus: status }),
  addPlacedRect: (rect) =>
    set((s) => ({
      placedRects: [...s.placedRects, rect],
      placedCount: s.placedRects.length + 1,
    })),
  undoLastRect: () =>
    set((s) => {
      if (s.placedRects.length === 0) return s
      const next = s.placedRects.slice(0, -1)
      return { placedRects: next, placedCount: next.length }
    }),
  clearAll: () => set({ placedRects: [], placedCount: 0 }),
  toggleSkeleton: () => set((s) => ({ showSkeleton: !s.showSkeleton })),
  setMirror: (mirror) => set({ mirror }),
  setSelectedEffectId: (id) => set({ selectedEffectId: id }),
  setFps: (fps) => set({ fps }),
}))
