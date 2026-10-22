import type { AetParser } from './parserTypes'
import type { AetDocument } from './types'
import { ClassicAetParser } from './classicParser'
import { FgoAetParser } from './fgoParser'

export class AetDispatcher {
  private readonly parsers: AetParser[] = [new FgoAetParser(), new ClassicAetParser()]

  register(parser: AetParser): void {
    this.parsers.unshift(parser)
  }

  getParser(source: Uint8Array): AetParser {
    for (const parser of this.parsers) {
      if (parser.canHandle(source)) {
        return parser
      }
    }
    // Fall back to classic parser if unknown
    return this.parsers[this.parsers.length - 1]!
  }

  parse(source: Uint8Array, name = 'untitled.bin'): AetDocument {
    const parser = this.getParser(source)
    return parser.parse(source, name)
  }
}

export const defaultAetDispatcher = new AetDispatcher()

export function parseAetAuto(source: Uint8Array, name = 'untitled.bin'): AetDocument {
  return defaultAetDispatcher.parse(source, name)
}
