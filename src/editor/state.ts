import { computed, markRaw, ref, shallowRef, toRaw, triggerRef, watch } from 'vue'
import { createIndependentLayer, removeLayer, reorderLayer, duplicateLayer, duplicateLayers, removeLayers, reorderedLayers, type LayerOrderDirection } from './layerEditing'
import { movedLayers } from './layerTiming'
import { parseAet } from '../core/aet/reader'
import { writeAet } from '../core/aet/writer'
import { videoCurve, type AetDocument, type EditableChannel, type Scene } from '../core/aet/types'
import { SpriteLibrary } from '../core/resources/library'
import { unpackFarcAsync } from '../core/resources/farcAsync'
import { parseSpriteSet } from '../core/resources/sprites'
import { parseSpriteDatabase } from '../core/resources/database'
import { sampleCurve } from '../core/animation/curves'
import { keysWithValue } from '../core/animation/setValue'
import { getSceneOwnerIndex, resolveCurve, resolveLayer } from './properties'
import { createWorkspaceState } from './workspaceState'
import { createPropertyActions } from './propertyActions'

export function createEditor() {
  const doc = shallowRef<AetDocument | null>(null), library = markRaw(new SpriteLibrary())
  const sceneIndex = ref(0), compositionId = ref(0), selectedId = ref<number | null>(null), frame = ref(0)
  const version = ref(0), resourceVersion = ref(0), busy = ref(false), error = ref(''), notices = ref<string[]>([]), hidden = ref(new Set<number>()), dirty = ref(false)
  const undoStack: Scene[][] = [], redoStack: Scene[][] = [], historyVersion = ref(0)
  const operation = ref(''), completedOperation = ref('')
  async function runOperation(label: string, action: () => void | Promise<void>) {
    if (busy.value) return
    busy.value = true; operation.value = label; error.value = ''; completedOperation.value = ''
    try {
      await new Promise<void>(resolve => requestAnimationFrame(() => { setTimeout(resolve, 0) }))
      await action()
      if (!error.value) completedOperation.value = `${label}：已请求浏览器下载`
    } catch (err) { error.value = String(err) }
    finally { operation.value = ''; busy.value = false }
  }
  const scene = computed(() => doc.value?.scenes[sceneIndex.value] ?? null)
  const composition = computed(() => scene.value?.compositions.find(c => c.offset === compositionId.value) ?? null)
  const selected = computed(() => { version.value; return scene.value?.compositions.flatMap(c => c.layers).find(l => l.offset === selectedId.value) ?? null })
  const documents = shallowRef<{ name: string; bytes: Uint8Array }[]>([])

  const workspace = createWorkspaceState({
    doc,
    sceneIndex,
    compositionId,
    selectedId,
    frame,
    version,
    scene,
    composition,
    selectScene,
  })

  let isSyncingSelection = false
  const origSelectLayer = workspace.selectLayer
  workspace.selectLayer = (ref) => {
    if (isSyncingSelection) return
    isSyncingSelection = true
    try {
      origSelectLayer(ref)
    } finally {
      isSyncingSelection = false
    }
  }

  watch(selectedId, (id) => {
    if (isSyncingSelection) return
    isSyncingSelection = true
    try {
      if (id === null) {
        workspace.activeLayerRef.value = null
        workspace.activeProperty.value = null
        workspace.activeKey.value = null
        return
      }
      if (composition.value?.layers.some(l => l.offset === id)) {
        workspace.activeLayerRef.value = {
          sceneIndex: sceneIndex.value,
          compositionId: compositionId.value,
          layerId: id,
        }
      } else {
        const ownerIndex = getSceneOwnerIndex(scene.value, version.value)
        const ownerComp = ownerIndex.layerToComp.get(id)
        if (ownerComp !== undefined) {
          compositionId.value = ownerComp
          frame.value = scene.value?.start ?? 0
          workspace.activeLayerRef.value = {
            sceneIndex: sceneIndex.value,
            compositionId: ownerComp,
            layerId: id,
          }
        } else {
          workspace.activeLayerRef.value = null
        }
      }
      workspace.activeProperty.value = null
      workspace.activeKey.value = null
    } finally {
      isSyncingSelection = false
    }
  }, { flush: 'sync' })

  const actions = createPropertyActions({
    doc,
    sceneIndex,
    compositionId,
    frame,
    version,
    busy,
    error,
    hidden,
    scene,
    composition,
    edit,
  }, workspace)
  const snapshot = () => structuredClone(toRaw(doc.value!.scenes))
  let savedScenes = ''
  function markSaved() { savedScenes = JSON.stringify(doc.value?.scenes); dirty.value = false }
  function updateDirty() { dirty.value = JSON.stringify(doc.value?.scenes) !== savedScenes }
  function refresh() { version.value++; triggerRef(doc) }
  function revalidateSelection() {
    if (workspace.activeLayerRef.value) {
      const l = resolveLayer({ doc }, workspace.activeLayerRef.value)
      if (!l) {
        workspace.activeLayerRef.value = null
        workspace.activeProperty.value = null
        workspace.activeKey.value = null
        selectedId.value = null
      }
    }
    if (workspace.activeKey.value) {
      const c = resolveCurve({ doc }, workspace.activeKey.value.property)
      const targetTime = Math.fround(workspace.activeKey.value.frame)
      if (!c || !c.keys.some(k => Math.fround(k.frame) === targetTime)) {
        workspace.activeKey.value = null
      }
    }
  }
  function edit(action: () => void) {
    if (busy.value || !doc.value) return
    const before = snapshot()
    try {
      action()
      if (JSON.stringify(before) === JSON.stringify(doc.value.scenes)) return
      undoStack.push(before); if (undoStack.length > 50) undoStack.shift(); redoStack.length = 0
      historyVersion.value++; updateDirty(); refresh(); revalidateSelection()
    } catch (e) { doc.value.scenes = before; refresh(); error.value = String(e) }
  }
  function undo() { if (busy.value || !doc.value || !undoStack.length) return; redoStack.push(snapshot()); doc.value.scenes = undoStack.pop()!; historyVersion.value++; updateDirty(); refresh(); revalidateSelection() }
  function redo() { if (busy.value || !doc.value || !redoStack.length) return; undoStack.push(snapshot()); doc.value.scenes = redoStack.pop()!; historyVersion.value++; updateDirty(); refresh(); revalidateSelection() }
  function selectScene(index: number) {
    sceneIndex.value = index; const s = doc.value?.scenes[index]
    compositionId.value = s?.compositions.at(-1)?.offset ?? 0; selectedId.value = null; frame.value = s?.start ?? 0; hidden.value = new Set()
    workspace.activeLayerRef.value = null
    workspace.activeProperty.value = null
    workspace.activeKey.value = null
    workspace.playing.value = false
  }
  function closeDocument(confirmed = false) {
    if (busy.value || !confirmed && dirty.value && !window.confirm('当前修改尚未保存，关闭资源会丢弃修改。继续？')) return
    doc.value = null; documents.value = []; library.clear(); resourceVersion.value++
    undoStack.length = 0; redoStack.length = 0; historyVersion.value++
    sceneIndex.value = 0; compositionId.value = 0; selectedId.value = null; frame.value = 0; hidden.value = new Set()
    workspace.activeLayerRef.value = null
    workspace.activeProperty.value = null
    workspace.activeKey.value = null
    workspace.playing.value = false
    workspace.docSession.value++
    error.value = ''; notices.value = []; markSaved(); refresh()
  }
  function open(bytes: Uint8Array, name: string) {
    const parsed = markRaw(parseAet(bytes, name)); doc.value = parsed; undoStack.length = 0; redoStack.length = 0; historyVersion.value++; markSaved(); selectScene(0); refresh()
    workspace.docSession.value++
  }
  async function importFiles(files: File[], signal?: AbortSignal, report?: (name: string, done: number, total: number) => void) {
    const projects = files.filter(file => /\.webaet$/i.test(file.name))
    if (projects.length > 1) { error.value = '一次只能打开一个 WebAet 工程；请分别导入。'; return }
    if (projects.length && dirty.value && !window.confirm('当前修改尚未保存，打开工程会丢弃修改。继续？')) return
    // Nested companion imports must not release the directory task's busy state.
    const wasBusy = busy.value
    busy.value = true
    if (!wasBusy) { error.value = ''; notices.value = [] }
    const incoming: { name: string; bytes: Uint8Array }[] = []
    try {
      for (const [index, file] of files.entries()) {
        signal?.throwIfAborted()
        report?.(file.name, index, files.length)
        if (!/\.(bin|farc|webaet)$/i.test(file.name)) continue
        try {
          const bytes = new Uint8Array(await file.arrayBuffer())
          signal?.throwIfAborted()
          if (/\.webaet$/i.test(file.name)) { loadProject(new TextDecoder().decode(bytes)); continue }
          const entries = /\.farc$/i.test(file.name) ? await unpackFarcAsync(bytes, signal) : new Map([[file.name, bytes]])
          for (const [name, data] of entries) {
            if (/^aet_.*\.bin$/i.test(name) && !/^aet_db/i.test(name)) incoming.push({ name, bytes: data })
            else if (/^spr_db\.bin$/i.test(name)) { library.bindDatabase(parseSpriteDatabase(data)); resourceVersion.value++ }
            else if (/^spr_.*\.bin$/i.test(name) && !/^spr_db/i.test(name)) { const set = parseSpriteSet(data, name); await library.prepare(set, signal); library.add(set); resourceVersion.value++ }
          }
        } catch (e) { if (signal?.aborted) throw e; notices.value.push(`${file.name}: ${e}`) }
        await new Promise(resolve => setTimeout(resolve, 0))
      }
      documents.value = [...documents.value.filter(d => !incoming.some(n => n.name === d.name)), ...incoming]
      if (incoming.length && !doc.value) open(incoming[0]!.bytes, incoming[0]!.name)
    } catch (e) { if (signal?.aborted) throw e; error.value = String(e) }
    finally { busy.value = wasBusy }
  }
  function setValue(channel: EditableChannel, value: number) {
    if (workspace.activeLayerRef.value) {
      actions.setValue({ ...workspace.activeLayerRef.value, kind: 'channel', channel }, value)
    } else {
      const l = selected.value; if (!l?.video || (l.flags & 32)) return
      const curve = videoCurve(l.video, channel); if (!curve) return
      edit(() => { curve.keys = keysWithValue(curve, frame.value, value) })
    }
  }
  function restoreChannel(channel: EditableChannel) {
    const l = selected.value, current = doc.value
    if (!l || !current || (l.flags & 32)) return
    try {
      const original = parseAet(current.source, current.name).scenes[sceneIndex.value]?.compositions.flatMap(c => c.layers).find(x => x.offset === l.offset)
      const target = videoCurve(l.video, channel), source = videoCurve(original?.video, channel)
      if (!target || !source) return
      edit(() => { target.keys = source.keys.map(k => ({ ...k })) })
    } catch (err) { error.value = String(err) }
  }
  function translateLayer(id: number, dx: number, dy: number) {
    const l = composition.value?.layers.find(l => l.offset === id)
    if (!l?.video || (l.flags & 32)) return
    edit(() => {
      for (const [ch, delta] of [['positionX', dx], ['positionY', dy]] as const) {
        const c = l.video!.curves[ch]
        if (!c.keys.length) c.keys = [{ frame: 0, value: delta, tangent: 0 }]
        else for (const key of c.keys) key.value += delta
      }
    })
  }
  function currentValue(channel: EditableChannel) { return sampleCurve(videoCurve(selected.value?.video, channel), frame.value) }
  function exportBinary() { if (!doc.value) return; try { const bytes = writeAet(doc.value); download(bytes, doc.value.name); error.value = '' } catch (e) { error.value = String(e) } }
  function saveProject() {
    if (!doc.value) return
    try {
      writeAet(doc.value) // A saved draft must pass the same validation as project reload.
      let binary = ''; for (const b of doc.value.source) binary += String.fromCharCode(b)
      download(new TextEncoder().encode(JSON.stringify({ format: 'webaet-project', version: 1, name: doc.value.name, source: btoa(binary), scenes: doc.value.scenes, view: { sceneIndex: sceneIndex.value, compositionId: compositionId.value, frame: frame.value } })), doc.value.name.replace(/\.bin$/i, '') + '.webaet')
      markSaved(); error.value = ''
    } catch (err) { error.value = String(err) }
  }
  function loadProject(text: string) {
    const project = JSON.parse(text)
    if (project.format !== 'webaet-project' || project.version !== 1) throw new Error('Unsupported WebAet project')
    const source = Uint8Array.from(atob(project.source), c => c.charCodeAt(0))
    const draft = parseAet(source, project.name); draft.scenes = project.scenes
    const validated = parseAet(writeAet(draft), project.name)
    open(validated.source, project.name); doc.value!.scenes = validated.scenes
    // Normalize offsets against original source: appended curve data addresses are not structural IDs.
    selectScene(Math.max(0, Math.min(doc.value!.scenes.length - 1, project.view?.sceneIndex ?? 0)))
    if (scene.value?.compositions.some(c => c.offset === project.view?.compositionId)) compositionId.value = project.view.compositionId
    frame.value = project.view?.frame ?? scene.value?.start ?? 0; markSaved(); refresh()
  }
  function insertLayer(index = composition.value?.layers.length ?? 0) {
    if (busy.value || !doc.value || !scene.value || !composition.value) return
    const layer = createIndependentLayer(doc.value, scene.value.start, scene.value.end)
    edit(() => composition.value!.layers.splice(index, 0, layer))
    actions.selectLayer({ sceneIndex: sceneIndex.value, compositionId: compositionId.value, layerId: layer.offset })
  }
  function copyLayer(id: number) {
    const c = composition.value
    if (busy.value || !doc.value || !c) return
    const index = c.layers.findIndex(l => l.offset === id)
    if (index < 0 || (c.layers[index]!.flags & 32)) return
    workspace.requestPause()
    const copy = duplicateLayer(doc.value, c.layers[index]!)
    edit(() => c.layers.splice(index, 0, copy))
    actions.selectLayer({ sceneIndex: sceneIndex.value, compositionId: c.offset, layerId: copy.offset })
  }
  function moveLayer(id: number, direction: 'up' | 'down' | 'top' | 'bottom') {
    const c = composition.value
    if (busy.value || !c) return
    const index = c.layers.findIndex(l => l.offset === id)
    const target = direction === 'top' ? 0 : direction === 'bottom' ? c.layers.length - 1 : index + (direction === 'up' ? -1 : 1)
    if (index < 0 || target < 0 || target >= c.layers.length || target === index || (c.layers[index]!.flags & 32)) return
    workspace.requestPause()
    edit(() => { reorderLayer(c, id, target) })
  }
  function moveSelectedLayers(direction: LayerOrderDirection) {
    const c = composition.value
    if (busy.value || !c) return
    const next = reorderedLayers(c, workspace.selectedLayers.value, direction)
    if (next.every((layer, index) => layer === c.layers[index])) return
    workspace.requestPause()
    edit(() => { c.layers = next })
  }
  function moveLayerGroup(ids: Set<number>, delta: number) {
    if (busy.value || !composition.value) return
    try {
      const next = movedLayers(composition.value, ids, delta)
      if (!next) return
      workspace.requestPause()
      edit(() => { composition.value!.layers = next })
    } catch (cause) { error.value = String(cause) }
  }
  function copySelectedLayers() {
    const c = composition.value, document = doc.value, ids = new Set(workspace.selectedLayers.value)
    if (busy.value || !document || !c || !c.layers.some(l => ids.has(l.offset))) return
    if (c.layers.some(l => ids.has(l.offset) && (l.flags & 32))) {
      error.value = '选区包含锁定图层，请先解锁'
      return
    }
    workspace.requestPause()
    let copies: ReturnType<typeof duplicateLayers> = []
    edit(() => { copies = duplicateLayers(document, c, ids) })
    const primary = copies[0]
    if (!primary) return
    actions.selectLayer({ sceneIndex: sceneIndex.value, compositionId: c.offset, layerId: primary.offset })
    workspace.selectedLayers.value = new Set(copies.map(l => l.offset))
  }
  function deleteSelectedLayers() {
    const c = composition.value, ids = new Set(workspace.selectedLayers.value)
    if (busy.value || !c || !c.layers.some(l => ids.has(l.offset))) return
    if (c.layers.some(l => ids.has(l.offset) && (l.flags & 32))) {
      error.value = '选区包含锁定图层，请先解锁'
      return
    }
    workspace.requestPause()
    edit(() => removeLayers(c, ids))
    actions.selectLayer(null)
  }
  function deleteLayer(id: number) {
    if (busy.value || !composition.value) return
    edit(() => removeLayer(composition.value!, id))
    actions.selectLayer(null)
  }
  return { moveLayerGroup, moveSelectedLayers, insertLayer, deleteLayer, deleteSelectedLayers, copySelectedLayers, moveLayer, copyLayer, closeDocument, operation, completedOperation, runOperation, doc, library, sceneIndex, compositionId, selectedId, frame, version, resourceVersion, busy, error, notices, hidden, dirty, scene, composition, selected, documents, open, importFiles, edit, refresh, undo, redo, selectScene, currentValue, setValue, restoreChannel, translateLayer, exportBinary, saveProject,
    canUndo: computed(() => { historyVersion.value; return undoStack.length > 0 }), canRedo: computed(() => { historyVersion.value; return redoStack.length > 0 }),
    workspace, actions }
}
export type Editor = ReturnType<typeof createEditor>
export function download(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)])), a = document.createElement('a')
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
