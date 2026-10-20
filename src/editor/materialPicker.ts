import { unpackFarcAsync } from '../core/resources/farcAsync'
import { parseSpriteSet, type SpriteSet } from '../core/resources/sprites'
import type { Editor } from './state'
import type { LayerRef } from './properties'
import { resolveLayer } from './properties'
export interface MaterialPackage { key: string; label: string; load(signal: AbortSignal): Promise<File | SpriteSet> }
export interface MaterialItem { key: string; path: string; set: SpriteSet; index: number }
export async function loadMaterialPackage(pkg: MaterialPackage, signal: AbortSignal) {
  const input = await pkg.load(signal); signal.throwIfAborted()
  if (!(input instanceof File)) return [input]
  const bytes = new Uint8Array(await input.arrayBuffer()); signal.throwIfAborted()
  const entries = /\.farc$/i.test(input.name) ? await unpackFarcAsync(bytes, signal) : new Map([[input.name, bytes]])
  const sets: SpriteSet[] = []
  for (const [name, data] of entries) {
    signal.throwIfAborted()
    if (/(?:^|\/)spr_.*\.bin$/i.test(name) && !/(?:^|\/)spr_db\.bin$/i.test(name)) sets.push(parseSpriteSet(data, name))
  }
  return sets
}
export function materialItems(sets: SpriteSet[]): MaterialItem[] {
  return sets.flatMap(set => set.sprites.map((sprite, index) => ({ key: `${set.name}:${index}`, path: `${set.name}/${sprite.name}`, set, index })))
}
/** Changes an existing shared VideoSource record; never invents an unserializable Video. */
export function applyMaterial(editor: Editor, target: LayerRef, sourceIndex: number, item: MaterialItem) {
  if (editor.busy.value) throw new Error('资源正在加载')
  const layer = resolveLayer(editor, target), scene = editor.doc.value?.scenes[target.sceneIndex]
  if (!layer || layer.itemType !== 1 || (layer.flags & 32)) throw new Error('图层不可编辑')
  const video = scene?.videos.find(v => v.offset === layer.item), source = video?.sources[sourceIndex]
  if (!source) throw new Error('此素材无可替换的 Sprite 源记录；暂不支持为纯色素材新增源')
  if (!item.set.sprites[item.index]) throw new Error('素材不存在')
  const binding = editor.library.sourceFor(item.set.name, item.index)
  if (!binding) throw new Error('缺少对应 spr_db.bin 的精确 ID 映射；请先加载数据库，不能仅凭名称导出引用')
  const name = binding.name
  // ID-first resolution: a new name must not retain the old source's ID.
  if (!/^[\x20-\x7e]+$/.test(name)) throw new Error('素材引用名称必须为可打印 ASCII')
  editor.workspace.requestPause()
  editor.library.add(item.set); editor.resourceVersion.value++
  editor.edit(() => { source.name = name; source.id = binding.id })
}
