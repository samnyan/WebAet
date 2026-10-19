import type { Layer, Scene, Video } from '../aet/types'
import { sampleCurve, type Matrix } from '../animation/curves'
import { identity4, multiply4, layerMatrix4, orthographicMatrix, type Matrix4 } from '../animation/transform3d'
export interface DrawItem { layer: Layer; path: number[]; matrix: Matrix; opacity: number; video: Video; sourceName: string; sourceId?: number; blend: number; matte: number; mask?: DrawItem }
export interface Evaluation { items: DrawItem[]; warnings: string[] }
export function layerMatrix(layer: Layer, frame: number): Matrix {
  return orthographicMatrix(layerMatrix4(layer, frame))
}
export function evaluateScene(scene: Scene, composition: number, frame: number, hidden: ReadonlySet<number> = new Set(), isolated: number | null = null, view: Matrix4 = identity4()): Evaluation {
  const items: DrawItem[] = [], warnings = new Set<string>()
  // AetObj keeps pending sprite state across recursive DispComp calls.
  let pendingMatte: DrawItem | undefined
  const walk = (id: number, time: number, base: Matrix4, alpha: number, path: number[], ancestors: Set<number>) => {
    if (ancestors.has(id)) { warnings.add('Composition cycle omitted'); return }
    const comp = scene.compositions.find(c => c.offset === id); if (!comp) return
    const next = new Set(ancestors); next.add(id)
    const parentMatrix = (l: Layer, seen = new Set<number>()): Matrix4 => {
      if (!l.parent) return identity4()
      if (seen.has(l.parent)) { warnings.add('Parent cycle omitted'); return identity4() }
      const p = comp.layers.find(x => x.offset === l.parent); if (!p) return identity4()
      seen.add(p.offset); return multiply4(parentMatrix(p, seen), layerMatrix4(p, time))
    }
    for (const l of [...comp.layers].reverse()) {
      if (isolated !== null && path.length === 0 && l.offset !== isolated && !pendingMatte) continue
      if (hidden.has(l.offset) || (!(l.flags & 1) && !pendingMatte) || time < l.start || time >= l.end) continue
      if (l.video?.extra) warnings.add('3D transforms use orthographic preview; camera/perspective not applied')
      if (l.itemType === 2) { warnings.add('Audio playback is not supported'); continue }
      const matrix = multiply4(multiply4(base, parentMatrix(l)), layerMatrix4(l, time))
      const opacity = alpha * (l.video ? Math.max(0, Math.min(1, sampleCurve(l.video.curves.opacity, time))) : 1)
      const local = (time - l.start) * l.timeScale + l.timeOffset, currentPath = [...path, l.offset]
      if (l.itemType === 3) {
        walk(l.item, local, matrix, opacity, currentPath, next); continue
      }
      const video = scene.videos.find(v => v.offset === l.item)
      if (!video || (opacity <= 0 && !pendingMatte && !l.video?.matte)) continue
      const source = video.sources[Math.max(0, Math.min(video.sources.length - 1, Math.floor(local * video.frames)))]
      const item: DrawItem = { layer: l, path: currentPath, matrix: orthographicMatrix(multiply4(view, matrix)), opacity, video, sourceName: source?.name ?? '', sourceId: source?.id, blend: l.video?.blend ?? 3, matte: l.video?.matte ?? 0 }
      // Runtime draws back-to-front: a matte-tagged source is retained, then masked by the next sprite.
      if (pendingMatte) { pendingMatte.mask = item; items.push(pendingMatte); pendingMatte = undefined }
      else if (item.matte) pendingMatte = item
      else items.push(item)
    }
  }
  walk(composition, frame, identity4(), 1, [], new Set())
  if (pendingMatte) warnings.add(`Unpaired track matte: ${pendingMatte.layer.name}`)
  return { items: isolated === null ? items : items.filter(item => item.path[0] === isolated), warnings: [...warnings] }
}
