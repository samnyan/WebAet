<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, provide, ref } from 'vue'
import { usePanelSizes } from '../editor/panelSizes'
import { materialPackagesKey } from '../editor/materialPackages'
import type { MaterialPackage } from '../editor/materialPicker'
import { NButton, NSelect, NSpin, NModal } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { createEditor } from '../editor/state'
import { ResourceDirectory, type DirectoryProgress } from '../editor/resourceDirectory'
import { parseSpriteDatabase, type SpriteDatabaseEntry } from '../core/resources/database'
import { spriteDependencies } from '../core/resources/dependencies'
import { unresolvedSpriteSources } from '../core/resources/audit'
import LeftSidebar from '../components/editor/LeftSidebar.vue'
import type { WorkspaceAsset } from '../editor/workspaceAssets'
import LayerInspector from '../components/editor/LayerInspector.vue'
import AetStage from '../components/editor/AetStage.vue'
import AetTimeline from '../components/editor/AetTimeline.vue'
import EditorStatusBar from '../components/editor/EditorStatusBar.vue'
const e = createEditor(),
  { locale, t } = useI18n()
const {
  host: workspaceHost,
  style: panelStyle,
  start: resizePanel,
  reset: resetPanels,
} = usePanelSizes()
function resetLayout() {
  resetPanels()
  window.dispatchEvent(new Event('webaet:reset-layout'))
}
const closeDialog = ref(false)
function confirmClose() {
  if (e.busy.value) return
  e.closeDocument(true)
  activeAssetPath.value = ''
  importedPackages.value = []
  closeDialog.value = false
}
const missingResources = computed(
  () => !!e.doc.value && !e.busy.value && resourceWarnings.value.length > 0,
)
const input = ref<HTMLInputElement>(),
  warnings = ref<string[]>([])
const resourceWarnings = computed(() => {
  e.version.value
  e.resourceVersion.value
  return unresolvedSpriteSources(e.doc.value, e.library)
})
const allWarnings = computed(() => [...warnings.value, ...resourceWarnings.value])
const scenes = computed(
  () => e.doc.value?.scenes.map((s, i) => ({ value: i, label: s.name })) ?? [],
)
const root = ref<ResourceDirectory>(),
  indexedPaths = ref<string[]>([]),
  progress = ref<DirectoryProgress | null>(null)
const assets = computed(() =>
  root.value
    ? indexedPaths.value
        .filter((p) => /(?:^|\/)aet_.*\.bin$/i.test(p) && !/(?:^|\/)aet_db/i.test(p))
        .map((p) => ({ value: p, label: p }))
    : e.documents.value.map((d) => ({ value: d.name, label: d.name })),
)
const importedPackages = ref<File[]>([])
provide(
  materialPackagesKey,
  computed<MaterialPackage[]>(() => {
    e.resourceVersion.value
    const disk = root.value
      ? indexedPaths.value
          .filter((path) => /\.(farc)$/i.test(path) || /(?:^|\/)spr_(?!db).*\.bin$/i.test(path))
          .map((path) => ({
            key: `disk:${path}`,
            label: path,
            load: async () => root.value!.file(path),
          }))
      : []
    const files = importedPackages.value.map((file) => ({
      key: `import:${file.name}`,
      label: file.name,
      load: async () => file,
    }))
    const loaded = e.library.sets.map((set) => ({
      key: `loaded:${set.name}`,
      label: `${set.name} · 已加载`,
      load: async () => set,
    }))
    return [...disk, ...files, ...loaded]
  }),
)
const activeAssetPath = ref('')
const libraryAssets = computed<WorkspaceAsset[]>(() =>
  assets.value.map((asset) => ({
    path: asset.value,
    name: asset.value.split('/').at(-1)!,
    loaded:
      asset.value === activeAssetPath.value || (!root.value && asset.value === e.doc.value?.name),
  })),
)
function openComposition(sceneIndex: number, compositionId: number) {
  e.actions.openComposition(sceneIndex, compositionId)
}
async function importUserFiles(files: File[]) {
  if (e.busy.value) return
  loadController = new AbortController()
  const signal = loadController.signal
  try {
    await e.importFiles(files, signal, (current, done, total) => {
      progress.value = { phase: '导入文件', current, done, total }
    })
    importedPackages.value = [
      ...importedPackages.value.filter((old) => !files.some((file) => file.name === old.name)),
      ...files.filter(
        (file) => /\.farc$/i.test(file.name) || /^spr_(?!db).*\.bin$/i.test(file.name),
      ),
    ]
  } catch (err) {
    if (signal.aborted) e.notices.value.push('文件导入已取消；已加载的资源保留。')
    else e.error.value = String(err)
  } finally {
    loadController = undefined
    progress.value = null
  }
}
async function filesChanged(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files) await importUserFiles([...target.files])
  target.value = ''
}
let scanController: AbortController | undefined
let loadController: AbortController | undefined
async function pickDirectory(rescan = false) {
  if (e.busy.value) return
  const picker = (
    window as unknown as { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }
  ).showDirectoryPicker
  if (!picker) {
    e.error.value = '此浏览器不支持目录句柄；请用 Chromium 选择资源目录，单文件导入仍可用。'
    return
  }
  try {
    const selected = await picker()
    e.busy.value = true
    progress.value = { phase: '读取索引', current: selected.name, done: 0, total: 0 }
    const index = new ResourceDirectory(selected)
    scanController = new AbortController()
    await index.scan(
      rescan,
      (p) => {
        progress.value = p
      },
      scanController.signal,
    )
    root.value = index
    indexedPaths.value = index.paths
  } catch (err) {
    if ((err as Error).name !== 'AbortError') e.error.value = String(err)
  } finally {
    scanController = undefined
    e.busy.value = false
    progress.value = null
  }
}
async function changeAsset(name: string) {
  if (
    e.busy.value ||
    (e.dirty.value && !window.confirm('当前修改尚未保存，切换资源会丢弃修改。继续？'))
  )
    return
  if (!root.value) {
    const asset = e.documents.value.find((d) => d.name === name)
    if (asset) {
      try {
        e.open(asset.bytes, name)
      } catch (err) {
        e.error.value = String(err)
      }
    }
    return
  }
  e.busy.value = true
  e.error.value = ''
  e.notices.value = []
  loadController = new AbortController()
  const signal = loadController.signal
  try {
    progress.value = { phase: '加载 AET', current: name, done: 0, total: 0 }
    const file = await root.value.file(name),
      bytes = new Uint8Array(await file.arrayBuffer())
    signal.throwIfAborted()
    e.open(bytes, name)
    activeAssetPath.value = name
    e.library.clear()
    e.documents.value = []
    e.resourceVersion.value++
    const sources = e.doc.value!.scenes.flatMap((s) => s.videos.flatMap((v) => v.sources))
    const dbPaths = root.value.companions(name, new Set(['spr_db.bin']))
    const database: SpriteDatabaseEntry[] = []
    for (const path of dbPaths) {
      const dbFile = await root.value.file(path),
        entries = parseSpriteDatabase(new Uint8Array(await dbFile.arrayBuffer()))
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
  } catch (err) {
    if (signal.aborted)
      e.notices.value.push('资源加载已取消；当前资源可能不完整，请重新选择 AET 重试。')
    else e.error.value = String(err)
  } finally {
    loadController = undefined
    e.busy.value = false
    progress.value = null
  }
}
function keydown(event: KeyboardEvent) {
  if (e.busy.value) {
    if ((event.ctrlKey || event.metaKey) && ['s', 'z'].includes(event.key.toLowerCase()))
      event.preventDefault()
    return
  }
  if ((event.ctrlKey || event.metaKey) && event.key === 's') {
    event.preventDefault()
    e.runOperation('保存工程', e.saveProject)
    return
  }
  if ((event.target as HTMLElement)?.closest('input,textarea,[contenteditable=true]')) return
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    event.shiftKey ? e.redo() : e.undo()
  }
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (e.dirty.value) event.preventDefault()
}
onMounted(() => {
  window.addEventListener('keydown', keydown)
  window.addEventListener('beforeunload', beforeUnload)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', keydown)
  window.removeEventListener('beforeunload', beforeUnload)
})
const handleStatusBarCancel = () => {
  scanController?.abort()
  loadController?.abort()
}
</script>
<template>
  <div
    class="editor-shell"
    @dragover.prevent
    @drop.prevent="importUserFiles([...($event.dataTransfer?.files ?? [])])"
  >
    <div class="app-toolbar">
      <strong>WebAet</strong>
      <div class="file-actions">
        <n-button size="tiny" :disabled="e.busy.value" @click="input?.click()">打开AET</n-button>
        <n-button
          data-testid="close-document"
          size="tiny"
          type="error"
          :disabled="e.busy.value || (!e.doc.value && !e.library.sets.length)"
          @click="closeDialog = true"
          >关闭</n-button
        >
        <n-button
          size="tiny"
          :disabled="e.busy.value || !e.doc.value"
          @click="e.runOperation('保存工程', e.saveProject)"
          >保存工程</n-button
        >
        <n-button
          size="tiny"
          type="primary"
          :disabled="e.busy.value || !e.doc.value"
          @click="e.runOperation('导出 AET', e.exportBinary)"
          >导出AET</n-button
        >
        <span v-if="e.dirty.value" class="dirty" title="有未保存的修改">●</span>
      </div>
      <span class="toolbar-separator" aria-hidden="true" />
      <n-button
        size="tiny"
        :disabled="e.busy.value"
        :title="
          root
            ? `当前目录：${root.root.name}；点击重新选择目录并扫描`
            : '选择资源目录，建立索引并自动匹配关联贴图'
        "
        @click="pickDirectory(!!root)"
        >{{ root ? '重新扫描资源' : '选择资源目录' }}</n-button
      >
      <n-select
        class="asset-select"
        size="tiny"
        :disabled="e.busy.value"
        filterable
        :value="e.doc.value?.name"
        :options="assets"
        placeholder="AET"
        @update:value="changeAsset"
      />
      <n-select
        class="scene-select"
        size="tiny"
        :disabled="e.busy.value"
        :value="e.sceneIndex.value"
        :options="scenes"
        placeholder="Scene"
        @update:value="e.selectScene"
      />
      <div class="spacer" />
      <n-button size="tiny" :disabled="e.busy.value || !e.canUndo.value" @click="e.undo"
        >撤销</n-button
      ><n-button size="tiny" :disabled="e.busy.value || !e.canRedo.value" @click="e.redo"
        >重做</n-button
      >
      <n-button size="tiny" @click="resetLayout">重置布局</n-button>
      <n-button size="tiny" @click="locale = locale === 'zh-CN' ? 'en' : 'zh-CN'">{{
        t('language')
      }}</n-button>
    </div>
    <div v-if="missingResources" class="resource-hint" role="status">
      <span
        >{{
          e.library.sets.length
            ? '部分关联贴图尚未加载，画布可能显示不完整。'
            : '当前 AET 尚未加载关联贴图，画布可能显示不完整。'
        }}请选择资源目录后重新打开该 AET，或通过“打开AET”补充导入 Sprite / FARC。</span
      ><n-button size="tiny" @click="pickDirectory(!!root)">{{
        root ? '重新扫描资源' : '选择资源目录'
      }}</n-button>
    </div>
    <n-modal
      v-model:show="closeDialog"
      preset="dialog"
      class="editor-dialog"
      title="关闭当前 AET"
      :mask-closable="false"
    >
      <template #default
        ><p>
          {{
            e.dirty.value
              ? '当前修改尚未保存，关闭将丢弃这些修改。请先保存工程或导出 AET。'
              : '将关闭当前 AET 并释放已加载的贴图资源。资源目录索引会保留。'
          }}
        </p></template
      >
      <template #action
        ><n-button size="small" @click="closeDialog = false">取消</n-button
        ><n-button size="small" type="error" :disabled="e.busy.value" @click="confirmClose"
          >确认关闭</n-button
        ></template
      >
    </n-modal>
    <input
      ref="input"
      hidden
      type="file"
      multiple
      accept=".bin,.farc,.webaet"
      @change="filesChanged"
    />
    <n-spin :show="e.busy.value" class="workspace-spin"
      ><div
        :ref="(el) => (workspaceHost = el as HTMLElement | undefined)"
        class="workspace"
        :style="panelStyle"
      >
        <LeftSidebar
          :editor="e"
          :assets="libraryAssets"
          @open-asset="changeAsset"
          @open-composition="openComposition"
        />
        <div
          class="panel-divider"
          role="separator"
          title="拖动调整宽度，双击恢复默认"
          @dblclick="resetPanels"
          aria-label="调整左侧面板宽度"
          aria-orientation="vertical"
          @pointerdown.prevent="resizePanel($event, 'left')"
        />
        <AetStage :editor="e" @warnings="warnings = $event" />
        <div
          class="panel-divider"
          role="separator"
          title="拖动调整宽度，双击恢复默认"
          @dblclick="resetPanels"
          aria-label="调整右侧面板宽度"
          aria-orientation="vertical"
          @pointerdown.prevent="resizePanel($event, 'right')"
        />
        <LayerInspector :editor="e" /></div
    ></n-spin>
    <div v-if="!e.doc.value" class="welcome">
      <h2>AET Layout & Animation</h2>
      <p>{{ t('ready') }}</p>
      <p>
        先选择 diva_main 资源目录建立索引，再从顶部选择
        AET。目录索引不读取贴图内容；单文件可独立导入。
      </p>
      <n-button type="primary" :disabled="e.busy.value" @click="input?.click()"
        >打开 AET / Sprite</n-button
      >
    </div>
    <AetTimeline :editor="e" />
    <EditorStatusBar
      :editor="e"
      :warnings="allWarnings"
      :progress="progress"
      @cancel="handleStatusBarCancel"
    />
  </div>
</template>
