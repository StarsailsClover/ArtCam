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
 * WebGL2 renderer that maintains:
 *   - a persistent art FBO (the cumulative placed rectangles)
 *   - a video texture (uploaded each frame)
 *   - a composite shader that mixes video + art for display
 *
 * Rendering pipeline per frame:
 *   1. uploadVideoFrame(video)            — refresh camera texture
 *   2. renderComposite(mirror)            — clear art FBO, redraw ALL placed
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
  private artTexture: WebGLTexture
  private artFBO: WebGLFramebuffer
  private quadVBO: WebGLBuffer
  private compositeProgram: WebGLProgram
  private effectProgramCache = new Map<number, WebGLProgram>()
  private placedRects: PlacedRect[] = []
  private width = 0
  private height = 0
  private startTime = performance.now()

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

    // Flip Y when uploading video so the texture matches canvas orientation.
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

    // Video texture (initially a 1×1 placeholder; algorithms don't sample it
    // but the uniform must still bind to a valid texture).
    this.videoTexture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, this.videoTexture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([16, 16, 20, 255]),
    )

    // Composite program.
    this.compositeProgram = linkProgram(gl, VERTEX_SHADER, COMPOSITE_FRAGMENT)

    // Art FBO (will be (re)allocated in resize()).
    this.artTexture = gl.createTexture()!
    this.artFBO = gl.createFramebuffer()!

    this.resize(canvas.width || 1280, canvas.height || 720)
  }

  resize(width: number, height: number) {
    if (width === this.width && height === this.height) return
    this.width = width
    this.height = height
    const gl = this.gl
    this.canvas.width = width
    this.canvas.height = height

    // Reallocate art texture.
    gl.bindTexture(gl.TEXTURE_2D, this.artTexture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
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
    const originY = y1
    const sizeX = Math.max(0.001, x2 - x1)
    const sizeY = Math.max(0.001, y2 - y1)

    gl.uniform2f(gl.getUniformLocation(program, 'uRectOrigin'), originX, originY)
    gl.uniform2f(gl.getUniformLocation(program, 'uRectSize'), sizeX, sizeY)
    gl.uniform2f(gl.getUniformLocation(program, 'uResolution'), this.width, this.height)
    gl.uniform1f(gl.getUniformLocation(program, 'time'), time)
    gl.uniform1fv(gl.getUniformLocation(program, 'params'), rect.params)
    // palette is a vec3[8] -> upload as flattened float[24].
    gl.uniform3fv(gl.getUniformLocation(program, 'palette'), rect.palette)

    // Effect algorithms don't sample uVideo, but the uniform must still be
    // bound to a valid texture unit. Bind the video texture (cheap).
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.videoTexture)
    gl.uniform1i(gl.getUniformLocation(program, 'uVideo'), 0)

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
    this.drawQuad()

    // Read pixels into outCanvas.
    const pixels = new Uint8Array(this.width * this.height * 4)
    gl.readPixels(0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)

    // Restore previous state.
    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFBO)
    gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3])

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
    gl.deleteTexture(this.artTexture)
    gl.deleteFramebuffer(this.artFBO)
  }
}
