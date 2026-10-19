import { decodeTexture, spriteAliases, type Sprite, type SpriteSet, type Texture } from './sprites'
import type { SpriteDatabaseEntry } from './database'
export class SpriteLibrary {
  readonly entries = new Map<string, { sprite: Sprite; texture: Texture }>()
  readonly ids = new Map<number, { sprite: Sprite; texture: Texture }>()
  private database: SpriteDatabaseEntry[] = []
  private canvases = new Map<Texture, HTMLCanvasElement>()
  readonly sets: SpriteSet[] = []
  add(set: SpriteSet) {
    const previous = this.sets.findIndex(s => s.name.toLowerCase() === set.name.toLowerCase())
    if (previous >= 0) this.sets.splice(previous, 1)
    this.sets.push(set)
    const prefix = set.name.replace(/^spr_/i, '').replace(/\.bin$/i, '').toUpperCase()
    for (const sprite of set.sprites) { const texture = set.textures[sprite.texture]; if (texture) for (const alias of [...spriteAliases(sprite.name), ...spriteAliases(`${prefix}_${sprite.name}`)]) this.entries.set(alias, { sprite, texture }) }
    this.resolveIds()
  }
  bindDatabase(entries: SpriteDatabaseEntry[]) { this.database = entries; this.resolveIds() }
  private resolveIds() {
    this.ids.clear()
    for (const entry of this.database) {
      const set = this.sets.find(s => s.name.toLowerCase() === entry.set), sprite = set?.sprites[entry.index], texture = sprite && set?.textures[sprite.texture]
      if (sprite && texture) { this.ids.set(entry.id, { sprite, texture }); for (const alias of spriteAliases(entry.name)) this.entries.set(alias, { sprite, texture }) }
    }
  }
  find(name: string, id?: number) { return (id === undefined ? undefined : this.ids.get(id)) ?? this.entries.get(name.toUpperCase()) }
  image(texture: Texture) {
    let canvas = this.canvases.get(texture)
    if (!canvas) {
      canvas = document.createElement('canvas'); canvas.width = texture.width; canvas.height = texture.height
      // Sprite rectangles use a top-left atlas origin, unlike raw TXP rows.
      const decoded = decodeTexture(texture), pixels = new Uint8ClampedArray(decoded.length), stride = texture.width * 4
      for (let y = 0; y < texture.height; y++) pixels.set(decoded.subarray(y * stride, (y + 1) * stride), (texture.height - 1 - y) * stride)
      const ctx = canvas.getContext('2d')!; ctx.putImageData(new ImageData(pixels, texture.width, texture.height), 0, 0)
      this.canvases.set(texture, canvas)
    }
    return canvas
  }
  clear() { this.entries.clear(); this.canvases.clear(); this.sets.length = 0 }
}
