import { useEffect, useRef, useState } from 'react'
import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision'

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
// Selfie segmenter model — 2 categories: 0 = background, 1 = person.
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite'

interface UseSegmentationResult {
  /** Offscreen canvas holding the latest person mask (white = person, black = background). */
  maskCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>
  /** Model is loaded and ready to segment. */
  ready: boolean
  /** Error message if model failed to load. */
  error: string | null
}

/**
 * Runs MediaPipe ImageSegmenter (selfie_segmenter model) on the given video
 * element. The person category mask is drawn to an offscreen canvas
 * (maskCanvasRef) every frame as a white-on-black image. The renderer uploads
 * this canvas as the uMask texture.
 *
 * We use `outputCategoryMask: true` (rather than `outputConfidenceMasks`)
 * because the category mask is a single MPMask with one byte per pixel
 * holding the class index — cheap to read back and convert to a
 * white-on-black RGBA mask via one ImageData pass.
 *
 * Segmentation runs in its own rAF loop, decoupled from the render loop, so
 * a slow GPU segmentation pass doesn't stall the composite. The mask canvas
 * always holds the most recent mask; if segmentation hasn't produced one yet,
 * the canvas stays filled with white (all-person) so segmentation-based
 * effects degrade gracefully.
 */
export function useSegmentation(
  video: HTMLVideoElement | null,
  enabled: boolean,
): UseSegmentationResult {
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null)
  if (maskCanvasRef.current === null) {
    const c = document.createElement('canvas')
    c.width = 32
    c.height = 32
    const ctx = c.getContext('2d')!
    // Default = all-person (white) so segmentation effects treat the whole
    // frame as foreground before the first real mask arrives.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, c.width, c.height)
    maskCanvasRef.current = c
  }

  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const segmenterRef = useRef<ImageSegmenter | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    FilesetResolver.forVisionTasks(WASM_URL)
      .then((fileset) => {
        if (cancelled) return null
        return ImageSegmenter.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          outputCategoryMask: true,
          outputConfidenceMasks: false,
        })
      })
      .then((segmenter) => {
        if (cancelled || !segmenter) return
        segmenterRef.current = segmenter
        setReady(true)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err?.message ?? 'Failed to load segmentation model')
      })
    return () => {
      cancelled = true
      segmenterRef.current?.close()
      segmenterRef.current = null
      setReady(false)
    }
  }, [enabled])

  useEffect(() => {
    if (!video || !enabled) return
    let cancelled = false
    let raf = 0
    let lastVideoTime = -1

    const loop = () => {
      if (cancelled) return
      const segmenter = segmenterRef.current
      if (
        segmenter &&
        video.readyState >= 2 &&
        video.currentTime !== lastVideoTime
      ) {
        lastVideoTime = video.currentTime
        try {
          const result = segmenter.segmentForVideo(video, performance.now())
          // selfie_segmenter has 2 categories: [0]=background, [1]=person.
          // categoryMask is a single MPMask whose pixel value is the category
          // index. We draw it onto our canvas as a grayscale image where
          // person (1) -> white, background (0) -> black.
          const mask = result.categoryMask
          const canvas = maskCanvasRef.current
          if (mask && canvas) {
            const vw = video.videoWidth || 640
            const vh = video.videoHeight || 480
            if (canvas.width !== vw || canvas.height !== vh) {
              canvas.width = vw
              canvas.height = vh
            }
            const ctx = canvas.getContext('2d')!
            // categoryMask.getAsUint8Array() returns one byte per pixel holding
            // the category index. For selfie_segmenter: 0 = background,
            // 1 = person. We expand it to an RGBA white-on-black mask so the
            // shader's sampleMask() reads 1.0 for person, 0.0 for background.
            const arr = mask.getAsUint8Array()
            const img = ctx.createImageData(canvas.width, canvas.height)
            const d = img.data
            for (let i = 0; i < arr.length; i++) {
              const v = arr[i] > 0 ? 255 : 0
              d[i * 4] = v
              d[i * 4 + 1] = v
              d[i * 4 + 2] = v
              d[i * 4 + 3] = 255
            }
            ctx.putImageData(img, 0, 0)
          }
        } catch (err) {
          if (import.meta.env.DEV) {
            console.warn('ImageSegmenter frame error:', err)
          }
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [video, enabled])

  return { maskCanvasRef, ready, error }
}
