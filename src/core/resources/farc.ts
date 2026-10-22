import { defaultArchiveDispatcher } from './archive'

export async function unpackFarc(
  bytes: Uint8Array,
  signal?: AbortSignal,
): Promise<Map<string, Uint8Array>> {
  return defaultArchiveDispatcher.unpack(bytes, signal)
}
