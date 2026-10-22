import { unpackFarc } from './farc'

self.onmessage = (event: MessageEvent<Uint8Array>) => {
  try {
    const entries = [...unpackFarc(event.data)]
    const buffers = entries.map(([, bytes]) => bytes.buffer as ArrayBuffer)
    self.postMessage({ entries }, { transfer: [...new Set(buffers)] })
  } catch (error) {
    self.postMessage({ error: String(error) })
  }
}
