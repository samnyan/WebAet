import { decodeTexture, spriteAliases, type Sprite, type SpriteSet, type Texture } from './sprites'
import type { SpriteDatabaseEntry } from './database'
export class SpriteLibrary {
  readonly entries = new Map<string, { sprite: Sprite; texture: Texture }>()
  readonly ids = new Map<number, { sprite: Sprite; texture: Texture }>()
  private database: SpriteDatabaseEntry[] = []
  private canvases = new Map<Texture, HTMLCanvasElement>()
  readonly sets: SpriteSet[] = []
  private decodedBytes = 0
  readonly decodedBudget: number
  constructor(decodedBudget = 128 * 1024 * 1024) {
    if (!Number.isFinite(decodedBudget) || decodedBudget < 0) throw new Error('Invalid texture cache budget')
    this.decodedBudget = decodedBudget
  }
  get cacheStats() { return { textures: this.canvases.size, bytes: this.decodedBytes, budget: this.decodedBudget } }
  private release(texture: Texture) {
    const canvas = this.canvases.get(texture)
    if (!canvas) return
    this.decodedBytes -= canvas.width * canvas.height * 4
    this.canvases.delete(texture); canvas.width = canvas.height = 0
  }
  add(set: SpriteSet) {
    const previous = this.sets.findIndex(s => s.name.toLowerCase() === set.name.toLowerCase())
    if (previous >= 0) {
      const removed = this.sets.splice(previous, 1)[0]!
      for (const texture of removed.textures) if (!this.sets.some(s => s.textures.includes(texture)) && !set.textures.includes(texture)) this.release(texture)
    }
    this.sets.push(set)
    if (previous >= 0) this.rebuildEntries()
    else { this.indexSet(set); this.resolveIds() }
  }
  private indexSet(set: SpriteSet) {
    const prefix = set.name.replace(/^spr_/i, '').replace(/\.bin$/i, '').toUpperCase()
    for (const sprite of set.sprites) {
      const texture = set.textures[sprite.texture]
      if (texture) { const entry = { sprite, texture }; for (const alias of [...spriteAliases(sprite.name), ...spriteAliases(`${prefix}_${sprite.name}`)]) this.entries.set(alias, entry) }
    }
  }
  private rebuildEntries() {
    this.entries.clear()
    for (const set of this.sets) this.indexSet(set)
    this.resolveIds()
  }
  bindDatabase(entries: SpriteDatabaseEntry[]) { this.database = entries; this.rebuildEntries() }
  private resolveIds() {
    this.ids.clear()
    const sets = new Map(this.sets.map(set => [set.name.toLowerCase(), set]))
    for (const entry of this.database) {
      const set = sets.get(entry.set.toLowerCase()), sprite = set?.sprites[entry.index], texture = sprite && set?.textures[sprite.texture]
      if (sprite && texture) { this.ids.set(entry.id, { sprite, texture }); for (const alias of spriteAliases(entry.name)) this.entries.set(alias, { sprite, texture }) }
    }
  }
  sourceFor(setName: string, index: number) { return this.database.find(entry => entry.set.toLowerCase() === setName.split('/').at(-1)!.toLowerCase() && entry.index === index) }
  find(name: string, id?: number) { return (id === undefined ? undefined : this.ids.get(id)) ?? this.entries.get(name.toUpperCase()) }
  image(texture: Texture) {
    let canvas = this.canvases.get(texture)
    if (canvas) { this.canvases.delete(texture); this.canvases.set(texture, canvas) }
    if (!canvas) {
      const bytes = texture.width * texture.height * 4
      // Decode before allocating a canvas or evicting usable cached images.
      const decoded = decodeTexture(texture), pixels = new Uint8ClampedArray(decoded.length), stride = texture.width * 4
      canvas = document.createElement('canvas'); canvas.width = texture.width; canvas.height = texture.height
      // Sprite rectangles use a top-left atlas origin, unlike raw TXP rows.
      for (let y = 0; y < texture.height; y++) pixels.set(decoded.subarray(y * stride, (y + 1) * stride), (texture.height - 1 - y) * stride)
      try {
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Unable to create texture canvas context')
        ctx.putImageData(new ImageData(pixels, texture.width, texture.height), 0, 0)
      } catch (error) { canvas.width = canvas.height = 0; throw error }
      // Keep at most one oversized texture to avoid decoding it for every sprite.
      while (this.canvases.size && this.decodedBytes + bytes > this.decodedBudget) this.release(this.canvases.keys().next().value!)
      this.canvases.set(texture, canvas); this.decodedBytes += bytes
    }
    return canvas
  }
  clear() { this.entries.clear(); this.ids.clear(); this.database = []; for (const texture of [...this.canvases.keys()]) this.release(texture); this.sets.length = 0 }
}
