import { computed, shallowRef, watch } from 'vue'
import type { Editor } from './state'
export interface WorkArea {
  start: number
  end: number
}
/** View-only, per-composition preview intervals; never included in asset snapshots. */
export function useWorkArea(editor: Editor) {
  const ranges = shallowRef(new Map<string, WorkArea>())
  const key = () => `${editor.sceneIndex.value}:${editor.compositionId.value}`
  const area = computed(() => ranges.value.get(key()) ?? null)
  watch(
    () => editor.workspace.docSession.value,
    () => {
      ranges.value = new Map()
    },
    { flush: 'sync' },
  )
  function set(start: number, end: number): boolean {
    if (
      !editor.composition.value ||
      editor.busy.value ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end <= start
    )
      return false
    const next = new Map(ranges.value)
    next.set(key(), { start, end })
    ranges.value = next
    editor.workspace.requestPause()
    return true
  }
  function clear() {
    const next = new Map(ranges.value)
    next.delete(key())
    ranges.value = next
    editor.workspace.requestPause()
  }
  return { area, set, clear }
}
