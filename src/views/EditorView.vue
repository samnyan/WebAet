<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { NButton, NSelect, NSpin, NTag } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { createEditor } from '../editor/state'
import { ResourceDirectory, type DirectoryProgress } from '../editor/resourceDirectory'
import { parseSpriteDatabase, type SpriteDatabaseEntry } from '../core/resources/database'
import { spriteDependencies } from '../core/resources/dependencies'
import LayerHierarchy from '../components/editor/LayerHierarchy.vue'
import LayerInspector from '../components/editor/LayerInspector.vue'
import AetStage from '../components/editor/AetStage.vue'
import AetTimeline from '../components/editor/AetTimeline.vue'
import EditorStatusBar from '../components/editor/EditorStatusBar.vue'
const e = createEditor(), { locale, t } = useI18n()
const input = ref<HTMLInputElement>(), warnings = ref<string[]>([])
const scenes = computed(() => e.doc.value?.scenes.map((s, i) => ({ value: i, label: s.name })) ?? [])
const root = ref<ResourceDirectory>(), indexedPaths = ref<string[]>([]), progress = ref<DirectoryProgress | null>(null)
const assets = computed(() => root.value ? indexedPaths.value.filter(p => /(?:^|\/)aet_.*\.bin$/i.test(p) && !/(?:^|\/)aet_db/i.test(p)).map(p => ({ value: p, label: p })) : e.documents.value.map(d => ({ value: d.name, label: d.name })))
async function importUserFiles(files: File[]) {
  if (e.busy.value) return
  loadController = new AbortController()
  const signal = loadController.signal
  try {
    await e.importFiles(files, signal, (current, done, total) => { progress.value = { phase: '导入文件', current, done, total } })
  } catch (err) { if (signal.aborted) e.notices.value.push('文件导入已取消；已加载的资源保留。'); else e.error.value = String(err) }
  finally { loadController = undefined; progress.value = null }
}
async function filesChanged(event: Event) { const target = event.target as HTMLInputElement; if (target.files) await importUserFiles([...target.files]); target.value = '' }
let scanController: AbortController | undefined
let loadController: AbortController | undefined
async function pickDirectory(rescan = false) {
  if (e.busy.value) return
  const picker = (window as unknown as { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker
  if (!picker) { e.error.value = '此浏览器不支持目录句柄；请用 Chromium 选择资源目录，单文件导入仍可用。'; return }
  try {
    const selected = rescan && root.value ? root.value.root : await picker()
    e.busy.value = true; progress.value = { phase: '读取索引', current: selected.name, done: 0, total: 0 }
    const index = new ResourceDirectory(selected)
    scanController = new AbortController()
    await index.scan(rescan, p => { progress.value = p }, scanController.signal)
    root.value = index; indexedPaths.value = index.paths
  } catch (err) { if ((err as Error).name !== 'AbortError') e.error.value = String(err) }
  finally { scanController = undefined; e.busy.value = false; progress.value = null }
}
async function changeAsset(name: string) {
  if (e.busy.value || e.dirty.value && !window.confirm('当前修改尚未保存，切换资源会丢弃修改。继续？')) return
  if (!root.value) { const asset = e.documents.value.find(d => d.name === name); if (asset) { try { e.open(asset.bytes, name) } catch (err) { e.error.value = String(err) } }; return }
  e.busy.value = true; e.error.value = ''; e.notices.value = []
  loadController = new AbortController()
  const signal = loadController.signal
  try {
    progress.value = { phase: '加载 AET', current: name, done: 0, total: 0 }
    const file = await root.value.file(name), bytes = new Uint8Array(await file.arrayBuffer())
    signal.throwIfAborted()
    e.open(bytes, name); e.library.clear(); e.documents.value = []; e.resourceVersion.value++
    const sources = e.doc.value!.scenes.flatMap(s => s.videos.flatMap(v => v.sources))
    const dbPaths = root.value.companions(name, new Set(['spr_db.bin']))
    const database: SpriteDatabaseEntry[] = []
    for (const path of dbPaths) {
      const dbFile = await root.value.file(path), entries = parseSpriteDatabase(new Uint8Array(await dbFile.arrayBuffer()))
      signal.throwIfAborted()
      database.push(...entries)
      await e.importFiles([dbFile], signal)
    }
    const paths = spriteDependencies(name, sources, database, indexedPaths.value)
    for (let i = 0; i < paths.length; i++) {
      signal.throwIfAborted()
      progress.value = { phase: '加载 Sprite', current: paths[i]!, done: i, total: paths.length }
      await e.importFiles([await root.value.file(paths[i]!)], signal)
    }
  } catch (err) { if (signal.aborted) e.notices.value.push('资源加载已取消；当前资源可能不完整，请重新选择 AET 重试。'); else e.error.value = String(err) }
  finally { loadController = undefined; e.busy.value = false; progress.value = null }
}
function keydown(event: KeyboardEvent) {
  if (e.busy.value) { if ((event.ctrlKey || event.metaKey) && ['s', 'z'].includes(event.key.toLowerCase())) event.preventDefault(); return }
  if ((event.ctrlKey || event.metaKey) && event.key === 's') { event.preventDefault(); e.runOperation('保存工程', e.saveProject); return }
  if ((event.target as HTMLElement)?.closest('input,textarea,[contenteditable=true]')) return
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? e.redo() : e.undo() }
}
function beforeUnload(event: BeforeUnloadEvent) { if (e.dirty.value) event.preventDefault() }
onMounted(() => { window.addEventListener('keydown', keydown); window.addEventListener('beforeunload', beforeUnload) })
onBeforeUnmount(() => { window.removeEventListener('keydown', keydown); window.removeEventListener('beforeunload', beforeUnload) })
</script>
<template>
  <div class="editor-shell" @dragover.prevent @drop.prevent="importUserFiles([...($event.dataTransfer?.files ?? [])])">
    <div class="app-toolbar"><strong>WebAet</strong><n-tag size="small" :bordered="false">Local</n-tag>
      <n-button size="tiny" :disabled="e.busy.value" @click="input?.click()">{{ t('open') }}</n-button><n-button size="tiny" :disabled="e.busy.value" @click="pickDirectory(false)">选择资源目录</n-button><n-button v-if="root" size="tiny" :disabled="e.busy.value" @click="pickDirectory(true)">重新扫描</n-button>
      <n-select class="asset-select" size="tiny" :disabled="e.busy.value" filterable :value="e.doc.value?.name" :options="assets" placeholder="AET" @update:value="changeAsset" />
      <n-select class="scene-select" size="tiny" :disabled="e.busy.value" :value="e.sceneIndex.value" :options="scenes" placeholder="Scene" @update:value="e.selectScene" />
      <div class="spacer" /><span v-if="e.dirty.value" class="dirty">●</span><n-button size="tiny" :disabled="e.busy.value || !e.canUndo.value" @click="e.undo">撤销</n-button><n-button size="tiny" :disabled="e.busy.value || !e.canRedo.value" @click="e.redo">重做</n-button>
      <n-button size="tiny" :disabled="e.busy.value || !e.doc.value" @click="e.runOperation('保存工程', e.saveProject)">保存工程</n-button><n-button size="tiny" type="primary" :disabled="e.busy.value || !e.doc.value" @click="e.runOperation('导出 AET', e.exportBinary)">导出 AET</n-button>
      <n-button size="tiny" @click="locale = locale === 'zh-CN' ? 'en' : 'zh-CN'">{{ t('language') }}</n-button>
    </div>
    <input ref="input" hidden type="file" multiple accept=".bin,.farc,.webaet" @change="filesChanged" />
    <n-spin :show="e.busy.value" class="workspace-spin"><div class="workspace"><LayerHierarchy :editor="e" /><AetStage :editor="e" @warnings="warnings = $event" /><LayerInspector :editor="e" /></div></n-spin>
    <div v-if="!e.doc.value" class="welcome"><h2>AET Layout & Animation</h2><p>{{ t('ready') }}</p><p>先选择 diva_main 资源目录建立索引，再从顶部选择 AET。目录索引不读取贴图内容；单文件可独立导入。</p><n-button type="primary" :disabled="e.busy.value" @click="input?.click()">打开 AET / Sprite</n-button></div>
    <AetTimeline :editor="e" />
    <EditorStatusBar :editor="e" :warnings="warnings" :progress="progress" @cancel="scanController?.abort(); loadController?.abort()" />
  </div>
</template>
