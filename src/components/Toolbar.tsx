import { useArtStore } from '@/store/useArtStore'
import {
  Shuffle,
  Grid3x3,
  Undo2,
  Trash2,
  Download,
  Hand,
  FlipHorizontal,
  Eye,
  EyeOff,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ToolbarProps {
  onPickEffect: () => void
  onUndo: () => void
  onClear: () => void
  onSave: () => void
}

export default function Toolbar({ onPickEffect, onUndo, onClear, onSave }: ToolbarProps) {
  const showSkeleton = useArtStore((s) => s.showSkeleton)
  const toggleSkeleton = useArtStore((s) => s.toggleSkeleton)
  const mirror = useArtStore((s) => s.mirror)
  const setMirror = useArtStore((s) => s.setMirror)
  const placedCount = useArtStore((s) => s.placedCount)
  const selectedEffectId = useArtStore((s) => s.selectedEffectId)
  const setSelectedEffectId = useArtStore((s) => s.setSelectedEffectId)

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 flex items-end justify-center gap-2 px-3 pb-4 md:gap-3 md:px-6 md:pb-6">
      <div className="panel flex items-center gap-1 rounded-full p-1.5">
        <button
          className={cn(
            'btn-ghost rounded-full px-3 py-2',
            selectedEffectId == null && 'bg-white/10 text-ink-fg',
          )}
          onClick={() => setSelectedEffectId(null)}
          title="随机效果"
        >
          <Shuffle className="h-4 w-4" />
        </button>
        <button
          className="btn-ghost rounded-full px-3 py-2"
          onClick={onPickEffect}
          title="指定效果"
        >
          <Grid3x3 className="h-4 w-4" />
        </button>
        <div className="mx-1 h-6 w-px bg-white/10" />
        <button
          className="btn-ghost rounded-full px-3 py-2"
          onClick={onUndo}
          disabled={placedCount === 0}
          title="撤销"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          className="btn-ghost rounded-full px-3 py-2"
          onClick={onClear}
          disabled={placedCount === 0}
          title="清空"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        <button
          className="btn-ghost rounded-full px-3 py-2"
          onClick={onSave}
          disabled={placedCount === 0}
          title="保存 PNG"
        >
          <Download className="h-4 w-4" />
        </button>
      </div>

      <div className="panel flex items-center gap-1 rounded-full p-1.5">
        <button
          className={cn(
            'btn-ghost rounded-full px-3 py-2',
            showSkeleton && 'bg-white/10 text-ink-fg',
          )}
          onClick={toggleSkeleton}
          title={showSkeleton ? '隐藏骨架' : '显示骨架'}
        >
          {showSkeleton ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          <Hand className="h-4 w-4" />
        </button>
        <button
          className={cn(
            'btn-ghost rounded-full px-3 py-2',
            mirror && 'bg-white/10 text-ink-fg',
          )}
          onClick={() => setMirror(!mirror)}
          title={mirror ? '关闭镜像' : '开启镜像'}
        >
          <FlipHorizontal className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
