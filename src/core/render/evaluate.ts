import type { Layer, Scene, Video } from '../aet/types'
import { identity, multiply, sampleCurve, type Matrix } from '../animation/curves'
export interface DrawItem { layer: Layer; path: number[]; matrix: Matrix; opacity: number; video: Video; sourceName: string; sourceId?: number; blend: number; matte: number }
export interface Evaluation { items: DrawItem[]; warnings: string[] }
export function layerMatrix(layer: Layer, frame: number): Matrix {
  if (!layer.video) return identity()
  const c = layer.video.curves, s = (key: keyof typeof c) => sampleCurve(c[key], frame)
  const a = s('rotation') * Math.PI / 180, sx = s('scaleX'), sy = s('scaleY'), cos = Math.cos(a), sin = Math.sin(a)
  const m: Matrix = [cos * sx, sin * sx, -sin * sy, cos * sy, s('positionX'), s('positionY')]
  m[4] -= m[0] * s('anchorX') + m[2] * s('anchorY'); m[5] -= m[1] * s('anchorX') + m[3] * s('anchorY')
  return m
}
export function evaluateScene(scene: Scene, composition: number, frame: number, hidden: ReadonlySet<number> = new Set(), isolated: number | null = null): Evaluation {
  const items: DrawItem[] = [], warnings = new Set<string>()
  const walk = (id: number, time: number, base: Matrix, alpha: number, path: number[], ancestors: Set<number>) => {
    if (ancestors.has(id)) { warnings.add('Composition cycle omitted'); return }
    const comp = scene.compositions.find(c => c.offset === id); if (!comp) return
    const next = new Set(ancestors); next.add(id)
    const parentMatrix = (l: Layer, seen = new Set<number>()): Matrix => {
      if (!l.parent) return identity()
      if (seen.has(l.parent)) { warnings.add('Parent cycle omitted'); return identity() }
      const p = comp.layers.find(x => x.offset === l.parent); if (!p) return identity()
      seen.add(p.offset); return multiply(parentMatrix(p, seen), layerMatrix(p, time))
    }
    for (const l of [...comp.layers].reverse()) {
      if (isolated !== null && path.length === 0 && l.offset !== isolated) continue
      if (hidden.has(l.offset) || !(l.flags & 1) || time < l.start || time >= l.end) continue
      if (l.video?.extra) warnings.add('3D layers shown using their 2D transform; camera/perspective not applied')
      if (l.video?.matte) warnings.add('Track matte is preserved but not rendered')
      if (l.itemType === 2) { warnings.add('Audio playback is not supported'); continue }
      const matrix = multiply(multiply(base, parentMatrix(l)), layerMatrix(l, time))
      const opacity = alpha * (l.video ? Math.max(0, Math.min(1, sampleCurve(l.video.curves.opacity, time))) : 1)
      const local = (time - l.start) * l.timeScale + l.timeOffset, currentPath = [...path, l.offset]
      if (l.itemType === 3) { walk(l.item, local, matrix, opacity, currentPath, next); continue }
      const video = scene.videos.find(v => v.offset === l.item)
      if (!video || opacity <= 0) continue
      const source = video.sources[Math.max(0, Math.min(video.sources.length - 1, Math.floor(local * video.frames)))]
      items.push({ layer: l, path: currentPath, matrix, opacity, video, sourceName: source?.name ?? '', sourceId: source?.id, blend: l.video?.blend ?? 3, matte: l.video?.matte ?? 0 })
    }
  }
  walk(composition, frame, identity(), 1, [], new Set())
  return { items, warnings: [...warnings] }
}
