import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Github, Images } from 'lucide-react'
import { EFFECT_COUNT } from '@/gl/effects'

function runParticleField(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
  let raf = 0
  let w = 0
  let h = 0
  const dpr = Math.min(window.devicePixelRatio || 1, 2)

  function resize() {
    w = canvas.clientWidth
    h = canvas.clientHeight
    canvas.width = Math.floor(w * dpr)
    canvas.height = Math.floor(h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  resize()
  window.addEventListener('resize', resize)

  const particles = Array.from({ length: 60 }, () => ({
    x: Math.random(),
    y: Math.random(),
    vx: (Math.random() - 0.5) * 0.0006,
    vy: (Math.random() - 0.5) * 0.0006,
    r: Math.random() * 1.5 + 0.4,
    hue: Math.random() * 60 + 340,
  }))

  function draw() {
    ctx.clearRect(0, 0, w, h)
    const g = ctx.createRadialGradient(w * 0.5, h * 0.55, 0, w * 0.5, h * 0.55, Math.max(w, h))
    g.addColorStop(0, 'rgba(255,59,48,0.10)')
    g.addColorStop(0.4, 'rgba(255,59,48,0.02)')
    g.addColorStop(1, 'rgba(10,10,12,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)

    for (const p of particles) {
      p.x += p.vx
      p.y += p.vy
      if (p.x < 0 || p.x > 1) p.vx *= -1
      if (p.y < 0 || p.y > 1) p.vy *= -1
      const px = p.x * w
      const py = p.y * h
      ctx.beginPath()
      ctx.arc(px, py, p.r, 0, Math.PI * 2)
      ctx.fillStyle = `hsla(${p.hue}, 80%, 70%, 0.65)`
      ctx.fill()
    }

    ctx.lineWidth = 1
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i]
        const b = particles[j]
        const dx = (a.x - b.x) * w
        const dy = (a.y - b.y) * h
        const d = Math.hypot(dx, dy)
        if (d < 140) {
          ctx.strokeStyle = `rgba(245,245,247,${(1 - d / 140) * 0.12})`
          ctx.beginPath()
          ctx.moveTo(a.x * w, a.y * h)
          ctx.lineTo(b.x * w, b.y * h)
          ctx.stroke()
        }
      }
    }

    raf = requestAnimationFrame(draw)
  }
  draw()

  return () => {
    window.removeEventListener('resize', resize)
    cancelAnimationFrame(raf)
  }
}

export default function WelcomeHero() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Lightweight 2D particle field for atmospheric background.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    return runParticleField(canvas, ctx)
  }, [])

  return (
    <section className="relative h-full w-full overflow-hidden bg-ink">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div className="grain absolute inset-0" />

      {/* Floating accent blobs */}
      <div
        className="pointer-events-none absolute -left-32 top-1/4 h-96 w-96 rounded-full opacity-30 blur-3xl"
        style={{ background: 'radial-gradient(circle, #ff3b30 0%, transparent 70%)' }}
      />
      <div
        className="pointer-events-none absolute -right-24 bottom-1/4 h-80 w-80 rounded-full opacity-20 blur-3xl"
        style={{ background: 'radial-gradient(circle, #22d3ee 0%, transparent 70%)' }}
      />

      {/* Top bar */}
      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-6 py-5 md:px-10">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-accent" />
          <span className="font-mono text-xs uppercase tracking-[0.28em] text-ink-dim">
            ArtCam
          </span>
        </div>
        <nav className="flex items-center gap-2">
          <Link to="/gallery" className="btn-ghost rounded-full px-3 py-1.5 text-xs">
            <Images className="h-3.5 w-3.5" />
            Gallery
          </Link>
          <a
            href="https://github.com/StarsailsClover/ArtCam"
            target="_blank"
            rel="noreferrer"
            className="btn-ghost rounded-full px-3 py-1.5 text-xs"
          >
            <Github className="h-3.5 w-3.5" />
            Source
          </a>
        </nav>
      </header>

      {/* Hero content */}
      <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center">
        <motion.p
          className="eyebrow mb-6"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          Gesture · Camera · Generative Art
        </motion.p>

        <motion.h1
          className="font-display text-[clamp(3.5rem,12vw,9rem)] font-light leading-[0.92] tracking-tightest text-ink-fg"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        >
          Art<span className="italic text-accent">Cam</span>
        </motion.h1>

        <motion.p
          className="mt-6 max-w-xl text-balance text-base text-ink-dim md:text-lg"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        >
          打开摄像头，用双手食指与拇指的捏合动作，
          在真实画面上即兴摆放矩形画框，
          每个画框内随机应用{' '}
          <span className="text-ink-fg">{EFFECT_COUNT} 种</span>{' '}
          内置艺术效果之一。
        </motion.p>

        <motion.div
          className="mt-10 flex flex-col items-center gap-4 sm:flex-row"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
        >
          <Link to="/canvas" className="btn-accent group px-6 py-3 text-base">
            开始创作
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <Link to="/gallery" className="btn-glass px-6 py-3 text-base">
            浏览效果图鉴
          </Link>
        </motion.div>

        <motion.div
          className="mt-16 flex items-center gap-6 font-mono text-[10px] uppercase tracking-wider text-ink-muted"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.9 }}
        >
          <span>WebGL2</span>
          <span className="h-1 w-1 rounded-full bg-ink-muted/40" />
          <span>MediaPipe Hands</span>
          <span className="h-1 w-1 rounded-full bg-ink-muted/40" />
          <span>No install</span>
        </motion.div>
      </div>

      {/* Bottom hint */}
      <motion.div
        className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2 pb-6 text-ink-muted"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 1.2 }}
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.28em]">
          需要摄像头权限
        </span>
      </motion.div>
    </section>
  )
}
