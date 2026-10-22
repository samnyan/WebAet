import type { SpriteDatabaseEntry } from './database'
import { spriteAliases } from './sprites'

/** Resolve each set once, preferring loose files and the AET's own resource directory. */
export function spriteDependencies(
  aetPath: string,
  sources: readonly { id: number; name: string }[],
  database: readonly SpriteDatabaseEntry[],
  paths: readonly string[],
): string[] {
  const ids = new Set(sources.map((s) => s.id))
  const names = new Set(sources.flatMap((s) => spriteAliases(s.name)))
  const sets = new Set([
    aetPath
      .split('/')
      .at(-1)!
      .replace(/^aet_/i, 'spr_')
      .replace(/\.bin$/i, '')
      .toLowerCase(),
  ])
  for (const entry of database) {
    if (ids.has(entry.id) || spriteAliases(entry.name).some((name) => names.has(name)))
      sets.add(entry.set.replace(/\.(bin|farc)$/i, '').toLowerCase())
  }
  const directory = aetPath.slice(0, aetPath.lastIndexOf('/') + 1)
  // Language overlays can share original resources, but must not pull other languages arbitrarily.
  const fallback = directory.replace(/(^|\/)rom_steam_[^/]+\//i, '$1rom_steam/')
  const result: string[] = []
  for (const set of sets) {
    let found: string | undefined
    for (const dir of [...new Set([directory, fallback])]) {
      for (const extension of ['.bin', '.farc']) {
        const target = (dir + set + extension).toLowerCase()
        found = paths.find((path) => path.toLowerCase() === target)
        if (found) break
      }
      if (found) break
    }
    if (found) result.push(found)
  }
  return result
}
