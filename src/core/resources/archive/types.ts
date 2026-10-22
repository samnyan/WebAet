export interface ArchiveReader {
  readonly name: string
  canHandle(bytes: Uint8Array): boolean
  unpack(bytes: Uint8Array, signal?: AbortSignal): Promise<Map<string, Uint8Array>>
}
