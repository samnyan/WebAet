export interface GraphBounds { low: number; high: number }
/** Graph SVG maps the value range onto y=70..14; keep the pointer's value fixed. */
export function zoomGraph(bounds: GraphBounds, y: number, delta: number): GraphBounds {
  const span = bounds.high === bounds.low ? 56 : bounds.high - bounds.low
  const fraction = (70 - y) / 56
  const anchor = bounds.high === bounds.low ? bounds.low + (42 - y) : bounds.low + fraction * span
  const next = Math.max(1e-12, Math.min(1e30, span * Math.exp(Math.max(-2, Math.min(2, delta * 0.005)))))
  return { low: anchor - fraction * next, high: anchor + (1 - fraction) * next }
}
export function panGraph(bounds: GraphBounds, dy: number): GraphBounds {
  const shift = dy * (bounds.high === bounds.low ? 1 : (bounds.high - bounds.low) / 56)
  return { low: bounds.low + shift, high: bounds.high + shift }
}
