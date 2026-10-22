import type { AetDocument } from './types'

export interface AetParser {
  readonly name: string
  canHandle(source: Uint8Array): boolean
  parse(source: Uint8Array, name: string): AetDocument
}
