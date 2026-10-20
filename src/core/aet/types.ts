export const channels = ['anchorX', 'anchorY', 'positionX', 'positionY', 'rotation', 'scaleX', 'scaleY', 'opacity'] as const
export const channels3D = ['anchorZ', 'positionZ', 'directionX', 'directionY', 'directionZ', 'rotationX', 'rotationY', 'scaleZ'] as const
export type Channel = typeof channels[number]
export type EditableChannel = Channel | typeof channels3D[number]
export function videoCurve(video: LayerVideo | null | undefined, channel: EditableChannel): Curve | undefined {
  return video ? (video.curves as Partial<Record<EditableChannel, Curve>>)[channel] ?? video.extra?.[channel] : undefined
}
export interface Keyframe { frame: number; value: number; tangent: number }
export interface Curve { offset: number; keys: Keyframe[] }
export interface LayerVideo {
  offset: number; blend: number; transferFlags: number; matte: number
  curves: Record<Channel, Curve>; extra: Record<string, Curve> | null
}
export interface Marker { offset: number; frame: number; name: string }
export interface Layer {
  /** Editor-only raw record provenance for independent duplicates. */
  originalRecord?: number
  offset: number; name: string; start: number; end: number; timeOffset: number; timeScale: number
  flags: number; quality: number; itemType: number; item: number; parent: number
  markers: Marker[]; video: LayerVideo | null; audio: Curve[]
}
export interface Composition { offset: number; layers: Layer[] }
export interface VideoSource { offset: number; name: string; id: number }
export interface Video {
  offset: number; color: number[]; width: number; height: number; frames: number; sources: VideoSource[]
}
export interface Scene {
  offset: number; name: string; start: number; end: number; fps: number; color: number[]
  width: number; height: number; compositions: Composition[]; videos: Video[]; camera: Curve[]
}
export interface AetDocument { name: string; source: Uint8Array; scenes: Scene[] }
