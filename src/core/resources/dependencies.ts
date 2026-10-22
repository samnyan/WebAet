import type { SpriteDatabaseEntry } from './database'
import { spriteAliases } from './sprites'

/**
 * Resolve sprite dependencies without hardcoding game-specific directory layouts.
 * Supports:
 * - DIVA classic/MegaMix (spr_db.bin + spr_*.bin / spr_*.farc)
 * - FGO Arcade (spr_*_table.bin + matching spr_*.farc)
 */
export function spriteDependencies(
  aetPath: string,
  sources: readonly { id: number; name: string }[],
  database: readonly SpriteDatabaseEntry[],
  paths: readonly string[],
): string[] {
  const ids = new Set(sources.map((s) => s.id))
  const names = new Set(sources.flatMap((s) => spriteAliases(s.name)))
  const fileName = aetPath.split('/').at(-1)!
  const baseName = fileName.replace(/\.bin$/i, '')
  const directory = aetPath.slice(0, aetPath.lastIndexOf('/') + 1)

  // Sets to search for
  const candidateStems = new Set<string>()

  // 1. DIVA default stem: aet_foo.bin -> spr_foo
  if (/^aet_/i.test(fileName)) {
    candidateStems.add(baseName.replace(/^aet_/i, 'spr_').toLowerCase())
  } else {
    // Non-DIVA / generic naming
    candidateStems.add(baseName.toLowerCase())
    candidateStems.add(`spr_${baseName}`.toLowerCase())
  }

  // 2. Add sets from database
  for (const entry of database) {
    if (ids.has(entry.id) || spriteAliases(entry.name).some((name) => names.has(name))) {
      candidateStems.add(entry.set.replace(/\.(bin|farc)$/i, '').toLowerCase())
    }
  }

  // 3. FGO-style stems from source names (e.g. source "adv_cmn_foo" or "spr_adv_cmn_table" -> "spr_adv_cmn")
  for (const src of sources) {
    const raw = src.name.replace(/\.pic$/i, '')
    const parts = raw.split('_')
    if (parts.length >= 2) {
      // e.g. "adv_cmn" -> candidate "spr_adv_cmn"
      const prefix2 = parts.slice(0, 2).join('_').toLowerCase()
      candidateStems.add(`spr_${prefix2}`)
      candidateStems.add(prefix2)
    }
  }

  const result = new Set<string>()

  // Candidate directories: AET's own directory first, then common sprite subdirectories
  const dirCandidates = [
    directory,
    directory.replace(/(^|\/)rom_steam_[^/]+\//i, '$1rom_steam/'),
    `${directory}sprite/`,
    'sprite/',
    '',
  ]
  const uniqueDirs = [...new Set(dirCandidates)]

  for (const stem of candidateStems) {
    for (const dir of uniqueDirs) {
      // Check for .farc, .bin, and _table.bin
      const variations = [`${dir}${stem}.farc`, `${dir}${stem}.bin`, `${dir}${stem}_table.bin`]
      for (const v of variations) {
        const found = paths.find((p) => p.toLowerCase() === v.toLowerCase())
        if (found) {
          result.add(found)
          // If we found a _table.bin, also look for matching .farc
          if (found.toLowerCase().endsWith('_table.bin')) {
            const farcName = found.slice(0, -'_table.bin'.length) + '.farc'
            const farcFound = paths.find((p) => p.toLowerCase() === farcName.toLowerCase())
            if (farcFound) result.add(farcFound)
          }
        }
      }
    }
  }

  return [...result]
}
