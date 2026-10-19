<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Editor } from '../../editor/state'
import type { DirectoryProgress } from '../../editor/resourceDirectory'
const props = defineProps<{ editor: Editor; warnings: string[]; progress: DirectoryProgress | null }>()
const emit = defineEmits<{ cancel: [] }>()
const panel = ref<'notifications' | 'diagnostics' | null>(null), host = ref<HTMLElement>()
const history = ref<{ id: number; text: string; kind: string }[]>([])
let serial = 0
function record(text: string, kind: string) {
  if (!text || history.value.some(n => n.text === text && n.kind === kind)) return
  history.value.unshift({ id: ++serial, text, kind }); history.value = history.value.slice(0, 100)
}
watch(() => props.editor.error.value, text => { if (text) { record(text, 'error'); panel.value = 'notifications' } })
watch(() => [...props.editor.notices.value], list => { for (const text of list) record(text, 'info') })
watch(() => props.editor.completedOperation.value, text => { if (text) record(text, 'success') })
const diagnostics = computed(() => [...new Set([...(props.editor.error.value ? [props.editor.error.value] : []), ...props.editor.notices.value, ...props.warnings])])
const query = ref(''), copyStatus = ref('')
const filteredDiagnostics = computed(() => { const text = query.value.trim().toLowerCase(); return diagnostics.value.filter(item => item.toLowerCase().includes(text)) })
watch([query, diagnostics], () => { copyStatus.value = '' })
async function copyDiagnostics() {
  try { await navigator.clipboard.writeText(filteredDiagnostics.value.join('\n')); copyStatus.value = '已复制' }
  catch (err) { copyStatus.value = `复制失败：${String(err)}` }
}
const task = computed(() => props.progress?.phase ?? props.editor.operation.value)
watch(() => !!props.progress, (current, previous) => { if (!current && previous) record('资源任务已结束（详情见诊断）', 'info') })
function toggle(value: 'notifications' | 'diagnostics') { panel.value = panel.value === value ? null : value }
function outside(event: PointerEvent) { if (!host.value?.contains(event.target as Node)) panel.value = null }
function keyboard(event: KeyboardEvent) { if (event.key === 'Escape') panel.value = null }
onMounted(() => { document.addEventListener('pointerdown', outside); document.addEventListener('keydown', keyboard) })
onBeforeUnmount(() => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', keyboard) })
</script>
<template>
  <footer ref="host" class="statusbar" data-testid="statusbar">
    <span class="document-status" :title="editor.doc.value?.name">{{ editor.doc.value?.name ?? 'No document' }} · {{ editor.library.sets.length }} sprite sets · {{ editor.library.entries.size }} sprite aliases</span>
    <div class="spacer" />
    <button v-if="task" class="status-item" data-testid="task-status" @click="toggle('notifications')"><span class="spinner" />{{ task }}</button>
    <button class="status-item" data-testid="diagnostics-toggle" :aria-expanded="panel === 'diagnostics'" title="显示诊断" @click="toggle('diagnostics')">△ 诊断 / Diagnostics ({{ diagnostics.length }})</button>
    <span class="fps">{{ editor.scene.value?.fps ?? 0 }} fps</span>
    <button class="status-item bell" data-testid="notifications-toggle" :aria-expanded="panel === 'notifications'" :title="panel === 'notifications' ? '隐藏通知' : '显示通知'" aria-label="通知" @click="toggle('notifications')"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg><span v-if="history.length">{{ history.length }}</span></button>
    <section v-if="panel" class="status-popup" :data-testid="`${panel}-popup`" role="region" :aria-label="panel === 'notifications' ? '通知列表' : '诊断列表'">
      <header><strong>{{ panel === 'notifications' ? '通知 / Notifications' : `诊断 / Diagnostics (${diagnostics.length})` }}</strong><div class="spacer" /><button v-if="panel === 'notifications'" class="status-item" @click="history = []; editor.error.value = ''">清除通知</button><button class="status-item" aria-label="关闭面板" @click="panel = null">×</button></header>
      <div v-if="panel === 'diagnostics'" class="diagnostic-tools"><input v-model="query" data-testid="diagnostics-search" aria-label="搜索诊断" placeholder="搜索名称、ID 或错误内容" /><button class="status-item" :disabled="!filteredDiagnostics.length" @click="copyDiagnostics">复制诊断</button><small>{{ filteredDiagnostics.length }} / {{ diagnostics.length }}</small><span role="status">{{ copyStatus }}</span></div>
      <div class="popup-list">
        <article v-if="panel === 'notifications' && task" data-testid="resource-progress" class="notification task"><strong><span class="spinner" />{{ task }}</strong><template v-if="progress"><p>{{ progress.current }}</p><p>{{ progress.done }}{{ progress.total ? ` / ${progress.total}` : ' 项（总量未知）' }}</p><progress v-if="progress.total" :value="progress.done" :max="progress.total" /><button class="status-item" data-testid="cancel-load" @click="emit('cancel')">取消任务</button></template><p v-else>处理中…</p></article>
        <template v-if="panel === 'notifications'"><article v-for="item in history" :key="item.id" class="notification" :class="item.kind"><span>{{ item.kind === 'error' ? '错误' : item.kind === 'success' ? '完成' : '信息' }}</span><p>{{ item.text }}</p><button class="status-item dismiss" aria-label="移除此通知" @click="history = history.filter(n => n.id !== item.id)">×</button></article><p v-if="!history.length && !task" class="empty">没有新通知</p></template>
        <template v-else><article v-for="text in filteredDiagnostics" :key="text" class="notification warning"><span>△ 诊断</span><p>{{ text }}</p></article><p v-if="!filteredDiagnostics.length" class="empty">{{ diagnostics.length ? '没有匹配的诊断' : '没有诊断信息' }}</p></template>
      </div>
    </section>
  </footer>
</template>
<style scoped>
.statusbar { position: relative; height: 26px; min-height: 26px; padding: 0 8px; gap: 8px; background: #202731; color: #a8c4e5; font-size: 11px; border-bottom: 0; box-sizing: border-box; }
.document-status { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.status-item { display: inline-flex; align-items: center; gap: 5px; padding: 3px 7px; border: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; white-space: nowrap; }
.status-item:hover, .status-item[aria-expanded=true] { background: #ffffff18; }
.bell { height: 25px; }.fps { white-space: nowrap; }
.status-popup { position: absolute; right: 8px; bottom: 30px; width: min(480px, calc(100vw - 16px)); z-index: 150; background: #252930; color: #d9dfe7; border: 1px solid #454e5d; border-radius: 5px; box-shadow: 0 6px 24px #0008; font-size: 12px; }
.diagnostic-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 8px 10px; border-bottom: 1px solid #454e5d; }.diagnostic-tools input { flex: 1; min-width: 120px; background: #1d2128; color: inherit; border: 1px solid #52606d; padding: 4px 6px; }.diagnostic-tools [role=status] { width: 100%; overflow-wrap: anywhere; }.status-item:disabled { opacity: .45; cursor: default; }
.status-popup header { display: flex; align-items: center; padding: 7px 10px; border-bottom: 1px solid #454e5d; }
.popup-list { max-height: min(420px, 60vh); overflow: auto; }.notification { position: relative; padding: 10px 32px 10px 12px; border-bottom: 1px solid #ffffff12; overflow-wrap: anywhere; }.notification p { margin: 4px 0 0; white-space: pre-wrap; }.notification > span { color: #a8c4e5; }.error > span { color: #ff9a9a; }.warning > span { color: #e4bf81; }.success > span { color: #82dca9; }.dismiss { position: absolute; right: 5px; top: 6px; }.empty { padding: 12px; margin: 0; color: #9aaac0; }.task strong { display: flex; align-items: center; gap: 6px; }.task progress { width: 100%; height: 4px; }
.spinner { display: inline-block; width: 10px; height: 10px; border: 1.5px solid #ffffff40; border-top-color: #a8c4e5; border-radius: 50%; animation: spin 1s linear infinite; flex-shrink: 0; }@keyframes spin { to { transform: rotate(360deg); } }
</style>
