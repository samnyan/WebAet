import type { AetParser } from './parserTypes'
import type {
  AetDocument,
  Channel,
  Composition,
  Curve,
  Keyframe,
  Layer,
  LayerVideo,
  Scene,
  Video,
} from './types'

export const FGO_AET_MAGIC_LE = 0x41450103
export const FGO_AET_MAGIC_BE = 0x03014541

interface FgoRecord {
  index: number
  offset: number
  type: number // 0 = Scene, 1 = Asset
  parentIndex: number
  name: string
  color: number
  width: number
  height: number
  fps: number
  duration: number
  children: FgoChild[]
  sources: FgoSource[]
}

interface FgoSource {
  index: number
  offset: number
  name: string
  path: string
}

interface FgoChild {
  index: number
  offset: number
  name: string
  propertyName: string
  parentIndex: number
  flags: number
  kind: number // Points to Scene or Asset Record index
  opacity: number // LayerStartTime in seconds
  scale: number // LayerDuration in seconds
  position: number // LayerOffsetTime in seconds
  rotation: number // LayerTimeScale
  properties: FgoProperty[]
}

interface FgoProperty {
  name: string
  keyCount: number
  values: number[]
}

export class FgoAetParser implements AetParser {
  readonly name = 'FGO Arcade AET'

  canHandle(source: Uint8Array): boolean {
    if (source.length < 36) return false
    const view = new DataView(source.buffer, source.byteOffset, source.byteLength)
    const magic = view.getUint32(0, true)
    return magic === FGO_AET_MAGIC_LE || magic === FGO_AET_MAGIC_BE
  }

  parse(source: Uint8Array, name = 'untitled.bin'): AetDocument {
    const view = new DataView(source.buffer, source.byteOffset, source.byteLength)
    const magic = view.getUint32(0, true)
    const isBigEndian = magic === FGO_AET_MAGIC_BE

    const u32 = (p: number) => view.getUint32(p, !isBigEndian)
    const i32 = (p: number) => view.getInt32(p, !isBigEndian)
    const f32 = (p: number) => view.getFloat32(p, !isBigEndian)
    const u8 = (p: number) => view.getUint8(p)

    const relative = (fieldOffset: number, rel: number) => {
      if (rel === 0) return 0
      const target = fieldOffset + rel
      if (target < 0 || target >= source.length) {
        throw new Error(`Relative pointer 0x${target.toString(16)} out of range`)
      }
      return target
    }

    const stringAt = (offset: number) => {
      if (offset <= 0 || offset >= source.length) return ''
      let end = offset
      while (end < source.length && source[end] !== 0) end++
      return new TextDecoder('utf-8').decode(source.subarray(offset, end))
    }

    const count = u32(32)
    if (count > 100000) throw new Error('FGO AET record count unreasonable')

    const records: FgoRecord[] = []
    for (let i = 0; i < count; i++) {
      const slot = 36 + i * 4
      const recordOffset = relative(slot, i32(slot))
      const typeValue = u8(recordOffset)

      const rec: FgoRecord = {
        index: i,
        offset: recordOffset,
        type: typeValue,
        parentIndex: i32(recordOffset + 4),
        name: stringAt(relative(recordOffset + 8, i32(recordOffset + 8))),
        duration: f32(recordOffset + 28),
        fps: f32(recordOffset + 32) > 0 ? f32(recordOffset + 32) : 60,
        color: u32(recordOffset + 36),
        width: u32(recordOffset + 40),
        height: u32(recordOffset + 44),
        children: [],
        sources: [],
      }

      if (rec.type === 0) {
        // Scene / Composition
        const childCount = u32(recordOffset + 68)
        const childOffset = recordOffset + 72
        for (let j = 0; j < childCount; j++) {
          const cOffset = childOffset + j * 56
          const child: FgoChild = {
            index: j,
            offset: cOffset,
            name: stringAt(relative(cOffset, i32(cOffset))),
            propertyName: stringAt(relative(cOffset + 4, i32(cOffset + 4))),
            parentIndex: i32(cOffset + 20),
            flags: u32(cOffset + 12),
            kind: u32(cOffset + 24),
            opacity: f32(cOffset + 28),
            scale: f32(cOffset + 32),
            position: f32(cOffset + 36),
            rotation: f32(cOffset + 40),
            properties: [],
          }
          const nested = relative(cOffset + 52, i32(cOffset + 52))
          if (nested > 0 && nested < source.length - 48) {
            let cand = nested + 28
            while (cand < source.length - 8) {
              const relName = relative(cand, i32(cand))
              const propName = stringAt(relName)
              if (!propName || !propName.startsWith('ADBE ')) break

              const keyCount = u32(cand + 4)
              if (keyCount === 0 || keyCount > 10000) break
              const vals: number[] = []
              const valEnd = cand + 8 + keyCount * 16
              if (valEnd > source.length) break

              for (let p = cand + 8; p < valEnd; p += 4) {
                vals.push(f32(p))
              }
              child.properties.push({ name: propName, keyCount, values: vals })
              cand = valEnd + 8 // 8-byte trailer
            }
          }
          rec.children.push(child)
        }
      } else if (rec.type === 1) {
        // Asset / Video
        const sourceCount = u32(recordOffset + 52)
        const sourceOffset = recordOffset + 56
        for (let j = 0; j < sourceCount; j++) {
          const sOffset = sourceOffset + j * 16
          rec.sources.push({
            index: j,
            offset: sOffset,
            name: stringAt(relative(sOffset, i32(sOffset))),
            path: stringAt(relative(sOffset + 4, i32(sOffset + 4))),
          })
        }
      }

      records.push(rec)
    }

    const fps = 60
    const scenes: Scene[] = []
    const sceneRecords = records.filter((r) => r.type === 0)
    const assetRecords = records.filter((r) => r.type === 1)

    // Build unified videos from Asset records
    const videos: Video[] = assetRecords.map((asset) => {
      return {
        offset: asset.offset,
        color: [255, 255, 255, 255],
        width: asset.width || 1920,
        height: asset.height || 1080,
        frames: 1,
        sources: asset.sources.map((src) => ({
          offset: src.offset,
          name: src.path || src.name,
          id: src.index,
        })),
      }
    })

    // Helper to convert FGO property values to Curves
    const convertPropertyToCurve = (
      prop: FgoProperty | undefined,
      offset: number,
      defaultValue: number,
      isPercent = false,
    ): Curve => {
      if (!prop || !prop.values.length) {
        return {
          offset,
          keys: [{ frame: 0, value: defaultValue, tangent: 0 }],
        }
      }
      const vals = prop.values
      if (vals.length >= 4 && vals.length % 4 === 0) {
        const count = vals.length / 4
        const keys: Keyframe[] = []
        for (let i = 0; i < count; i++) {
          const f = vals[i * 4]! * fps
          let v = vals[i * 4 + 1]!
          let tan = vals[i * 4 + 3]! // outgoing tangent
          if (isPercent) {
            v *= 0.01
            tan *= 0.01
          }
          keys.push({ frame: Math.round(f * 1000) / 1000, value: v, tangent: tan })
        }
        return { offset, keys }
      }
      const single = vals[0]! * (isPercent ? 0.01 : 1)
      return { offset, keys: [{ frame: 0, value: single, tangent: 0 }] }
    }

    const compositions: Composition[] = sceneRecords.map((sRec) => {
      const layers: Layer[] = sRec.children.map((child) => {
        const target = records[child.kind]
        const isComp = target?.type === 0
        const isAsset = target?.type === 1

        const startSec = Number.isFinite(child.opacity) ? child.opacity : 0
        const durSec = Number.isFinite(child.scale) ? child.scale : 10
        const offsetSec = Number.isFinite(child.position) ? child.position : 0
        const speed =
          Number.isFinite(child.rotation) && Math.abs(child.rotation) > 1e-5 ? child.rotation : 1

        const findProp = (name: string) =>
          child.properties.find((p) => p.name.toLowerCase() === name.toLowerCase())

        const propCurve = (propName: string, fallback: number, isPercent = false): Curve => {
          return convertPropertyToCurve(findProp(propName), child.offset + 100, fallback, isPercent)
        }

        const curves2D: Record<Channel, Curve> = {
          anchorX: propCurve('ADBE Anchor Point_0', 0),
          anchorY: propCurve('ADBE Anchor Point_1', 0),
          positionX: propCurve('ADBE Position_0', 0),
          positionY: propCurve('ADBE Position_1', 0),
          rotation: propCurve('ADBE Rotate Z', 0),
          scaleX: propCurve('ADBE Scale_0', 1, true),
          scaleY: propCurve('ADBE Scale_1', 1, true),
          opacity: propCurve('ADBE Opacity', 1, true),
        }

        const curves3DRecord: Record<string, Curve> = {
          anchorZ: propCurve('ADBE Anchor Point_2', 0),
          positionZ: propCurve('ADBE Position_2', 0),
          directionX: propCurve('ADBE Orientation_0', 0),
          directionY: propCurve('ADBE Orientation_1', 0),
          directionZ: propCurve('ADBE Orientation_2', 0),
          rotationX: propCurve('ADBE Rotate X', 0),
          rotationY: propCurve('ADBE Rotate Y', 0),
          scaleZ: propCurve('ADBE Scale_2', 1, true),
        }

        const video: LayerVideo = {
          offset: child.offset + 1,
          blend: 0,
          transferFlags: 0,
          matte: 0,
          curves: curves2D,
          extra: curves3DRecord,
        }

        return {
          offset: child.offset,
          name: child.name || (target ? target.name : `Layer_${child.index}`),
          start: Math.round(startSec * fps),
          end: Math.round((startSec + durSec) * fps),
          timeOffset: Math.round(offsetSec * fps),
          timeScale: speed,
          flags: 1, // Visible
          quality: 0,
          itemType: isComp ? 3 : isAsset ? 1 : 0,
          item: target ? target.offset : 0,
          parent: 0,
          markers: [],
          video,
          audio: [],
        }
      })

      return {
        offset: sRec.offset,
        layers,
      }
    })

    // Single unified scene containing all compositions and asset videos
    const rootScene: Scene = {
      offset: sceneRecords[0]?.offset ?? 0,
      name: name.replace(/\.bin$/i, ''),
      start: 0,
      end: 3600,
      fps,
      color: [0, 0, 0, 255],
      width: sceneRecords[0]?.width || 1920,
      height: sceneRecords[0]?.height || 1080,
      camera: [],
      compositions,
      videos,
    }

    scenes.push(rootScene)

    return {
      name,
      source: source.slice(),
      scenes,
    }
  }
}
