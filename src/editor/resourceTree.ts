import { compositionLabels } from './compositionLabels'
import type { AetDocument } from '../core/aet/types'
import type { SpriteLibrary } from '../core/resources/library'
import type { PreviewTarget, WorkspaceAsset } from './workspaceAssets'
export interface ResourceNode {
  key: string; label: string; depth: number; expandable?: boolean
  asset?: string; sceneIndex?: number; compositionId?: number; preview?: PreviewTarget
}
/** Flatten only expanded relationships. Search evaluates labels without decoding resources. */
export function resourceRows(assets: readonly WorkspaceAsset[], doc: AetDocument | null, library: SpriteLibrary, expanded: ReadonlySet<string>, query: string, scope: 'all' | 'files' | 'resources' | 'compositions' | 'related' = 'all'): ResourceNode[] {
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
      if (!cycle && !search && expanded.has(key)) {
        const next = new Set(ancestors); next.add(id)
        for (const layer of comp.layers) if (layer.itemType === 3) walk(layer.item, `${key}/${layer.offset}`, depth + 1, next, labels.get(layer.item) ?? layer.name)
      }
    }
    const root = scene.compositions.at(-1)
    if (scope !== 'related' && root && (search || expanded.has(sceneKey))) {
      walk(root.offset, `${sceneKey}/root`, 1, new Set(), labels.get(root.offset)!)
      // Unreferenced subcompositions remain discoverable, without inventing disk folders.
      for (let i = 0; i < scene.compositions.length - 1; i++) {
        const comp = scene.compositions[i]!
        walk(comp.offset, `${sceneKey}/comp:${comp.offset}`, 1, new Set(), labels.get(comp.offset)!)
      }
    }
    if (scope !== 'compositions' && (search || expanded.has(sceneKey))) {
      for (const video of scene.videos) {
        const label = video.sources[0]?.name || `纯色 ${video.width}×${video.height}`
        if (!search || matches(label)) subtree.push({ key: `${sceneKey}/video:${video.offset}`, label, depth: 1, preview: { kind: 'source', sceneIndex: si, videoId: video.offset, sourceIndex: 0 } })
      }
    }
    if (!search || matches(scene.name) || subtree.length) rows.push({ key: sceneKey, label: `${doc!.name} / ${scene.name}`, depth: 0, expandable: true, sceneIndex: si, compositionId: root?.offset }, ...subtree)
  })
  for (const set of scope === 'compositions' ? [] : library.sets) {
    const key = `sprites:${set.name}`, children: ResourceNode[] = []
    if (search || expanded.has(key)) set.sprites.forEach((sprite, index) => {
      if (!search || matches(sprite.name)) children.push({ key: `${key}/${index}`, label: sprite.name, depth: 1, preview: { kind: 'sprite', setName: set.name, spriteIndex: index } })
    })
    if (!search || matches(set.name) || children.length) rows.push({ key, label: `${set.name} · ${set.sprites.length}`, depth: 0, expandable: true }, ...children)
  }
  return rows
}
