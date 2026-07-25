import { useArtStore } from '@/store/useArtStore'
import { getEffect, EFFECT_COUNT } from '@/gl/effects'
import { CATEGORY_LABEL } from '@/gl/effects'
import { cn } from '@/lib/utils'

interface StatusBarProps {
  fps: number
  lastEffectName: string | null
}

export default function StatusBar({ fps, lastEffectName }: StatusBarProps) {
  const placedCount = useArtStore((s) => s.placedCount)
  const cameraStatus = useArtStore((s) => s.cameraStatus)
  const selectedEffectId = useArtStore((s) => s.selectedEffectId)

  const selectedEffect = selectedEffectId != null ? getEffect(selectedEffectId) : null
  const displayName = selectedEffect?.name ?? lastEffectName ?? 'Random'
  const category = selectedEffect?.category ?? null

  const cameraOk = cameraStatus.state === 'granted'

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 py-3 md:px-6 md:py-4">
      <div className="pointer-events-auto flex items-center gap-2">
        <div className="panel flex items-center gap-2 rounded-full px-3 py-1.5">
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              cameraOk ? 'bg-emerald-400' : 'bg-accent animate-pulse-soft',
            )}
          />
          <span className="font-mono text-xs uppercase tracking-wider text-ink-dim">
            {cameraOk ? 'Live' : cameraStatus.state}
          </span>
        </div>
        <div className="panel flex items-center gap-2 rounded-full px-3 py-1.5">
          {category && (
            <span
              className={cn('h-1.5 w-1.5 rounded-full')}
              style={{ backgroundColor: `var(--cat-${category})` }}
            />
          )}
          <span className="text-xs font-medium text-ink-fg">{displayName}</span>
        </div>
      </div>

      <div className="pointer-events-auto flex items-center gap-2">
        <div className="panel rounded-full px-3 py-1.5 font-mono text-xs text-ink-dim">
          <span className="text-ink-fg">{fps}</span>
          <span className="ml-1">fps</span>
        </div>
        <div className="panel rounded-full px-3 py-1.5 font-mono text-xs text-ink-dim">
          <span className="text-ink-fg">{placedCount}</span>
          <span className="ml-1">/ {EFFECT_COUNT}</span>
        </div>
      </div>
    </div>
  )
}

// Re-export for type-only usage in components that need category labels.
export { CATEGORY_LABEL }
