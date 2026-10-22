import { init, decompress } from '@bokuweb/zstd-wasm'

let initPromise: Promise<void> | null = null

export async function ensureZstd(): Promise<void> {
  if (!initPromise) {
    initPromise = init()
  }
  return initPromise
}

export function decompressZstd(data: Uint8Array): Uint8Array {
  return decompress(data)
}
