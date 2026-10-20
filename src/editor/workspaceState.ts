import { ref, watch, type Ref } from 'vue'
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
  selectedLayers: Ref<Set<number>>
  selectLayerGroup(ref: LayerRef, mode: 'toggle' | 'range'): void
  activeLayerRef: Ref<LayerRef | null>
  activeProperty: Ref<PropertyRef | null>
  selectedKeys: Ref<KeyRef[]>
  activeKey: Ref<KeyRef | null>
  playing: Ref<boolean>
  leftTab: Ref<'library' | 'resources' | 'layers'>
  rightTab: Ref<'scene' | 'inspector'>
  docSession: Ref<number>
  expandedSets: Ref<Map<string, Set<string>>>
  isExpanded(key: string, scope?: string): boolean
  setExpanded(key: string, expanded: boolean, scope?: string): void
  toggleExpanded(key: string, scope?: string): void
  selectLayer(ref: LayerRef | null): void
  goBack(): void
  navigation: Ref<{ sceneIndex: number; compositionId: number; layerId: number | null; frame: number }[]>
  openComposition(sceneIndex: number, compId: number): void
  enterComposition(layer: LayerRef): void
  seek(frame: number): void
  stopPlayback(): void
  requestPause(): void
}

export function createWorkspaceState(editor: WorkspaceEditorContext): WorkspaceState {
  const selectedKeys = ref<KeyRef[]>([])
  const selectedLayers = ref(new Set<number>())
  let selectionAnchor: number | null = null
  watch([() => editor.doc.value?.source, editor.sceneIndex, editor.compositionId], () => {
    selectedKeys.value = []
    selectedLayers.value = new Set()
    selectionAnchor = null
  }, { flush: 'sync' })
  watch(editor.version, () => {
    selectedKeys.value = []
    const valid = new Set(editor.composition.value?.layers.map(l => l.offset) ?? [])
    selectedLayers.value = new Set([...selectedLayers.value].filter(id => valid.has(id)))
  }, { flush: 'sync' })
  const activeLayerRef = ref<LayerRef | null>(null)
  const activeProperty = ref<PropertyRef | null>(null)
  const activeKey = ref<KeyRef | null>(null)
  const playing = ref(false)
  const leftTab = ref<'library' | 'resources' | 'layers'>('layers')
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

  const navigation = ref<{ sceneIndex: number; compositionId: number; layerId: number | null; frame: number }[]>([])
  watch(() => editor.doc.value?.source, () => { navigation.value = [] }, { flush: 'sync' })
  watch(editor.sceneIndex, () => { navigation.value = [] }, { flush: 'sync' })
  function goBack() {
    requestPause()
    const previous = navigation.value.pop()
    if (!previous) return
    editor.sceneIndex.value = previous.sceneIndex
    editor.compositionId.value = previous.compositionId
    selectLayer(previous.layerId === null ? null : previous as LayerRef)
    editor.frame.value = previous.frame
  }
  function openComposition(sceneIndex: number, compId: number): void {
    requestPause()
    const targetScene = editor.doc.value?.scenes[sceneIndex]
    if (!targetScene?.compositions.some(c => c.offset === compId)) return
    navigation.value = []

    if (editor.sceneIndex.value !== sceneIndex) {
      editor.selectScene(sceneIndex)
    }
    editor.compositionId.value = compId
    selectedKeys.value = []
    selectedLayers.value = new Set()
    selectionAnchor = null
    activeLayerRef.value = null
    activeProperty.value = null
    activeKey.value = null
    editor.selectedId.value = null
    editor.frame.value = editor.scene.value?.start ?? 0
  }

  function enterComposition(ref: LayerRef): void {
    const layer = resolveLayer(editor, ref)
    const scene = editor.doc.value?.scenes[ref.sceneIndex]
    if (layer?.itemType !== 3 || !scene?.compositions.some(c => c.offset === layer.item)) return
    const priorPath = editor.sceneIndex.value === ref.sceneIndex && editor.compositionId.value === ref.compositionId ? [...navigation.value] : []
    const parent = { ...ref, frame: editor.frame.value }
    openComposition(ref.sceneIndex, layer.item)
    navigation.value = [...priorPath, parent]
  }

  function selectLayerGroup(ref: LayerRef, mode: 'toggle' | 'range'): void {
    if (ref.sceneIndex !== editor.sceneIndex.value || ref.compositionId !== editor.compositionId.value || !resolveLayer(editor, ref)) {
      selectLayer(ref)
      return
    }
    const ids = editor.composition.value?.layers.map(l => l.offset) ?? []
    const next = new Set(selectedLayers.value)
    if (mode === 'range') {
      const anchor = ids.indexOf(selectionAnchor ?? ref.layerId), end = ids.indexOf(ref.layerId)
      next.clear()
      for (const id of ids.slice(Math.min(anchor < 0 ? end : anchor, end), Math.max(anchor, end) + 1)) next.add(id)
    } else {
      if (next.has(ref.layerId)) next.delete(ref.layerId)
      else next.add(ref.layerId)
      selectionAnchor = ref.layerId
    }
    const primary = next.has(ref.layerId) ? ref.layerId : [...next].at(-1)
    const anchor = selectionAnchor
    selectLayer(primary === undefined ? null : { ...ref, layerId: primary })
    selectionAnchor = anchor
    selectedLayers.value = next
  }

  function selectLayer(ref: LayerRef | null): void {
    selectedKeys.value = []
    if (!ref) {
      selectedLayers.value = new Set()
      selectionAnchor = null
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

    selectedLayers.value = new Set([ref.layerId])
    selectionAnchor = ref.layerId
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
    selectedKeys,
    selectedLayers,
    selectLayerGroup,
    enterComposition,
    navigation,
    goBack,
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
