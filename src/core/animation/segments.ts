import type { Marker } from '../aet/types'
export interface AnimationSegment {
  id: string
  label: string
  start: number
  end: number
}
/** DIVA marker endpoints are inclusive frames; playback uses an exclusive upper bound. */
export function markerSegments(markers: readonly Marker[]): AnimationSegment[] {
  const result: AnimationSegment[] = []
  for (const start of markers) {
    if (!start.name.startsWith('st_')) continue
    const suffix = start.name.slice(3)
    const end = markers.find((m) => m.name === `ed_${suffix}` && m.frame >= start.frame)
    if (!end) continue
    result.push({
      id: `${start.offset}:${end.offset}`,
      label: `${suffix} · ${start.frame}–${end.frame} f`,
      start: start.frame,
      end: end.frame + 1,
    })
  }
  return result
}
