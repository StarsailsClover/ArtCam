import { useEffect, useRef, useState } from 'react'
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import type { HandFrame, Landmark } from '@/types'

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

const PINCH_RATIO = 0.45 // pinch distance / hand size threshold

interface UseHandTrackingResult {
  /** Live hand frames. Updated every frame via ref (no re-render). */
  handsRef: React.MutableRefObject<HandFrame[]>
  /** Model is loaded and ready to detect. */
  ready: boolean
  /** Error message if model failed to load. */
  error: string | null
}

/**
 * Runs MediaPipe HandLandmarker on the given video element. Hand frames are
 * written to a ref every frame to avoid triggering React re-renders at 60fps.
 * `ready` and `error` are state since they change rarely.
 */
export function useHandTracking(
  video: HTMLVideoElement | null,
  enabled: boolean,
): UseHandTrackingResult {
  const handsRef = useRef<HandFrame[]>([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const landmarkerRef = useRef<HandLandmarker | null>(null)
  const rafRef = useRef(0)
  const lastVideoTimeRef = useRef(-1)
  const pinchLatchRef = useRef<Record<string, boolean>>({})

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    FilesetResolver.forVisionTasks(WASM_URL)
      .then((fileset) => {
        if (cancelled) return null
        return HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        })
      })
      .then((landmarker) => {
        if (cancelled || !landmarker) return
        landmarkerRef.current = landmarker
        setReady(true)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err?.message ?? 'Failed to load hand tracking model')
      })
    return () => {
      cancelled = true
      landmarkerRef.current?.close()
      landmarkerRef.current = null
      setReady(false)
    }
  }, [enabled])

  useEffect(() => {
    if (!video || !enabled) {
      handsRef.current = []
      return
    }
    const loop = () => {
      const landmarker = landmarkerRef.current
      if (
        landmarker &&
        video.readyState >= 2 &&
        video.currentTime !== lastVideoTimeRef.current
      ) {
        lastVideoTimeRef.current = video.currentTime
        try {
          const result = landmarker.detectForVideo(video, performance.now())
          const frames: HandFrame[] = []
          for (let i = 0; i < result.landmarks.length; i++) {
            const lm = result.landmarks[i] as Landmark[]
            const thumbTip = lm[4]
            const indexTip = lm[8]
            const wrist = lm[0]
            const indexMcp = lm[5]
            const handSize =
              Math.hypot(wrist.x - indexMcp.x, wrist.y - indexMcp.y) || 0.0001
            const pinchDistance =
              Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y) / handSize
            const handedLabel = result.handedness?.[i]?.[0]?.categoryName
            const handedness = handedLabel === 'Left' ? 'Left' : 'Right'
            const latched = pinchLatchRef.current[handedness] ?? false
            const isPinching = latched
              ? pinchDistance < PINCH_RATIO * 1.4
              : pinchDistance < PINCH_RATIO
            pinchLatchRef.current[handedness] = isPinching
            frames.push({
              handedness,
              landmarks: lm,
              thumbTip,
              indexTip,
              pinchMidpoint: {
                x: (thumbTip.x + indexTip.x) / 2,
                y: (thumbTip.y + indexTip.y) / 2,
              },
              pinchDistance,
              isPinching,
            })
          }
          const present = new Set(frames.map((f) => f.handedness))
          for (const key of Object.keys(pinchLatchRef.current)) {
            if (!present.has(key as 'Left' | 'Right')) {
              delete pinchLatchRef.current[key]
            }
          }
          handsRef.current = frames
        } catch (err) {
          if (import.meta.env.DEV) {
            console.warn('HandLandmarker frame error:', err)
          }
        }
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [video, enabled])

  return { handsRef, ready, error }
}
