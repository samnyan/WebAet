import { BinaryReader } from '../aet/reader'
export interface SpriteDatabaseEntry { id: number; name: string; index: number; set: string }
export function parseSpriteDatabase(bytes: Uint8Array): SpriteDatabaseEntry[] {
  const r = new BinaryReader(bytes)
  const sets = r.array(r.u32(0), r.u32(4), 16, p => ({ name: r.string(r.u32(p + 4)), file: r.string(r.u32(p + 8)) }))
  return r.array(r.u32(8), r.u32(12), 12, p => {
    const info = r.u32(p + 8), setIndex = info >>> 16
    if (setIndex & 0x1000) return null
    const set = sets[setIndex & 0xfff]
    if (!set) throw new Error('Invalid sprite database set reference')
    return { id: r.u32(p), name: r.string(r.u32(p + 4)), index: info & 0xffff, set: set.file.replace(/\.farc$/i, '.bin').toLowerCase() }
  }).filter((entry): entry is SpriteDatabaseEntry => entry !== null)
}
