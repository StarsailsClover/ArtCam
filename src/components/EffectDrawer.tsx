import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check } from 'lucide-react'
import { useArtStore } from '@/store/useArtStore'
import { EFFECTS, CATEGORY_LIST, CATEGORY_LABEL } from '@/gl/effects'
import { PALETTES } from '@/gl/palettes'
import type { EffectCategory } from '@/types'
import { cn } from '@/lib/utils'

interface EffectDrawerProps {
  open: boolean
  onClose: () => void
}

export default function EffectDrawer({ open, onClose }: EffectDrawerProps) {
  const selectedEffectId = useArtStore((s) => s.selectedEffectId)
  const setSelectedEffectId = useArtStore((s) => s.setSelectedEffectId)
  const [activeCat, setActiveCat] = useState<EffectCategory | 'all'>('all')

  const filtered = useMemo(() => {
    if (activeCat === 'all') return EFFECTS
    return EFFECTS.filter((e) => e.category === activeCat)
  }, [activeCat])

  function paletteIndexFor(effectId: number): number {
    return effectId % PALETTES.length
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-40 flex items-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <motion.div
            className="relative w-full border-t border-white/10 bg-ink-surface/95 backdrop-blur-2xl"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
              <div>
                <p className="eyebrow">Effects</p>
                <h2 className="font-display text-xl text-ink-fg">
                  选择艺术效果
                </h2>
              </div>
              <button onClick={onClose} className="btn-ghost rounded-full p-2">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 py-3">
              <button
                className={cn(
                  'chip whitespace-nowrap',
                  activeCat === 'all' && 'border-accent/40 bg-accent/10 text-ink-fg',
                )}
                onClick={() => setActiveCat('all')}
              >
                All · {EFFECTS.length}
              </button>
              {CATEGORY_LIST.map((cat) => {
                const count = EFFECTS.filter((e) => e.category === cat).length
                return (
                  <button
                    key={cat}
                    className={cn(
                      'chip whitespace-nowrap',
                      activeCat === cat && 'border-accent/40 bg-accent/10 text-ink-fg',
                    )}
                    onClick={() => setActiveCat(cat)}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: `var(--cat-${cat})` }}
                    />
                    {CATEGORY_LABEL[cat]} · {count}
                  </button>
                )
              })}
            </div>

            <div className="no-scrollbar max-h-[55vh] overflow-y-auto px-5 pb-6">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                <button
                  className={cn(
                    'group relative aspect-square overflow-hidden rounded-xl border border-white/5 bg-white/[0.02] p-3 text-left transition',
                    selectedEffectId == null && 'border-accent',
                  )}
                  onClick={() => {
                    setSelectedEffectId(null)
                    onClose()
                  }}
                >
                  <div className="flex h-full flex-col justify-between">
                    <div className="flex items-center gap-1">
                      {[0, 1, 2, 3].map((i) => (
                        <span
                          key={i}
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: PALETTES[i].swatches[0] }}
                        />
                      ))}
                    </div>
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-wider text-ink-muted">
                        auto
                      </p>
                      <p className="text-sm font-medium text-ink-fg">Random</p>
                    </div>
                  </div>
                  {selectedEffectId == null && (
                    <span className="absolute right-2 top-2 rounded-full bg-accent p-1">
                      <Check className="h-3 w-3 text-white" />
                    </span>
                  )}
                </button>

                {filtered.map((effect) => {
                  const selected = selectedEffectId === effect.id
                  const pIdx = paletteIndexFor(effect.id)
                  const palette = PALETTES[pIdx]
                  return (
                    <button
                      key={effect.id}
                      className={cn(
                        'group relative aspect-square overflow-hidden rounded-xl border border-white/5 bg-white/[0.02] p-3 text-left transition hover:border-white/20',
                        selected && 'border-accent',
                      )}
                      onClick={() => {
                        setSelectedEffectId(effect.id)
                        onClose()
                      }}
                    >
                      <div className="flex h-full flex-col justify-between">
                        <div className="flex flex-wrap gap-1">
                          {palette.swatches.slice(0, 6).map((c, i) => (
                            <span
                              key={i}
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                        <div>
                          <p className="font-mono text-[10px] uppercase tracking-wider text-ink-muted">
                            {CATEGORY_LABEL[effect.category]} · #{effect.id + 1}
                          </p>
                          <p className="truncate text-xs font-medium text-ink-fg">
                            {effect.name}
                          </p>
                        </div>
                      </div>
                      {selected && (
                        <span className="absolute right-2 top-2 rounded-full bg-accent p-1">
                          <Check className="h-3 w-3 text-white" />
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
