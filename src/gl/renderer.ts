import type { ArtEffect, PlacedRect } from '@/types'
import { getEffect } from './effects'
import {
  VERTEX_SHADER,
  RECT_VERTEX_SHADER,
  COMPOSITE_FRAGMENT,
  EFFECT_FRAGMENT_TEMPLATE,
} from './shaders'

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, src)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`Shader compile failed: ${log}\n--- source ---\n${src}`)
  }
  return shader
}

function linkProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc)
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc)
  const program = gl.createProgram()!
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program)
    gl.deleteProgram(program)
    throw new Error(`Program link failed: ${log}`)
  }
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  return program
}

function buildEffectFragment(effect: ArtEffect): string {
  return EFFECT_FRAGMENT_TEMPLATE.replace('%%BODY%%', effect.glslBody)
}

/**
 * Build a small synthetic scene (video + mask) for gallery thumbnails, so
 * effects have something to transform even when the camera is off. The scene
 * is intentionally abstract (a soft "head" oval over a gradient) — it is a
 * test pattern, not a fake photo.
 */
function buildThumbnailScene(): { video: HTMLCanvasElement; mask: HTMLCanvasElement } {
  const w = 256
  const h = 256
  const video = document.createElement('canvas')
  video.width = w
  video.height = h
  const vctx = video.getContext('2d')!
  // Vertical gradient background.
  const grad = vctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, '#2a2438')
  grad.addColorStop(1, '#0d1117')
  vctx.fillStyle = grad
  vctx.fillRect(0, 0, w, h)
  // Soft "head" oval in the center with skin-ish tone.
  const headGrad = vctx.createRadialGradient(w / 2, h * 0.42, 10, w / 2, h * 0.42, h * 0.4)
  headGrad.addColorStop(0, '#f3d2b3')
  headGrad.addColorStop(0.6, '#b88a6a')
  headGrad.addColorStop(1, 'rgba(60,40,30,0)')
  vctx.fillStyle = headGrad
  vctx.beginPath()
  vctx.ellipse(w / 2, h * 0.42, w * 0.22, h * 0.3, 0, 0, Math.PI * 2)
  vctx.fill()
  // Shoulders.
  vctx.fillStyle = 'rgba(80,90,120,0.85)'
  vctx.beginPath()
  vctx.ellipse(w / 2, h * 0.95, w * 0.45, h * 0.18, 0, 0, Math.PI * 2)
  vctx.fill()
  // Sparse noise so brightness-based effects have variation.
  const img = vctx.getImageData(0, 0, w, h)
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 18
    img.data[i] = Math.max(0, Math.min(255, img.data[i] + n))
    img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] + n))
    img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] + n))
  }
  vctx.putImageData(img, 0, 0)

  const mask = document.createElement('canvas')
  mask.width = w
  mask.height = h
  const mctx = mask.getContext('2d')!
  mctx.fillStyle = '#000'
  mctx.fillRect(0, 0, w, h)
  // Person mask = head + shoulders (white = person).
  mctx.fillStyle = '#fff'
  mctx.beginPath()
  mctx.ellipse(w / 2, h * 0.42, w * 0.22, h * 0.3, 0, 0, Math.PI * 2)
  mctx.fill()
  mctx.beginPath()
  mctx.ellipse(w / 2, h * 0.95, w * 0.45, h * 0.18, 0, 0, Math.PI * 2)
  mctx.fill()

  return { video, mask }
}

/**
 * WebGL2 renderer that maintains:
 *   - a persistent art FBO (the cumulative placed rectangles)
 *   - a video texture (uploaded each frame)
 *   - a person-segmentation mask texture (uploaded each frame)
 *   - a composite shader that mixes video + art for display
 *
 * Rendering pipeline per frame:
 *   1. uploadVideoFrame(video)            — refresh camera texture
 *   2. uploadMaskFrame(maskSource)        — refresh person mask texture
 *   3. renderComposite(mirror)            — clear art FBO, redraw ALL placed
 *      rects (each animated by `time`), then composite video + art to screen.
 *
 * Re-rendering every rect every frame is intentional: it keeps every placed
 * effect live and dynamic (algorithms use `time` to animate). For typical
 * session sizes (< 30 rects) this is well within budget on modern GPUs.
 */
export class ArtRenderer {
  private gl: WebGL2RenderingContext
  private canvas: HTMLCanvasElement
  private videoTexture: WebGLTexture
  private maskTexture: WebGLTexture
  private artTexture: WebGLTexture
  private artFBO: WebGLFramebuffer
  private quadVBO: WebGLBuffer
  private compositeProgram: WebGLProgram
  private effectProgramCache = new Map<number, WebGLProgram>()
  private placedRects: PlacedRect[] = []
  private width = 0
  private height = 0
  private startTime = performance.now()
  // Synthetic scene for gallery thumbnails (lazily built).
  private thumbScene: { video: HTMLCanvasElement; mask: HTMLCanvasElement } | null = null
  // Whether a real video frame has been uploaded yet. Controls thumbnail source.
  private hasRealVideo = false

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      alpha: false,
    })
    if (!gl) throw new Error('WebGL2 is not supported by this browser.')
    this.gl = gl

    // Flip Y when uploading video/mask so the texture matches canvas orientation.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)

    // Fullscreen / rect quad (two triangles covering [-1,1]×[-1,1]).
    this.quadVBO = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1,
      ]),
      gl.STATIC_DRAW,
    )

    // Video texture (initially a 1×1 dark placeholder).
    this.videoTexture = gl.createTexture()!
    this.bindTextureParams(this.videoTexture)
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([16, 16, 20, 255]),
    )

    // Mask texture (initially all-person = 255, so segmentation effects
    // gracefully treat everything as foreground before the first real mask).
    this.maskTexture = gl.createTexture()!
    this.bindTextureParams(this.maskTexture)
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([255, 255, 255, 255]),
    )

    // Composite program.
    this.compositeProgram = linkProgram(gl, VERTEX_SHADER, COMPOSITE_FRAGMENT)

    // Art FBO (will be (re)allocated in resize()).
    this.artTexture = gl.createTexture()!
    this.artFBO = gl.createFramebuffer()!

    this.resize(canvas.width || 1280, canvas.height || 720)
  }

  private bindTextureParams(tex: WebGLTexture) {
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  }

  resize(width: number, height: number) {
    if (width === this.width && height === this.height) return
    this.width = width
    this.height = height
    const gl = this.gl
    this.canvas.width = width
    this.canvas.height = height

    // Reallocate art texture.
    this.bindTextureParams(this.artTexture)
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null,
    )

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.artFBO)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.artTexture, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  uploadVideoFrame(video: HTMLVideoElement) {
    if (video.readyState < video.HAVE_CURRENT_DATA) return
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, this.videoTexture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video)
    this.hasRealVideo = true
  }

  /** Upload the person-segmentation mask. Source can be a canvas or video. */
  uploadMaskFrame(source: HTMLCanvasElement | HTMLVideoElement | ImageBitmap) {
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, this.maskTexture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
  }

  private getEffectProgram(effectId: number): WebGLProgram {
    let program = this.effectProgramCache.get(effectId)
    if (program) return program
    const effect = getEffect(effectId)
    if (!effect) throw new Error(`Unknown effect id: ${effectId}`)
    const fs = buildEffectFragment(effect)
    program = linkProgram(this.gl, RECT_VERTEX_SHADER, fs)
    this.effectProgramCache.set(effectId, program)
    return program
  }

  private drawQuad() {
    const gl = this.gl
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  private drawRectToArt(rect: PlacedRect, time: number) {
    const gl = this.gl
    const effect = getEffect(rect.effectId)
    if (!effect) return
    const program = this.getEffectProgram(rect.effectId)

    gl.useProgram(program)

    const x1 = Math.min(rect.x1, rect.x2)
    const x2 = Math.max(rect.x1, rect.x2)
    const y1 = Math.min(rect.y1, rect.y2)
    const y2 = Math.max(rect.y1, rect.y2)
    const originX = x1
    // MediaPipe landmarks use top-down Y (0=top of image). The video texture
    // is uploaded with UNPACK_FLIP_Y_WEBGL=true so texture v=0 maps to the
    // bottom of the source image. To place the rect at the correct screen
    // position AND sample the correct video region, flip Y: the rect's bottom
    // (in screen space) corresponds to the larger MediaPipe Y.
    const originY = 1 - y2
    const sizeX = Math.max(0.001, x2 - x1)
    const sizeY = Math.max(0.001, y2 - y1)

    gl.uniform2f(gl.getUniformLocation(program, 'uRectOrigin'), originX, originY)
    gl.uniform2f(gl.getUniformLocation(program, 'uRectSize'), sizeX, sizeY)
    gl.uniform2f(gl.getUniformLocation(program, 'uResolution'), this.width, this.height)
    gl.uniform1f(gl.getUniformLocation(program, 'time'), time)
    gl.uniform1fv(gl.getUniformLocation(program, 'params'), rect.params)
    // palette is a vec3[8] -> upload as flattened float[24].
    gl.uniform3fv(gl.getUniformLocation(program, 'palette'), rect.palette)

    // uVideo -> texture unit 0
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.videoTexture)
    gl.uniform1i(gl.getUniformLocation(program, 'uVideo'), 0)
    // uMask -> texture unit 1
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.maskTexture)
    gl.uniform1i(gl.getUniformLocation(program, 'uMask'), 1)

    this.drawQuad()
  }

  placeRect(rect: PlacedRect) {
    this.placedRects.push(rect)
  }

  undoLastRect() {
    this.placedRects.pop()
  }

  clearAll() {
    this.placedRects = []
  }

  /** Re-render all placed rects to the art FBO using current `time`. */
  private redrawArt(time: number) {
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.artFBO)
    gl.viewport(0, 0, this.width, this.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    // Disable blending — each rect fully overwrites its area (newest on top
    // is determined by draw order, which matches placement order).
    gl.disable(gl.BLEND)
    for (const rect of this.placedRects) {
      this.drawRectToArt(rect, time)
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  renderComposite(mirror: boolean) {
    const gl = this.gl
    const time = (performance.now() - this.startTime) / 1000

    // 1. Re-render all placed rects (animated by `time`).
    this.redrawArt(time)

    // 2. Composite video + art to the default framebuffer.
    gl.useProgram(this.compositeProgram)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.width, this.height)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.videoTexture)
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'uVideo'), 0)

    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.artTexture)
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'uArt'), 1)

    gl.uniform2f(gl.getUniformLocation(this.compositeProgram, 'uResolution'), this.width, this.height)
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'uMirror'), mirror ? 1 : 0)

    gl.disable(gl.BLEND)
    this.drawQuad()
  }

  /** Render one effect as a fullscreen rect to the art FBO (used by Gallery thumbnails). */
  renderThumbnail(effectId: number, outCanvas: HTMLCanvasElement) {
    const effect = getEffect(effectId)
    if (!effect) return
    const program = this.getEffectProgram(effectId)
    const gl = this.gl
    const time = (performance.now() - this.startTime) / 1000

    // Save current state.
    const prevFBO = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null
    const prevViewport = gl.getParameter(gl.VIEWPORT) as Int32Array
    const prevActiveTex = gl.getParameter(gl.ACTIVE_TEXTURE) as number

    // For thumbnails, use the real video frame if available; otherwise use
    // a synthetic test-pattern scene so effects have something to transform.
    let thumbVideo: HTMLVideoElement | HTMLCanvasElement | null = null
    let thumbMask: HTMLCanvasElement | null = null
    if (this.hasRealVideo) {
      // Real video: use the current videoTexture (already bound). Mask: use
      // the current maskTexture (already bound) — it may be the all-ones
      // placeholder if segmentation isn't running, which is fine.
    } else {
      if (!this.thumbScene) this.thumbScene = buildThumbnailScene()
      thumbVideo = this.thumbScene.video
      thumbMask = this.thumbScene.mask
      // Upload synthetic scene to a temporary binding on texture units 0/1.
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.videoTexture)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, thumbVideo)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, this.maskTexture)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, thumbMask)
    }

    // Render to art FBO (use it as scratch).
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.artFBO)
    gl.viewport(0, 0, this.width, this.height)
    gl.disable(gl.BLEND)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    gl.useProgram(program)
    gl.uniform2f(gl.getUniformLocation(program, 'uRectOrigin'), 0, 0)
    gl.uniform2f(gl.getUniformLocation(program, 'uRectSize'), 1, 1)
    gl.uniform2f(gl.getUniformLocation(program, 'uResolution'), this.width, this.height)
    gl.uniform1f(gl.getUniformLocation(program, 'time'), time)
    gl.uniform1fv(gl.getUniformLocation(program, 'params'), effect.params)
    gl.uniform3fv(gl.getUniformLocation(program, 'palette'), effect.palette)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.videoTexture)
    gl.uniform1i(gl.getUniformLocation(program, 'uVideo'), 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.maskTexture)
    gl.uniform1i(gl.getUniformLocation(program, 'uMask'), 1)

    this.drawQuad()

    // Read pixels into outCanvas.
    const pixels = new Uint8Array(this.width * this.height * 4)
    gl.readPixels(0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)

    // Restore previous state.
    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFBO)
    gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3])
    gl.activeTexture(prevActiveTex)

    // Draw pixels to the output 2D canvas (flip Y because GL is bottom-up).
    outCanvas.width = this.width
    outCanvas.height = this.height
    const ctx = outCanvas.getContext('2d')!
    const imageData = ctx.createImageData(this.width, this.height)
    for (let y = 0; y < this.height; y++) {
      const srcRow = (this.height - 1 - y) * this.width * 4
      const dstRow = y * this.width * 4
      imageData.data.set(pixels.subarray(srcRow, srcRow + this.width * 4), dstRow)
    }
    ctx.putImageData(imageData, 0, 0)
  }

  getPlacedRects(): PlacedRect[] {
    return this.placedRects
  }

  getPlacedCount(): number {
    return this.placedRects.length
  }

  /** Composite the canvas to a PNG data URL (for the Save button). */
  toDataURL(): string {
    // Render the composite to the screen FBO first.
    this.renderComposite(true)
    return this.canvas.toDataURL('image/png')
  }

  destroy() {
    const gl = this.gl
    for (const program of this.effectProgramCache.values()) {
      gl.deleteProgram(program)
    }
    this.effectProgramCache.clear()
    gl.deleteProgram(this.compositeProgram)
    gl.deleteBuffer(this.quadVBO)
    gl.deleteTexture(this.videoTexture)
    gl.deleteTexture(this.maskTexture)
    gl.deleteTexture(this.artTexture)
    gl.deleteFramebuffer(this.artFBO)
  }
}
