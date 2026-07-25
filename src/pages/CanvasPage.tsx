import { useCallback, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Images } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import CameraStage from '@/components/CameraStage'
import StatusBar from '@/components/StatusBar'
import Toolbar from '@/components/Toolbar'
import EffectDrawer from '@/components/EffectDrawer'
import { useArtStore } from '@/store/useArtStore'
import type { ArtRenderer } from '@/gl/renderer'

export default function CanvasPage() {
  const [fps, setFps] = useState(0)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [lastEffectName, setLastEffectName] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimerRef = useRef<number>(0)
  const rendererRef = useRef<ArtRenderer | null>(null)

  const undoLastRect = useArtStore((s) => s.undoLastRect)
  const clearAll = useArtStore((s) => s.clearAll)
  const placedCount = useArtStore((s) => s.placedCount)

  const showInfoToast = useCallback((msg: string) => {
    setToast(msg)
    window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => setToast(null), 1800)
  }, [])

  const handleUndo = useCallback(() => {
    rendererRef.current?.undoLastRect()
    undoLastRect()
    showInfoToast('已撤销最近一个矩形')
  }, [undoLastRect, showInfoToast])

  const handleClear = useCallback(() => {
    rendererRef.current?.clearAll()
    clearAll()
    showInfoToast('画布已清空')
  }, [clearAll, showInfoToast])

  const handleSave = useCallback(() => {
    const dataUrl = rendererRef.current?.toDataURL()
    if (!dataUrl) return
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `artcam-${Date.now()}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    showInfoToast('已保存为 PNG')
  }, [showInfoToast])

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <CameraStage
        rendererRef={rendererRef}
        onFps={setFps}
        onPlace={(name) => {
          setLastEffectName(name)
          showInfoToast(`已应用：${name}`)
        }}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between px-4 py-3 md:px-6 md:py-4">
        <Link to="/" className="btn-glass pointer-events-auto rounded-full p-2">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <Link
          to="/gallery"
          className="btn-glass pointer-events-auto rounded-full px-3 py-2 text-xs"
        >
          <Images className="h-3.5 w-3.5" />
          Gallery
        </Link>
      </div>

      <StatusBar fps={fps} lastEffectName={lastEffectName} />
      <Toolbar
        onPickEffect={() => setDrawerOpen(true)}
        onUndo={handleUndo}
        onClear={handleClear}
        onSave={handleSave}
      />
      <EffectDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <AnimatePresence>
        {toast && (
          <motion.div
            className="pointer-events-none absolute left-1/2 top-20 z-30 -translate-x-1/2"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <div className="panel rounded-full px-4 py-2 text-xs font-medium text-ink-fg">
              {toast}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {placedCount === 0 && (
        <motion.div
          className="pointer-events-none absolute inset-x-0 bottom-24 z-10 flex justify-center px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
        >
          <div className="panel rounded-2xl px-5 py-3 text-center">
            <p className="text-sm text-ink-fg">
              双手入镜，食指与拇指捏合，放置矩形画框
            </p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-ink-muted">
              pinch with both hands to place a rect
            </p>
          </div>
        </motion.div>
      )}
    </div>
  )
}
