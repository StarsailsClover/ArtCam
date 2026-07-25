import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { ArtRenderer } from '@/gl/renderer'
import { EFFECTS, CATEGORY_LIST, CATEGORY_LABEL } from '@/gl/effects'
import { PALETTES } from '@/gl/palettes'
import type { EffectCategory } from '@/types'
import { useArtStore } from '@/store/useArtStore'
import { cn } from '@/lib/utils'

const TILE_SIZE = 256

export default function GalleryGrid() {
  const hiddenCanvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<ArtRenderer | null>(null)
  const tileRefs = useRef<Map<number, HTMLCanvasElement>>(new Map())
  const renderedRef = useRef<Set<number>>(new Set())
  const [renderedVersion, setRenderedVersion] = useState(0)
  const [activeCat, setActiveCat] = useState<EffectCategory | 'all'>('all')

  const selectedEffectId = useArtStore((s) => s.selectedEffectId)
  const setSelectedEffectId = useArtStore((s) => s.setSelectedEffectId)

  useEffect(() => {
    if (!hiddenCanvasRef.current) return
    const renderer = new ArtRenderer(hiddenCanvasRef.current)
    rendererRef.current = renderer
    setRenderedVersion((v) => v + 1)
    return () => {
      renderer.destroy()
      rendererRef.current = null
      renderedRef.current.clear()
      tileRefs.current.clear()
    }
  }, [])

  useEffect(() => {
    const renderer = rendererRef.current
    if (!renderer) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = Number(entry.target.getAttribute('data-effect-id'))
            renderTile(id)
          }
        }
      },
      { rootMargin: '300px' },
    )
    const tiles = document.querySelectorAll('[data-effect-id]')
    tiles.forEach((t) => observer.observe(t))
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCat, renderedVersion])

  function renderTile(id: number) {
    const renderer = rendererRef.current
    if (!renderer || renderedRef.current.has(id)) return
    const canvas = tileRefs.current.get(id)
    if (!canvas) return
    try {
      renderer.renderThumbnail(id, canvas)
      renderedRef.current.add(id)
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('Thumbnail render failed for', id, err)
      }
    }
  }

  const filtered =
    activeCat === 'all' ? EFFECTS : EFFECTS.filter((e) => e.category === activeCat)

  return (
    <div className="h-full overflow-y-auto bg-ink">
      <canvas
        ref={hiddenCanvasRef}
        width={TILE_SIZE}
        height={TILE_SIZE}
        style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}
      />

      <header className="sticky top-0 z-20 border-b border-white/5 bg-ink/85 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="btn-ghost rounded-full px-3 py-1.5 text-xs">
            <ArrowLeft className="h-3.5 w-3.5" />
            返回
          </Link>
          <div className="text-center">
            <p className="eyebrow">Gallery</p>
            <h1 className="font-display text-2xl text-ink-fg">
              {EFFECTS.length} 种艺术效果
            </h1>
          </div>
          <Link to="/canvas" className="btn-glass rounded-full px-3 py-1.5 text-xs">
            <Sparkles className="h-3.5 w-3.5" />
            开始创作
          </Link>
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-6 pb-3">
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
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {filtered.map((effect) => {
            const pIdx = effect.id % PALETTES.length
            const palette = PALETTES[pIdx]
            const selected = selectedEffectId === effect.id
            return (
              <div
                key={effect.id}
                data-effect-id={effect.id}
                className="group relative aspect-square overflow-hidden rounded-xl border border-white/5 bg-white/[0.02] transition hover:border-white/20"
              >
                <canvas
                  ref={(el) => {
                    if (el) tileRefs.current.set(effect.id, el)
                    else tileRefs.current.delete(effect.id)
                  }}
                  className="absolute inset-0 h-full w-full"
                  style={{
                    background: `linear-gradient(135deg, ${palette.swatches[0]} 0%, ${palette.swatches[2]} 50%, ${palette.swatches[4]} 100%)`,
                  }}
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/10" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 p-2.5">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-ink-muted">
                    {CATEGORY_LABEL[effect.category]} · #{effect.id + 1}
                  </p>
                  <p className="truncate text-xs font-medium text-ink-fg">
                    {effect.name}
                  </p>
                </div>
                {selected && (
                  <div className="pointer-events-none absolute inset-0 rounded-xl border-2 border-accent" />
                )}
                <button
                  className="absolute inset-0 cursor-pointer"
                  onClick={() => setSelectedEffectId(selected ? null : effect.id)}
                  aria-label={`选择 ${effect.name}`}
                />
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}
