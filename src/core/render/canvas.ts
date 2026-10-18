import type { DrawItem } from './evaluate'
import { point } from '../animation/curves'
import type { SpriteLibrary } from '../resources/library'
const blends: Record<number, GlobalCompositeOperation> = { 1: 'copy', 3: 'source-over', 5: 'lighter', 6: 'multiply', 7: 'screen', 8: 'overlay', 9: 'soft-light', 10: 'hard-light', 11: 'darken', 12: 'lighten', 14: 'hue', 15: 'saturation', 16: 'color', 17: 'luminosity', 26: 'exclusion', 27: 'difference', 28: 'color-dodge', 29: 'color-burn' }
export interface HitArea { item: DrawItem; points: { x: number; y: number }[] }
export function drawItems(ctx: CanvasRenderingContext2D, items: DrawItem[], library: SpriteLibrary, selected: number | null, wireframe: boolean): { hits: HitArea[]; warnings: string[] } {
  const hits: HitArea[] = [], warnings = new Set<string>()
  for (const item of items) {
    const entry = library.find(item.sourceName), w = entry?.sprite.width ?? item.video.width, h = entry?.sprite.height ?? item.video.height
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
    hits.push({ item, points: [point(item.matrix, 0, 0), point(item.matrix, w, 0), point(item.matrix, w, h), point(item.matrix, 0, h)] })
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
