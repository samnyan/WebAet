export interface DirectoryProgress {
  phase: string
  current: string
  done: number
  total: number
}
interface CachedIndex {
  paths: string[]
  root: FileSystemDirectoryHandle
}
const database = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('webaet-resource-index', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('directories')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
async function cached(key: string, value?: CachedIndex): Promise<CachedIndex | undefined> {
  const db = await database()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('directories', value ? 'readwrite' : 'readonly'),
        store = tx.objectStore('directories')
      const request = value ? store.put(value, key) : store.get(key)
      tx.oncomplete = () => resolve(value ?? request.result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}
/** Metadata-only index. Never read resource bytes during traversal. */
export class ResourceDirectory {
  paths: string[] = []
  readonly root: FileSystemDirectoryHandle
  constructor(root: FileSystemDirectoryHandle) {
    this.root = root
  }
  async scan(rescan: boolean, report: (progress: DirectoryProgress) => void, signal?: AbortSignal) {
    signal?.throwIfAborted()
    // A grant is always supplied by the user; cached paths never grant file access.
    if (!rescan) {
      const previous = await cached(this.root.name).catch(() => undefined)
      signal?.throwIfAborted()
      if (previous && (await this.root.isSameEntry(previous.root))) {
        this.paths = previous.paths
        return
      }
    }
    const paths: string[] = []
    let visited = 0
    const walk = async (dir: FileSystemDirectoryHandle, prefix: string) => {
      for await (const handle of (
        dir as unknown as { values(): AsyncIterable<FileSystemHandle> }
      ).values()) {
        signal?.throwIfAborted()
        const path = prefix + handle.name
        report({ phase: '扫描目录', current: path, done: ++visited, total: 0 })
        if (handle.kind === 'directory') await walk(handle as FileSystemDirectoryHandle, path + '/')
        else paths.push(path)
        if (visited % 100 === 0) await new Promise((resolve) => setTimeout(resolve, 0))
      }
    }
    await walk(this.root, '')
    signal?.throwIfAborted()
    this.paths = paths.sort()
    await cached(this.root.name, { paths: this.paths, root: this.root }).catch(() => undefined)
  }
  async file(path: string): Promise<File> {
    const parts = path.split('/')
    let directory = this.root
    for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part)
    return (await directory.getFileHandle(parts.at(-1)!)).getFile()
  }
  companions(path: string, names: Set<string>) {
    const prefix = path.slice(0, path.lastIndexOf('/') + 1)
    return this.paths.filter(
      (p) =>
        p.startsWith(prefix) &&
        !p.slice(prefix.length).includes('/') &&
        names.has(p.slice(prefix.length).toLowerCase()),
    )
  }
}
