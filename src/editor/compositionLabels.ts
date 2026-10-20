import type { Scene } from '../core/aet/types'

/** Compositions have no serialized name: names belong to referring layer instances. */
export function compositionLabels(scene: Scene): Map<number, string> {
  const aliases = new Map<number, Set<string>>()
  for (const comp of scene.compositions) for (const layer of comp.layers) {
    if (layer.itemType !== 3 || !layer.name.trim()) continue
    let names = aliases.get(layer.item)
    if (!names) { names = new Set(); aliases.set(layer.item, names) }
    names.add(layer.name)
  }
  return new Map(scene.compositions.map((comp, index) => {
    const root = index === scene.compositions.length - 1
    const names = [...aliases.get(comp.offset) ?? []]
    const label = root ? 'ROOT' : names.length ? names.join(' / ') : `未命名合成 #${index}`
    return [comp.offset, `${label} (${comp.layers.length}层)`]
  }))
}
