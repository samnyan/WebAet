import { ref, type Ref } from 'vue'
import type { LayerRef, PropertyRef } from './properties'
import type { KeyRef } from './propertyActions'
import type { AetDocument, Composition, Scene } from '../core/aet/types'
import { resolveLayer } from './properties'

export interface WorkspaceEditorContext {
  doc: Ref<AetDocument | null>
  sceneIndex: Ref<number>
  compositionId: Ref<number>
  selectedId: Ref<number | null>
  frame: Ref<number>
  version: Ref<number>
  scene: { value: Scene | null }
  composition: { value: Composition | null }
  selectScene(index: number): void
}

export interface WorkspaceState {
  activeLayerRef: Ref<LayerRef | null>
  activeProperty: Ref<PropertyRef | null>
  activeKey: Ref<KeyRef | null>
  playing: Ref<boolean>
  leftTab: Ref<'library' | 'layers'>
  rightTab: Ref<'scene' | 'inspector'>
  docSession: Ref<number>
  expandedSets: Ref<Map<string, Set<string>>>
  isExpanded(key: string, scope?: string): boolean
  setExpanded(key: string, expanded: boolean, scope?: string): void
  toggleExpanded(key: string, scope?: string): void
  selectLayer(ref: LayerRef | null): void
  openComposition(sceneIndex: number, compId: number): void
  seek(frame: number): void
  stopPlayback(): void
  requestPause(): void
}

export function createWorkspaceState(editor: WorkspaceEditorContext): WorkspaceState {
  const activeLayerRef = ref<LayerRef | null>(null)
  const activeProperty = ref<PropertyRef | null>(null)
  const activeKey = ref<KeyRef | null>(null)
  const playing = ref(false)
  const leftTab = ref<'library' | 'layers'>('layers')
  const rightTab = ref<'scene' | 'inspector'>('inspector')
  const docSession = ref(0)
  const expandedSets = ref<Map<string, Set<string>>>(new Map())

  function getScopeKey(scope?: string): string {
    const base = `${docSession.value}:${editor.sceneIndex.value}:${editor.compositionId.value}`
    return scope ? `${base}:${scope}` : base
  }

  function isExpanded(key: string, scope?: string): boolean {
    const s = expandedSets.value.get(getScopeKey(scope))
    return s ? s.has(key) : false
  }

  function setExpanded(key: string, expanded: boolean, scope?: string): void {
    const sk = getScopeKey(scope)
    const existing = expandedSets.value.get(sk) ?? new Set<string>()
    const next = new Set(existing)
    if (expanded) next.add(key)
    else next.delete(key)
    const map = new Map(expandedSets.value)
    map.set(sk, next)
    expandedSets.value = map
  }

  function toggleExpanded(key: string, scope?: string): void {
    const sk = getScopeKey(scope)
    const existing = expandedSets.value.get(sk) ?? new Set<string>()
    const next = new Set(existing)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    const map = new Map(expandedSets.value)
    map.set(sk, next)
    expandedSets.value = map
  }

  function requestPause(): void {
    playing.value = false
  }

  function stopPlayback(): void {
    playing.value = false
  }

  function seek(targetFrame: number): void {
    requestPause()
    editor.frame.value = Math.fround(targetFrame)
  }

  function openComposition(sceneIndex: number, compId: number): void {
    requestPause()
    const targetScene = editor.doc.value?.scenes[sceneIndex]
    if (!targetScene?.compositions.some(c => c.offset === compId)) return

    if (editor.sceneIndex.value !== sceneIndex) {
      editor.selectScene(sceneIndex)
    }
    editor.compositionId.value = compId
    activeLayerRef.value = null
    activeProperty.value = null
    activeKey.value = null
    editor.selectedId.value = null
    editor.frame.value = editor.scene.value?.start ?? 0
  }

  function selectLayer(ref: LayerRef | null): void {
    if (!ref) {
      activeLayerRef.value = null
      activeProperty.value = null
      activeKey.value = null
      editor.selectedId.value = null
      return
    }

    const layer = resolveLayer(editor, ref)
    if (!layer) return

    if (editor.sceneIndex.value !== ref.sceneIndex) {
      editor.selectScene(ref.sceneIndex)
    }

    const compSwitched = editor.compositionId.value !== ref.compositionId
    if (compSwitched) {
      editor.compositionId.value = ref.compositionId
      editor.frame.value = editor.scene.value?.start ?? 0
    }

    activeLayerRef.value = {
      sceneIndex: ref.sceneIndex,
      compositionId: ref.compositionId,
      layerId: ref.layerId,
    }
    activeProperty.value = null
    activeKey.value = null
    editor.selectedId.value = ref.layerId
  }

  return {
    activeLayerRef,
    activeProperty,
    activeKey,
    playing,
    leftTab,
    rightTab,
    docSession,
    expandedSets,
    isExpanded,
    setExpanded,
    toggleExpanded,
    selectLayer,
    openComposition,
    seek,
    stopPlayback,
    requestPause,
  }
}
