import { parseAet } from './reader'
import type { AetDocument } from './types'
import type { AetParser } from './parserTypes'

export class ClassicAetParser implements AetParser {
  readonly name = 'Classic DIVA AET'

  canHandle(source: Uint8Array): boolean {
    if (source.length < 64) return false
    const sig = new TextDecoder().decode(source.subarray(0, 4))
    if (['AETC', 'FArc', 'FArC', 'FARC'].includes(sig)) return false

    // Check if starts with FGO magic
    const view = new DataView(source.buffer, source.byteOffset, source.byteLength)
    const magic = view.getUint32(0, true)
    if (magic === 0x41450103 || magic === 0x03014541) return false

    // Classic AET starts with an offset table where table[0] is the address of Scene 0
    const firstScene = view.getUint32(0, true)
    return firstScene > 0 && firstScene < source.length
  }

  parse(source: Uint8Array, name = 'untitled.bin'): AetDocument {
    return parseAet(source, name)
  }
}
