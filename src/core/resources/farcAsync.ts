/** Transfer archive ownership off the UI thread; terminate on every completion path. */
export function unpackFarcAsync(bytes: Uint8Array, signal?: AbortSignal): Promise<Map<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted()
    const worker = new Worker(new URL('./farc.worker.ts', import.meta.url), { type: 'module' })
    const cleanup = () => { worker.terminate(); signal?.removeEventListener('abort', abort) }
    const abort = () => { cleanup(); reject(signal?.reason ?? new DOMException('Cancelled', 'AbortError')) }
    worker.onmessage = (event: MessageEvent<{ entries?: [string, Uint8Array][]; error?: string }>) => {
      cleanup()
      if (event.data.error) reject(new Error(event.data.error))
      else resolve(new Map(event.data.entries))
    }
    worker.onerror = event => { event.preventDefault(); cleanup(); reject(new Error(event.message || 'FARC worker failed')) }
    worker.onmessageerror = () => { cleanup(); reject(new Error('FARC worker transfer failed')) }
    signal?.addEventListener('abort', abort, { once: true })
    try {
      // Copy non-owning views: transferring them could detach unrelated callers' data.
      const owned = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength && bytes.buffer instanceof ArrayBuffer ? bytes : bytes.slice()
      worker.postMessage(owned, [owned.buffer as ArrayBuffer])
    } catch (error) { cleanup(); reject(error) }
  })
}
