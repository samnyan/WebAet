import type { DrawItem } from './evaluate'
import { point, identity } from '../animation/curves'
import { drawPerspective, perspectivePoint, clipPerspective } from './perspective'
import type { SpriteLibrary } from '../resources/library'
const blends: Record<number, GlobalCompositeOperation> = { 1: 'copy', 3: 'source-over', 5: 'lighter', 6: 'multiply', 7: 'screen', 8: 'overlay', 9: 'soft-light', 10: 'hard-light', 11: 'darken', 12: 'lighten', 14: 'hue', 15: 'saturation', 16: 'color', 17: 'luminosity', 26: 'exclusion', 27: 'difference', 28: 'color-dodge', 29: 'color-burn' }
export interface HitArea { item: DrawItem; points: { x: number; y: number }[] }
// Scratch surfaces belong to the destination context. Leases keep recursive
// matte/perspective draws independent, without retaining one surface per sprite.
const scratchPools = new WeakMap<CanvasRenderingContext2D, CanvasRenderingContext2D[]>()
function scratch(owner: CanvasRenderingContext2D, width: number, height: number) {
  let pool = scratchPools.get(owner)
  if (!pool) { pool = []; scratchPools.set(owner, pool) }
  const ctx = pool.pop() ?? document.createElement('canvas').getContext('2d')!
  if (ctx.canvas.width !== width || ctx.canvas.height !== height) { ctx.canvas.width = width; ctx.canvas.height = height }
  else ctx.clearRect(0, 0, width, height)
  ctx.save()
  return { ctx, release() { ctx.restore(); if (pool!.length < 2) pool!.push(ctx) } }
}
export function drawItems(ctx: CanvasRenderingContext2D, items: DrawItem[], library: SpriteLibrary, selected: number | null, wireframe: boolean, collectHits = true): { hits: HitArea[]; warnings: string[] } {
  const hits: HitArea[] = [], warnings = new Set<string>()
  for (const item of items) {
    if (item.mask && !wireframe) {
      // Composite in backing-store coordinates so zoom, pan and device scale match the stage.
      const sourceLease = scratch(ctx, ctx.canvas.width, ctx.canvas.height), maskLease = scratch(ctx, ctx.canvas.width, ctx.canvas.height)
      const s = sourceLease.ctx, m = maskLease.ctx, source = s.canvas, mask = m.canvas
      try {
      const transform = ctx.getTransform()
      s.setTransform(transform); m.setTransform(transform)
      const plain = { ...item, mask: undefined, blend: 3 }
      const drawn = drawItems(s, [plain], library, selected, false, collectHits)
      const masked = drawItems(m, [{ ...item.mask, blend: 3 }], library, null, false, false)
      for (const warning of [...drawn.warnings, ...masked.warnings]) warnings.add(warning)
      if (item.matte === 3 || item.matte === 4) {
        // Canvas returns unpremultiplied sRGB. Convert luminance to coverage;
        // transparent pixels must remain zero coverage before optional inversion.
        const pixels = m.getImageData(0, 0, mask.width, mask.height)
        for (let i = 0; i < pixels.data.length; i += 4) {
          const data = pixels.data
          data[i + 3] = Math.round(data[i + 3]! * (0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!) / 255)
        }
        m.putImageData(pixels, 0, 0)
      } else if (item.matte !== 1 && item.matte !== 2) warnings.add(`Unknown track matte mode ${item.matte} uses alpha preview`)
      s.resetTransform(); s.globalCompositeOperation = item.matte === 2 || item.matte === 4 ? 'destination-out' : 'destination-in'; s.drawImage(mask, 0, 0)
      ctx.save(); ctx.resetTransform(); ctx.globalCompositeOperation = blends[item.blend] ?? 'source-over'; ctx.drawImage(source, 0, 0); ctx.restore()
      hits.push(...drawn.hits)
      } finally { maskLease.release(); sourceLease.release() }
      continue
    }
    const entry = library.find(item.sourceName, item.sourceId), w = entry?.sprite.width ?? item.video.width, h = entry?.sprite.height ?? item.video.height
    if (item.perspective && item.world && w > 0 && h > 0) {
      const polygon = clipPerspective(item.world, [[0, 0], [w, 0], [w, h], [0, h]], item.perspective)
      const points = polygon.map(([x, y]) => perspectivePoint(item.world!, x, y, item.perspective!))
      if (points.length < 3 || points.some(p => !p)) continue
      const lease = scratch(ctx, Math.max(1, Math.min(4096, Math.ceil(w))), Math.max(1, Math.min(4096, Math.ceil(h))))
      try {
        const local = lease.ctx, texture = local.canvas; local.scale(texture.width / w, texture.height / h)
        const rendered = drawItems(local, [{ ...item, perspective: undefined, matrix: identity(), opacity: 1, blend: 3 }], library, selected, wireframe, false)
        for (const warning of rendered.warnings) warnings.add(warning)
        ctx.save(); ctx.globalAlpha *= item.opacity; ctx.globalCompositeOperation = blends[item.blend] ?? 'source-over'
        drawPerspective(ctx, texture, item.world, item.perspective, w, h); ctx.restore()
        if (collectHits) hits.push({ item, points: points as { x: number; y: number }[] })
      } finally { lease.release() }
      continue
    }
    ctx.save(); ctx.transform(...item.matrix); ctx.globalAlpha *= item.opacity
    ctx.globalCompositeOperation = blends[item.blend] ?? 'source-over'
    if (!(item.blend in blends)) warnings.add(`Blend mode ${item.blend} uses normal preview`)
    if (entry && !wireframe) {
      try { const image = library.image(entry.texture), s = entry.sprite; ctx.drawImage(image, s.x, s.y, s.width, s.height, 0, 0, w, h) }
      catch (e) { warnings.add(String(e)) }
    } else if (!item.sourceName && !wireframe) { const c = item.video.color; ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; ctx.fillRect(0, 0, w, h) }
    else {
      if (item.sourceName && !entry) warnings.add(`Missing sprite: ${item.sourceName}`)
      ctx.fillStyle = '#738dac22'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#748da8'; ctx.lineWidth = 1; ctx.strokeRect(0, 0, w, h)
      ctx.fillStyle = '#adc2da'; ctx.font = '14px sans-serif'; ctx.fillText(item.sourceName || item.layer.name, 4, 17, Math.max(1, w - 8))
    }
    if (selected === item.layer.offset) { ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = '#62d8c1'; ctx.lineWidth = 2; ctx.strokeRect(0, 0, w, h) }
    ctx.restore()
    if (collectHits) hits.push({ item, points: [point(item.matrix, 0, 0), point(item.matrix, w, 0), point(item.matrix, w, h), point(item.matrix, 0, h)] })
  }
  return { hits, warnings: [...warnings] }
}
export function hitTest(hits: HitArea[], x: number, y: number): DrawItem | undefined {
  for (const hit of [...hits].reverse()) {
    let inside = false; const p = hit.points
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const a = p[i]!, b = p[j]!; if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside }
    if (inside) return hit.item
  }
}
