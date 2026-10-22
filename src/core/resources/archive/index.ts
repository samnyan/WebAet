import type { ArchiveReader } from './types'
import { DivaFarcReader } from './divaFarc'
import { FgoFarcReader } from './fgoFarc'

export class ArchiveDispatcher {
  private readonly readers: ArchiveReader[] = [new FgoFarcReader(), new DivaFarcReader()]

  register(reader: ArchiveReader): void {
    this.readers.unshift(reader)
  }

  getReader(bytes: Uint8Array): ArchiveReader {
    for (const reader of this.readers) {
      if (reader.canHandle(bytes)) {
        return reader
      }
    }
    throw new Error('Unsupported archive format')
  }

  async unpack(bytes: Uint8Array, signal?: AbortSignal): Promise<Map<string, Uint8Array>> {
    const reader = this.getReader(bytes)
    return reader.unpack(bytes, signal)
  }
}

export const defaultArchiveDispatcher = new ArchiveDispatcher()
