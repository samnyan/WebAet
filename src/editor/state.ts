import { computed, markRaw, ref, shallowRef, toRaw, triggerRef } from 'vue'
import { parseAet } from '../core/aet/reader'
import { writeAet } from '../core/aet/writer'
import { videoCurve, type AetDocument, type EditableChannel, type Scene } from '../core/aet/types'
import { SpriteLibrary } from '../core/resources/library'
import { unpackFarc } from '../core/resources/farc'
import { parseSpriteSet } from '../core/resources/sprites'
import { parseSpriteDatabase } from '../core/resources/database'
import { sampleCurve, sampleCurveTangent } from '../core/animation/curves'

export function createEditor() {
  const doc = shallowRef<AetDocument | null>(null), library = markRaw(new SpriteLibrary())
  const sceneIndex = ref(0), compositionId = ref(0), selectedId = ref<number | null>(null), frame = ref(0)
  const version = ref(0), resourceVersion = ref(0), busy = ref(false), error = ref(''), notices = ref<string[]>([]), hidden = ref(new Set<number>()), dirty = ref(false)
  const undoStack: Scene[][] = [], redoStack: Scene[][] = [], historyVersion = ref(0)
  const scene = computed(() => doc.value?.scenes[sceneIndex.value] ?? null)
  const composition = computed(() => scene.value?.compositions.find(c => c.offset === compositionId.value) ?? null)
  const selected = computed(() => { version.value; return scene.value?.compositions.flatMap(c => c.layers).find(l => l.offset === selectedId.value) ?? null })
  const documents = shallowRef<{ name: string; bytes: Uint8Array }[]>([])
  const snapshot = () => structuredClone(toRaw(doc.value!.scenes))
  function refresh() { version.value++; triggerRef(doc) }
  function edit(action: () => void) {
    if (!doc.value) return
    const before = snapshot()
    try {
      action()
      if (JSON.stringify(before) === JSON.stringify(doc.value.scenes)) return
      undoStack.push(before); if (undoStack.length > 50) undoStack.shift(); redoStack.length = 0
      historyVersion.value++; dirty.value = true; refresh()
    } catch (e) { doc.value.scenes = before; refresh(); error.value = String(e) }
  }
  function undo() { if (!doc.value || !undoStack.length) return; redoStack.push(snapshot()); doc.value.scenes = undoStack.pop()!; historyVersion.value++; dirty.value = true; refresh() }
  function redo() { if (!doc.value || !redoStack.length) return; undoStack.push(snapshot()); doc.value.scenes = redoStack.pop()!; historyVersion.value++; dirty.value = true; refresh() }
  function selectScene(index: number) {
    sceneIndex.value = index; const s = doc.value?.scenes[index]
    compositionId.value = s?.compositions.at(-1)?.offset ?? 0; selectedId.value = null; frame.value = s?.start ?? 0; hidden.value = new Set()
  }
  function open(bytes: Uint8Array, name: string) {
    const parsed = markRaw(parseAet(bytes, name)); doc.value = parsed; undoStack.length = 0; redoStack.length = 0; historyVersion.value++; dirty.value = false; selectScene(0); refresh()
  }
  async function importFiles(files: File[]) {
    const projects = files.filter(file => /\.webaet$/i.test(file.name))
    if (projects.length > 1) { error.value = '一次只能打开一个 WebAet 工程；请分别导入。'; return }
    if (projects.length && dirty.value && !window.confirm('当前修改尚未保存，打开工程会丢弃修改。继续？')) return
    busy.value = true; error.value = ''; notices.value = []
    const incoming: { name: string; bytes: Uint8Array }[] = []
    try {
      for (const file of files) {
        if (!/\.(bin|farc|webaet)$/i.test(file.name)) continue
        try {
          const bytes = new Uint8Array(await file.arrayBuffer())
          if (/\.webaet$/i.test(file.name)) { loadProject(new TextDecoder().decode(bytes)); continue }
          const entries = /\.farc$/i.test(file.name) ? unpackFarc(bytes) : new Map([[file.name, bytes]])
          for (const [name, data] of entries) {
            if (/^aet_.*\.bin$/i.test(name) && !/^aet_db/i.test(name)) incoming.push({ name, bytes: data })
            else if (/^spr_db\.bin$/i.test(name)) { library.bindDatabase(parseSpriteDatabase(data)); resourceVersion.value++ }
            else if (/^spr_.*\.bin$/i.test(name) && !/^spr_db/i.test(name)) { library.add(parseSpriteSet(data, name)); resourceVersion.value++ }
          }
        } catch (e) { notices.value.push(`${file.name}: ${e}`) }
        await new Promise(resolve => setTimeout(resolve, 0))
      }
      documents.value = [...documents.value.filter(d => !incoming.some(n => n.name === d.name)), ...incoming]
      if (incoming.length && !doc.value) open(incoming[0]!.bytes, incoming[0]!.name)
    } catch (e) { error.value = String(e) }
    finally { busy.value = false }
  }
  function setValue(channel: EditableChannel, value: number) {
    const l = selected.value; if (!l?.video || (l.flags & 32)) return
    const curve = videoCurve(l.video, channel); if (!curve) return
    edit(() => {
      const time = Math.fround(frame.value)
      if (!Number.isFinite(Math.fround(value)) || !Number.isFinite(time)) throw new Error('属性值和帧时间必须是有限 float32')
      if (curve.keys.length <= 1) curve.keys = [{ frame: 0, value, tangent: 0 }]
      else {
        const found = curve.keys.find(k => k.frame === time)
        if (found) found.value = value
        else { const tangent = sampleCurveTangent(curve, time); curve.keys.push({ frame: time, value, tangent }); curve.keys.sort((a, b) => a.frame - b.frame) }
      }
    })
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
    let binary = ''; for (const b of doc.value.source) binary += String.fromCharCode(b)
    download(new TextEncoder().encode(JSON.stringify({ format: 'webaet-project', version: 1, name: doc.value.name, source: btoa(binary), scenes: doc.value.scenes, view: { sceneIndex: sceneIndex.value, compositionId: compositionId.value, frame: frame.value } })), doc.value.name.replace(/\.bin$/i, '') + '.webaet')
    dirty.value = false
  }
  function loadProject(text: string) {
    const project = JSON.parse(text)
    if (project.format !== 'webaet-project' || project.version !== 1) throw new Error('Unsupported WebAet project')
    const source = Uint8Array.from(atob(project.source), c => c.charCodeAt(0))
    const draft = parseAet(source, project.name); draft.scenes = project.scenes
    const validated = parseAet(writeAet(draft), project.name)
    open(source, project.name); doc.value!.scenes = validated.scenes
    // Normalize offsets against original source: appended curve data addresses are not structural IDs.
    selectScene(Math.max(0, Math.min(doc.value!.scenes.length - 1, project.view?.sceneIndex ?? 0)))
    if (scene.value?.compositions.some(c => c.offset === project.view?.compositionId)) compositionId.value = project.view.compositionId
    frame.value = project.view?.frame ?? scene.value?.start ?? 0; refresh()
  }
  return { doc, library, sceneIndex, compositionId, selectedId, frame, version, resourceVersion, busy, error, notices, hidden, dirty, scene, composition, selected, documents, open, importFiles, edit, refresh, undo, redo, selectScene, currentValue, setValue, translateLayer, exportBinary, saveProject,
    canUndo: computed(() => { historyVersion.value; return undoStack.length > 0 }), canRedo: computed(() => { historyVersion.value; return redoStack.length > 0 }) }
}
export type Editor = ReturnType<typeof createEditor>
export function download(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)])), a = document.createElement('a')
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
