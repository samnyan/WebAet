import type { Sprite, SpriteSet, Texture } from './sprites'

export const FGO_SPRITE_TABLE_SIGNATURE = 0x14090116

export interface FgoSpriteEntry {
  index: number
  name: string
  textureName: string
  textureIndex: number
  atlasWidth: number
  atlasHeight: number
  x0: number
  y0: number
  x1: number
  y1: number
  resourceIndex: number
}

export function isFgoSpriteTable(data: Uint8Array): boolean {
  if (data.length < 12) return false
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  return view.getUint32(0, true) === FGO_SPRITE_TABLE_SIGNATURE
}

export function parseFgoSpriteTable(data: Uint8Array): {
  entries: FgoSpriteEntry[]
  textureNames: string[]
} {
  if (!isFgoSpriteTable(data)) {
    throw new Error('Invalid FGO Sprite table signature')
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const recordCount = view.getUint32(4, true)
  if (recordCount > 1_000_000) {
    throw new Error('FGO Sprite table record count is unreasonable')
  }

  let offset = 12
  const rawEntries: {
    index: number
    name: string
    textureName: string
    atlasWidth: number
    atlasHeight: number
    x0: number
    y0: number
    x1: number
    y1: number
    resourceIndex: number
  }[] = []
  const textureNames: string[] = []
  const textureNameSet = new Set<string>()

  const readU32 = () => {
    if (offset + 4 > data.length) throw new Error('FGO Sprite table is truncated')
    const val = view.getUint32(offset, true)
    offset += 4
    return val
  }

  const readStr = () => {
    const len = readU32()
    if (offset + len > data.length) throw new Error('FGO Sprite table string out of bounds')
    const s = new TextDecoder('utf-8').decode(data.subarray(offset, offset + len))
    offset += len
    return s
  }

  for (let i = 0; i < recordCount; i++) {
    const textureName = readStr()
    const spriteName = readStr()
    const atlasWidth = readU32()
    const atlasHeight = readU32()
    const x0 = readU32()
    const y0 = readU32()
    const x1 = readU32()
    const y1 = readU32()

    if (!textureNameSet.has(textureName)) {
      textureNameSet.add(textureName)
      textureNames.push(textureName)
    }

    let resourceIndex = i + 1
    if (i !== recordCount - 1 || data.length - offset >= 4) {
      resourceIndex = readU32()
    }

    rawEntries.push({
      index: i,
      name: spriteName,
      textureName,
      atlasWidth,
      atlasHeight,
      x0,
      y0,
      x1,
      y1,
      resourceIndex,
    })
  }

  // FGO sorts textures by exact byte/ordinal string comparison when packing texture.bin
  const orderedTextureNames = [...textureNames].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  const textureIndexMap = new Map<string, number>()
  orderedTextureNames.forEach((name, idx) => {
    textureIndexMap.set(name.toLowerCase(), idx)
  })

  const entries: FgoSpriteEntry[] = rawEntries.map((e) => ({
    ...e,
    textureIndex: textureIndexMap.get(e.textureName.toLowerCase()) ?? 0,
  }))

  return { entries, textureNames: orderedTextureNames }
}

export function buildSpriteSetFromFgo(
  setName: string,
  tableData: Uint8Array,
  textures: Texture[],
): SpriteSet {
  const { entries } = parseFgoSpriteTable(tableData)
  const sprites: Sprite[] = entries.map((entry) => {
    const minX = Math.min(entry.x0, entry.x1)
    const minY = Math.min(entry.y0, entry.y1)
    const width = Math.abs(entry.x1 - entry.x0)
    const height = Math.abs(entry.y1 - entry.y0)
    return {
      name: entry.name,
      texture: entry.textureIndex,
      x: minX,
      y: minY,
      width,
      height,
    }
  })

  return {
    name: setName,
    textures,
    sprites,
  }
}
