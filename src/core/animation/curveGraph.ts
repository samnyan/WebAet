import type { Curve } from '../aet/types'
import { sampleCurve, sampleCurveTangent } from './curves'

/** Exact Hermite-to-Bezier conversion, clipped in time before display mapping. */
export function curveGraph(curve: Curve | undefined, start: number, end: number, bounds?: { low: number; high: number }) {
  if (!curve?.keys.length || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null
  const times = [start, ...curve.keys.filter(k => k.frame > start && k.frame < end).map(k => k.frame), end]
  const segments = times.slice(1).map((b, i) => {
    const a = times[i]!, va = sampleCurve(curve, a), vb = sampleCurve(curve, b), dt = (b - a) / 3
    const clamped = curve.keys.length === 1 || b <= curve.keys[0]!.frame || a >= curve.keys.at(-1)!.frame
    return [{ frame: a, value: va }, { frame: a + dt, value: va + (clamped ? 0 : sampleCurveTangent(curve, a)) * dt }, { frame: b - dt, value: vb - (clamped ? 0 : sampleCurveTangent(curve, b)) * dt }, { frame: b, value: vb }]
  })
  // The Bezier control hull bounds the complete curve, including narrow overshoots.
  let low = Infinity, high = -Infinity
  for (const segment of segments) for (const p of segment) { low = Math.min(low, p.value); high = Math.max(high, p.value) }
  if (bounds) { low = bounds.low; high = bounds.high }
  const x = (f: number) => 12 + (f - start) / (end - start) * 576
  const y = (v: number) => high === low ? 42 : 70 - (v - low) / (high - low) * 56
  const xy = (p: { frame: number; value: number }) => `${x(p.frame)},${y(p.value)}`
  const path = `M${xy(segments[0]![0]!)}` + segments.map(s => `C${xy(s[1]!)} ${xy(s[2]!)} ${xy(s[3]!)}`).join(' ')
  return { low, high, path, keys: curve.keys.map((k, index) => ({ ...k, index })).filter(k => k.frame >= start && k.frame <= end).map(k => ({ index: k.index, x: x(k.frame), y: y(k.value), title: `${k.frame}f = ${k.value}` })) }
}
