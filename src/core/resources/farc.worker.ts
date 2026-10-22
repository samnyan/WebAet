import { unpackFarc } from './farc'

self.onmessage = async (event: MessageEvent<Uint8Array>) => {
  try {
    const map = await unpackFarc(event.data)
    const entries = [...map]
    const buffers = entries.map(([, bytes]) => bytes.buffer as ArrayBuffer)
    self.postMessage({ entries }, { transfer: [...new Set(buffers)] })
  } catch (error) {
    self.postMessage({ error: String(error) })
  }
}
