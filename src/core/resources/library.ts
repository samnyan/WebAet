import { decodeTexture, spriteAliases, type Sprite, type SpriteSet, type Texture } from './sprites'
export class SpriteLibrary {
  readonly entries = new Map<string, { sprite: Sprite; texture: Texture }>()
  private canvases = new Map<Texture, HTMLCanvasElement>()
  readonly sets: SpriteSet[] = []
  add(set: SpriteSet) {
    this.sets.push(set)
    for (const sprite of set.sprites) { const texture = set.textures[sprite.texture]; if (texture) for (const alias of spriteAliases(sprite.name)) this.entries.set(alias, { sprite, texture }) }
  }
  find(name: string) { return this.entries.get(name.toUpperCase()) }
  image(texture: Texture) {
    let canvas = this.canvases.get(texture)
    if (!canvas) {
      canvas = document.createElement('canvas'); canvas.width = texture.width; canvas.height = texture.height
      const ctx = canvas.getContext('2d')!; ctx.putImageData(new ImageData(new Uint8ClampedArray(decodeTexture(texture)), texture.width, texture.height), 0, 0)
      this.canvases.set(texture, canvas)
    }
    return canvas
  }
  clear() { this.entries.clear(); this.canvases.clear(); this.sets.length = 0 }
}
