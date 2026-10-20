import { decodeTexture, type Texture } from './sprites'

self.onmessage = (event: MessageEvent<Texture>) => {
  try {
    const texture = event.data, decoded = decodeTexture(texture)
    const pixels = new Uint8ClampedArray(decoded.length), stride = texture.width * 4
    for (let y = 0; y < texture.height; y++) pixels.set(decoded.subarray(y * stride, (y + 1) * stride), (texture.height - 1 - y) * stride)
    self.postMessage({ pixels }, { transfer: [pixels.buffer] })
  } catch (error) { self.postMessage({ error: String(error) }) }
}
