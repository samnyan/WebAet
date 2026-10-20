import { compositionLabels } from './compositionLabels'
import type { AetDocument } from '../core/aet/types'
import type { SpriteLibrary } from '../core/resources/library'
import type { PreviewTarget, WorkspaceAsset } from './workspaceAssets'
export interface ResourceNode {
  key: string; label: string; depth: number; expandable?: boolean
  asset?: string; sceneIndex?: number; compositionId?: number; preview?: PreviewTarget; resolved?: boolean; spriteKey?: string
}
/** Flatten only expanded relationships. Search evaluates labels without decoding resources. */
export function resourceRows(assets: readonly WorkspaceAsset[], doc: AetDocument | null, library: SpriteLibrary, expanded: ReadonlySet<string>, query: string, scope: 'all' | 'files' | 'resources' | 'compositions' | 'related' = 'all', flatCompositions = false): ResourceNode[] {
  const rows: ResourceNode[] = [], search = query.trim().toLowerCase()
  const matches = (s: string) => s.toLowerCase().includes(search)
  const folders = new Set<string>()
  for (const asset of ['resources', 'compositions', 'related'].includes(scope) ? [] : assets) {
    if (search && !matches(asset.path)) continue
    const parts = asset.path.split('/'); let path = '', visible = true
    for (let i = 0; i < parts.length - 1; i++) {
      path += (path ? '/' : '') + parts[i]; const key = `dir:${path}`
      if (!folders.has(key) && visible) { folders.add(key); rows.push({ key, label: parts[i]!, depth: i, expandable: true }) }
      if (!search && !expanded.has(key)) visible = false
    }
    if (visible || search) rows.push({ key: `file:${asset.path}`, label: `${asset.name}${asset.loaded ? ' · 已加载' : ''}`, depth: parts.length - 1, asset: asset.path })
  }
  if (scope === 'files') return rows
  doc?.scenes.forEach((scene, si) => {
    const labels = compositionLabels(scene)
    const sceneKey = `scene:${si}`, subtree: ResourceNode[] = []
    const map = new Map(scene.compositions.map(c => [c.offset, c]))
    const walk = (id: number, key: string, depth: number, ancestors: Set<number>, label: string) => {
      const comp = map.get(id); if (!comp) return
      const cycle = ancestors.has(id), ownMatch = matches(label)
      const node: ResourceNode = { key, label: `${label}${cycle ? ' · 循环引用' : ''}`, depth, expandable: !cycle && comp.layers.some(l => l.itemType === 3), sceneIndex: si, compositionId: id, preview: { kind: 'composition', sceneIndex: si, compositionId: id } }
      if (!search || ownMatch) subtree.push(node)
      if (!cycle && !search && !flatCompositions && expanded.has(key)) {
        const next = new Set(ancestors); next.add(id)
        for (const layer of comp.layers) if (layer.itemType === 3) walk(layer.item, `${key}/${layer.offset}`, depth + 1, next, labels.get(layer.item) ?? layer.name)
      }
    }
    const root = scene.compositions.at(-1)
    if (scope !== 'related' && root && (search || expanded.has(sceneKey))) {
      walk(root.offset, `${sceneKey}/root`, 1, new Set(), labels.get(root.offset)!)
      if (search || flatCompositions) {
        // Canonical search: one result per composition, independent of instance paths.
        for (const comp of scene.compositions.slice(0, -1)) walk(comp.offset, `${sceneKey}/comp:${comp.offset}`, 1, new Set(), labels.get(comp.offset)!)
      } else {
        const reachable = new Set<number>(), pending = [root.offset]
        while (pending.length) {
          const id = pending.pop()!
          if (reachable.has(id)) continue
          reachable.add(id)
          for (const layer of map.get(id)?.layers ?? []) if (layer.itemType === 3) pending.push(layer.item)
        }
        const orphans = scene.compositions.filter(c => !reachable.has(c.offset)), key = `${sceneKey}/unreferenced`
        if (orphans.length) subtree.push({ key, label: `未被 ROOT 引用 (${orphans.length})`, depth: 1, expandable: true })
        if (expanded.has(key)) for (const comp of orphans) walk(comp.offset, `${key}/${comp.offset}`, 2, new Set(), labels.get(comp.offset)!)
      }
    }
    if (scope !== 'compositions' && (search || expanded.has(sceneKey))) {
      for (const video of scene.videos) {
        const sources = video.sources.length ? video.sources : [null]
        sources.forEach((source, sourceIndex) => {
          const label = source?.name || `纯色 ${video.width}×${video.height}`
          const entry = source ? library.find(source.name, source.id) : undefined
          const set = entry && library.sets.find(s => s.sprites.includes(entry.sprite))
          const spriteKey = set && entry ? `sprites:${set.name}/${set.sprites.indexOf(entry.sprite)}` : undefined
          if (!search || matches(label)) subtree.push({ key: `${sceneKey}/video:${video.offset}/${sourceIndex}`, label, depth: 1, resolved: !source || !!entry, spriteKey, preview: { kind: 'source', sceneIndex: si, videoId: video.offset, sourceIndex } })
        })
      }
    }
    if (!search || matches(scene.name) || subtree.length) rows.push({ key: sceneKey, label: `${doc!.name} / ${scene.name}${scope === 'related' ? ' · 素材引用' : ''}`, depth: 0, expandable: true, sceneIndex: si, compositionId: root?.offset }, ...subtree)
  })
  if (scope === 'related' && library.sets.length) rows.push({ key: 'sprite-packages', label: 'Sprite 资源包', depth: 0 })
  for (const set of scope === 'compositions' ? [] : library.sets) {
    const key = `sprites:${set.name}`, children: ResourceNode[] = []
    if (search || expanded.has(key)) set.sprites.forEach((sprite, index) => {
      if (!search || matches(sprite.name)) children.push({ key: `${key}/${index}`, label: sprite.name, depth: 1, preview: { kind: 'sprite', setName: set.name, spriteIndex: index } })
    })
    if (!search || matches(set.name) || children.length) rows.push({ key, label: `${set.name} · ${set.sprites.length}`, depth: 0, expandable: true }, ...children)
  }
  return rows
}
