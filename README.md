# ArtCam

Gesture-driven generative art camera. Open your webcam, pinch with both hands, and drop rectangular art frames onto the live feed. Each frame is filled with one of 272 built-in procedural effects. Frames overlap with the newest on top and every effect is fully dynamic — re-rendered every frame using `time` so the art keeps moving.

Live site: <https://artcam.n0th1n3ssd0ma1n.top>

## Stack

- React 18 + TypeScript + Vite 6
- Tailwind CSS 3 + framer-motion + lucide-react
- WebGL2 (raw, no Three.js) for the effect renderer
- `@mediapipe/tasks-vision` HandLandmarker for hand tracking
- HashRouter for GitHub Pages
- Zustand for state

## Effects

34 pure-generative algorithmic primitives — every effect is derived from math (noise, fractals, attractors, SDFs) rather than filtering the camera feed:

- **Fractals**: JuliaSet, Mandelbrot, BurningShip, Newton, Tricorn
- **Strange attractors**: Clifford, DeJong, Pickover, Lorenz, Henon
- **Domain warp & flow**: DomainWarp, FlowField, CurlNoise
- **Noise fields**: FBMRidge, Voronoi, Worley
- **Sacred geometry**: FlowerOfLife, Metatron, SriYantra, Mandala
- **Liquid**: LiquidMarble, ReactionDiff, PlasmaField
- **Geometric tiles**: Kaleidoscope, Truchet, HexTiling
- **Waves**: WaveInterfere, SpiralVortex, Aurora, Interference
- **Scenes**: Tunnel, OilFlow, MagneticField, BlackHole

Combined with 8 curated palettes (Sunset, Cyberpunk, MonoInk, Pastel, Neon, Earth, Vaporwave, GoldLeaf) for 34 × 8 = 272 registered effects. The GLSL preamble exposes `fbm`, `fbmRidge`, `warp`, `smin`, `sdCircle/Box/Segment/Ring`, `cosPalette`, `paletteSample`, `rot2`, `polar`, and more, so each algorithm has a rich vocabulary to draw from.

## Develop

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Output is in `dist/`, deployable to any static host. GitHub Actions workflow in `.github/workflows/deploy.yml` builds and deploys to GitHub Pages on push to `main`.

## Repo setup

After pushing to <https://github.com/StarsailsClover/ArtCam>:

1. Settings → Pages → Source = "GitHub Actions"
2. DNS: CNAME `artcam` → `starsailsclover.github.io`
