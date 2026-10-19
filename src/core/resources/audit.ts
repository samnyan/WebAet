import type { AetDocument } from '../aet/types'

export interface SpriteResolver { find(name: string, id?: number): unknown }
/** Inspect source metadata only; never decode texture pixels. */
export function unresolvedSpriteSources(doc: AetDocument | null, library: SpriteResolver): string[] {
  const missing = new Map<string, string>()
  for (const scene of doc?.scenes ?? []) for (const video of scene.videos) for (const source of video.sources) {
    if (!library.find(source.name, source.id)) {
      const key = `${source.id}:${source.name}`
      missing.set(key, `Sprite 未解析: ${source.name} (ID ${source.id})`)
    }
  }
  return [...missing.values()]
}
