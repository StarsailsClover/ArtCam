import { useEffect, useRef, useState } from 'react'
import { ArtRenderer } from '@/gl/renderer'
import { useHandTracking } from '@/hooks/useHandTracking'
import { useSegmentation } from '@/hooks/useSegmentation'
import { useArtStore } from '@/store/useArtStore'
import { randomEffect, getEffect } from '@/gl/effects'
import { randomId } from '@/lib/utils'
import type { HandFrame, PlacedRect } from '@/types'

const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
]

interface CameraStageProps {
  rendererRef: React.MutableRefObject<ArtRenderer | null>
  onFps?: (fps: number) => void
  onPlace?: (effectName: string) => void
}

export default function CameraStage({ rendererRef, onFps, onPlace }: CameraStageProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const glCanvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const [enabled, setEnabled] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const showSkeleton = useArtStore((s) => s.showSkeleton)
  const mirror = useArtStore((s) => s.mirror)
  const selectedEffectId = useArtStore((s) => s.selectedEffectId)
  const addPlacedRect = useArtStore((s) => s.addPlacedRect)
  const setCameraStatus = useArtStore((s) => s.setCameraStatus)

  const { handsRef, ready, error } = useHandTracking(videoRef.current, enabled)
  const { maskCanvasRef, ready: segReady, error: segError } = useSegmentation(videoRef.current, enabled)

  // Refs to avoid restarting the rAF loop when settings change.
  const mirrorRef = useRef(mirror)
  const skeletonRef = useRef(showSkeleton)
  const selectedRef = useRef(selectedEffectId)
  mirrorRef.current = mirror
  skeletonRef.current = showSkeleton
  selectedRef.current = selectedEffectId

  // Initialize WebGL renderer once.
  useEffect(() => {
    if (!glCanvasRef.current) return
    const renderer = new ArtRenderer(glCanvasRef.current)
    rendererRef.current = renderer
    return () => {
      renderer.destroy()
      rendererRef.current = null
    }
  }, [])

  // Request camera access.
  useEffect(() => {
    let stream: MediaStream | null = null
    let cancelled = false
    async function start() {
      setCameraStatus({ state: 'requesting' })
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user',
          },
          audio: false,
        })
        if (cancelled || !videoRef.current) return
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setCameraStatus({ state: 'granted' })
        setEnabled(true)
      } catch (err) {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : 'Camera access denied'
        setErrorMsg(msg)
        setCameraStatus({ state: 'denied', message: msg })
      }
    }
    start()
    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [setCameraStatus])

  // Resize both canvases to match the video resolution; CSS scales them to fit.
  useEffect(() => {
    function applySize() {
      const video = videoRef.current
      const glCanvas = glCanvasRef.current
      const overlay = overlayRef.current
      if (!video || !glCanvas || !overlay) return
      const w = video.videoWidth || 1280
      const h = video.videoHeight || 720
      if (glCanvas.width !== w || glCanvas.height !== h) {
        glCanvas.width = w
        glCanvas.height = h
        overlay.width = w
        overlay.height = h
        rendererRef.current?.resize(w, h)
      }
    }
    const onLoaded = () => applySize()
    const video = videoRef.current
    video?.addEventListener('loadedmetadata', onLoaded)
    applySize()
    return () => video?.removeEventListener('loadedmetadata', onLoaded)
  }, [rendererRef])

  // Main render + pinch detection loop. Runs once; reads from refs.
  useEffect(() => {
    let raf = 0
    let lastPlace = 0
    let fpsLast = performance.now()
    let fpsCount = 0

    const loop = () => {
      const renderer = rendererRef.current
      const video = videoRef.current
      const overlay = overlayRef.current
      if (renderer && video && overlay) {
        renderer.uploadVideoFrame(video)
        const maskCanvas = maskCanvasRef.current
        if (maskCanvas) renderer.uploadMaskFrame(maskCanvas)
        renderer.renderComposite(mirrorRef.current)
        const hands = handsRef.current
        drawOverlay(overlay, hands, mirrorRef.current, skeletonRef.current)

        // Pinch detection: both hands pinching -> place a rect (debounced 600ms).
        if (hands.length >= 2) {
          const pinching = hands.filter((h) => h.isPinching)
          if (pinching.length >= 2) {
            const now = performance.now()
            if (now - lastPlace >= 600) {
              lastPlace = now
              const [a, b] = hands
              const id = selectedRef.current
              const effect = id != null ? getEffect(id) : randomEffect()
              if (effect) {
                const rect: PlacedRect = {
                  id: randomId(),
                  x1: a.pinchMidpoint.x,
                  y1: a.pinchMidpoint.y,
                  x2: b.pinchMidpoint.x,
                  y2: b.pinchMidpoint.y,
                  effectId: effect.id,
                  params: effect.params,
                  palette: effect.palette,
                  timestamp: Date.now(),
                }
                renderer.placeRect(rect)
                addPlacedRect(rect)
                onPlace?.(effect.name)
              }
            }
          }
        }

        fpsCount++
        const now = performance.now()
        if (now - fpsLast >= 500) {
          onFps?.(Math.round((fpsCount * 1000) / (now - fpsLast)))
          fpsCount = 0
          fpsLast = now
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="relative flex h-full w-full items-center justify-center bg-black">
      <video ref={videoRef} className="hidden" playsInline muted autoPlay />
      <div className="relative h-full w-full">
        <canvas
          ref={glCanvasRef}
          className="absolute inset-0 h-full w-full object-contain"
        />
        <canvas
          ref={overlayRef}
          className="absolute inset-0 h-full w-full object-contain pointer-events-none"
        />
      </div>

      {!ready && !error && !errorMsg && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-ink-dim">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-accent" />
          <p className="font-mono text-xs uppercase tracking-wider">
            Loading hand tracking &amp; segmentation models…
          </p>
        </div>
      )}

      {(error || errorMsg) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="font-display text-2xl text-accent">Camera unavailable</p>
          <p className="max-w-md text-sm text-ink-dim">
            {errorMsg ?? error}
            <br />
            请允许摄像头权限并使用支持 WebGL2 的现代浏览器。
          </p>
        </div>
      )}

      {ready && !segReady && !segError && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-black/60 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-ink-dim backdrop-blur">
          Loading segmentation model…
        </div>
      )}
    </div>
  )
}

function drawOverlay(
  canvas: HTMLCanvasElement,
  hands: HandFrame[],
  mirror: boolean,
  showSkeleton: boolean,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)
  ctx.save()
  if (mirror) {
    ctx.translate(w, 0)
    ctx.scale(-1, 1)
  }

  // Rectangle preview when both hands present.
  if (hands.length >= 2) {
    const [a, b] = hands
    const ax = a.pinchMidpoint.x * w
    const ay = a.pinchMidpoint.y * h
    const bx = b.pinchMidpoint.x * w
    const by = b.pinchMidpoint.y * h
    const both = a.isPinching && b.isPinching
    const x = Math.min(ax, bx)
    const y = Math.min(ay, by)
    const rw = Math.abs(bx - ax)
    const rh = Math.abs(by - ay)

    ctx.lineWidth = Math.max(2, w * 0.0025)
    ctx.setLineDash(both ? [] : [w * 0.008, w * 0.008])
    ctx.strokeStyle = both ? '#ff3b30' : 'rgba(245,245,247,0.65)'
    ctx.strokeRect(x, y, rw, rh)
    ctx.setLineDash([])

    // Diagonal line connecting the two pinch midpoints.
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.lineTo(bx, by)
    ctx.stroke()

    // Vertex markers.
    for (const [px, py] of [
      [ax, ay],
      [bx, by],
    ]) {
      ctx.beginPath()
      ctx.arc(px, py, w * 0.012, 0, Math.PI * 2)
      ctx.fillStyle = both ? '#ff3b30' : 'rgba(245,245,247,0.85)'
      ctx.fill()
      if (both) {
        ctx.beginPath()
        ctx.arc(px, py, w * 0.022, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(255,59,48,0.4)'
        ctx.lineWidth = Math.max(2, w * 0.002)
        ctx.stroke()
      }
    }
  }

  // Hand skeleton.
  if (showSkeleton) {
    for (const hand of hands) {
      drawHand(ctx, hand, w, h)
    }
  }

  ctx.restore()
}

function drawHand(
  ctx: CanvasRenderingContext2D,
  hand: HandFrame,
  w: number,
  h: number,
) {
  const pts = hand.landmarks.map((p) => [p.x * w, p.y * h] as const)
  const color = hand.isPinching ? '#ff3b30' : '#22d3ee'
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(2, w * 0.0022)
  ctx.lineCap = 'round'
  for (const [a, b] of HAND_CONNECTIONS) {
    ctx.beginPath()
    ctx.moveTo(pts[a][0], pts[a][1])
    ctx.lineTo(pts[b][0], pts[b][1])
    ctx.stroke()
  }
  for (const [x, y] of pts) {
    ctx.beginPath()
    ctx.arc(x, y, Math.max(2.5, w * 0.0035), 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
  }
  // Highlight pinch midpoint.
  const mx = hand.pinchMidpoint.x * w
  const my = hand.pinchMidpoint.y * h
  ctx.beginPath()
  ctx.arc(mx, my, Math.max(4, w * 0.006), 0, Math.PI * 2)
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(1.5, w * 0.0018)
  ctx.stroke()
}
