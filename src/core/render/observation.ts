import { identity4, multiply4, type Matrix4 } from '../animation/transform3d'

/** Editor-only orbit around the scene centre. Never written to AET camera curves. */
export function observationMatrix(width: number, height: number, yaw: number, pitch: number): Matrix4 {
  const y = yaw * Math.PI / 180, x = pitch * Math.PI / 180
  const cy = Math.cos(y), sy = Math.sin(y), cx = Math.cos(x), sx = Math.sin(x)
  const ry = [cy, 0, -sy, 0, 0, 1, 0, 0, sy, 0, cy, 0, 0, 0, 0, 1]
  const rx = [1, 0, 0, 0, 0, cx, sx, 0, 0, -sx, cx, 0, 0, 0, 0, 1]
  const center = identity4(), back = identity4()
  center[12] = -width / 2; center[13] = -height / 2
  back[12] = width / 2; back[13] = height / 2
  return multiply4(back, multiply4(rx, multiply4(ry, center)))
}
export function projectPoint(m: Matrix4, x: number, y: number, z = 0) {
  return { x: m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, y: m[1]! * x + m[5]! * y + m[9]! * z + m[13]! }
}
export function drawSpatialGuides(ctx: CanvasRenderingContext2D, view: Matrix4, width: number, height: number, scale: number) {
  const corners = [[0, 0], [width, 0], [width, height], [0, height]] as const
  ctx.save(); ctx.lineWidth = 1 / scale; ctx.strokeStyle = '#8d99aa'
  ctx.beginPath()
  corners.forEach(([x, y], i) => { const p = projectPoint(view, x, y); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y) })
  ctx.closePath(); ctx.stroke()
  const origin = projectPoint(view, width / 2, height / 2), length = Math.min(width, height) * 0.2
  ctx.font = `${12 / scale}px sans-serif`; ctx.lineWidth = 2 / scale
  for (const [label, color, x, y, z] of [['X', '#f17979', length, 0, 0], ['Y', '#91d28a', 0, length, 0], ['Z', '#78aaff', 0, 0, length]] as const) {
    const end = projectPoint(view, width / 2 + x, height / 2 + y, z)
    ctx.strokeStyle = ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(origin.x, origin.y); ctx.lineTo(end.x, end.y); ctx.stroke(); ctx.fillText(label, end.x + 4 / scale, end.y - 4 / scale)
  }
  ctx.restore()
}
