<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { NButton, NSelect, NAlert, NSpin, NTag, NCollapse, NCollapseItem } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { createEditor } from '../editor/state'
import LayerHierarchy from '../components/editor/LayerHierarchy.vue'
import LayerInspector from '../components/editor/LayerInspector.vue'
import AetStage from '../components/editor/AetStage.vue'
import AetTimeline from '../components/editor/AetTimeline.vue'
const e = createEditor(), { locale, t } = useI18n()
const input = ref<HTMLInputElement>(), directory = ref<HTMLInputElement>(), warnings = ref<string[]>([])
const scenes = computed(() => e.doc.value?.scenes.map((s, i) => ({ value: i, label: s.name })) ?? [])
const assets = computed(() => e.documents.value.map(d => ({ value: d.name, label: d.name })))
async function filesChanged(event: Event) { const target = event.target as HTMLInputElement; if (target.files) await e.importFiles([...target.files]); target.value = '' }
async function pickDirectory() {
  const picker = (window as unknown as { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker
  if (!picker) { directory.value?.click(); return }
  try {
    const root = await picker(), files: File[] = []
    async function walk(dir: FileSystemDirectoryHandle) {
      for await (const handle of (dir as unknown as { values: () => AsyncIterable<FileSystemHandle> }).values()) {
        if (handle.kind === 'directory') await walk(handle as FileSystemDirectoryHandle)
        else if (/^(aet_|spr_).*\.(bin|farc)$/i.test(handle.name) && !/^(aet|spr)_db/i.test(handle.name)) files.push(await (handle as FileSystemFileHandle).getFile())
      }
    }
    e.busy.value = true; await walk(root); await e.importFiles(files)
  } catch (err) { if ((err as Error).name !== 'AbortError') e.error.value = String(err) }
  finally { e.busy.value = false }
}
function changeAsset(name: string) { if (e.dirty.value && !window.confirm('当前修改尚未保存，切换资源会丢弃修改。继续？')) return; const asset = e.documents.value.find(d => d.name === name); if (asset) { try { e.open(asset.bytes, name) } catch (err) { e.error.value = String(err) } } }
function keydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key === 's') { event.preventDefault(); e.saveProject(); return }
  if ((event.target as HTMLElement)?.closest('input,textarea,[contenteditable=true]')) return
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? e.redo() : e.undo() }
}
function beforeUnload(event: BeforeUnloadEvent) { if (e.dirty.value) event.preventDefault() }
onMounted(() => { window.addEventListener('keydown', keydown); window.addEventListener('beforeunload', beforeUnload) })
onBeforeUnmount(() => { window.removeEventListener('keydown', keydown); window.removeEventListener('beforeunload', beforeUnload) })
</script>
<template>
  <div class="editor-shell" @dragover.prevent @drop.prevent="e.importFiles([...($event.dataTransfer?.files ?? [])])">
    <div class="app-toolbar"><strong>WebAet</strong><n-tag size="small" :bordered="false">Local</n-tag>
      <n-button size="tiny" @click="input?.click()">{{ t('open') }}</n-button><n-button size="tiny" @click="pickDirectory">打开目录</n-button>
      <n-select class="asset-select" size="tiny" filterable :value="e.doc.value?.name" :options="assets" placeholder="AET" @update:value="changeAsset" />
      <n-select class="scene-select" size="tiny" :value="e.sceneIndex.value" :options="scenes" placeholder="Scene" @update:value="e.selectScene" />
      <div class="spacer" /><span v-if="e.dirty.value" class="dirty">●</span><n-button size="tiny" :disabled="!e.canUndo.value" @click="e.undo">撤销</n-button><n-button size="tiny" :disabled="!e.canRedo.value" @click="e.redo">重做</n-button>
      <n-button size="tiny" :disabled="!e.doc.value" @click="e.saveProject">保存工程</n-button><n-button size="tiny" type="primary" :disabled="!e.doc.value" @click="e.exportBinary">导出 AET</n-button>
      <n-button size="tiny" @click="locale = locale === 'zh-CN' ? 'en' : 'zh-CN'">{{ t('language') }}</n-button>
    </div>
    <input ref="input" hidden type="file" multiple accept=".bin,.farc,.webaet" @change="filesChanged" /><input ref="directory" hidden type="file" webkitdirectory multiple @change="filesChanged" />
    <n-alert v-if="e.error.value" type="error" closable @close="e.error.value = ''">{{ e.error.value }}</n-alert>
    <n-spin :show="e.busy.value" class="workspace-spin"><div class="workspace"><LayerHierarchy :editor="e" /><AetStage :editor="e" @warnings="warnings = $event" /><LayerInspector :editor="e" /></div></n-spin>
    <div v-if="!e.doc.value" class="welcome"><h2>AET Layout & Animation</h2><p>{{ t('ready') }}</p><p>拖入 aet_*.bin 与 spr_*.farc，或打开资源目录。全部解析与编辑在浏览器本地完成。</p><n-button type="primary" @click="input?.click()">打开 AET / Sprite</n-button></div>
    <AetTimeline :editor="e" />
    <div class="statusbar"><span>{{ e.doc.value?.name ?? 'No document' }} · {{ e.library.sets.length }} sprite sets · {{ e.library.entries.size }} sprite aliases</span><div class="spacer" /><span>{{ e.scene.value?.fps ?? 0 }} fps</span></div>
    <n-collapse v-if="warnings.length || e.notices.value.length" class="diagnostics"><n-collapse-item :title="`诊断 / Diagnostics (${warnings.length + e.notices.value.length})`" name="diagnostics"><div class="diagnostic-list"><p v-for="w in [...e.notices.value, ...warnings]" :key="w">{{ w }}</p></div></n-collapse-item></n-collapse>
  </div>
</template>
