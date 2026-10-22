import type { Matrix4 } from '../animation/transform3d'
export interface Perspective {
  x: number
  y: number
  distance: number
}
type Vertex = [number, number]
export function clipPerspective(m: Matrix4, vertices: Vertex[], camera: Perspective): Vertex[] {
  const depth = (v: Vertex) =>
    camera.distance - (m[2]! * v[0] + m[6]! * v[1] + m[14]!) - camera.distance * 0.01
  const result: Vertex[] = []
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i]!,
      b = vertices[(i + 1) % vertices.length]!,
      da = depth(a),
      db = depth(b)
    if (da >= 0) result.push(a)
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db)
      result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
  }
  return result
}
export function perspectivePoint(m: Matrix4, x: number, y: number, camera: Perspective) {
  const px = m[0]! * x + m[4]! * y + m[12]!,
    py = m[1]! * x + m[5]! * y + m[13]!
  const depth = camera.distance - (m[2]! * x + m[6]! * y + m[14]!)
  if (depth < camera.distance * 0.01 - 1e-8) return null
  const factor = camera.distance / depth
  return { x: camera.x + (px - camera.x) * factor, y: camera.y + (py - camera.y) * factor }
}
/** Subdivided affine triangles approximate a perspective textured plane on Canvas2D. */
export function drawPerspective(
  ctx: CanvasRenderingContext2D,
  image: HTMLCanvasElement,
  matrix: Matrix4,
  camera: Perspective,
  width: number,
  height: number,
) {
  // A plane parallel to the image plane has constant depth, so perspective is
  // exactly affine. One draw avoids triangle-edge alpha seams and 288 clips.
  if (Math.abs(matrix[2]! * width) + Math.abs(matrix[6]! * height) < 1e-8) {
    const p = perspectivePoint(matrix, 0, 0, camera),
      q = perspectivePoint(matrix, width, 0, camera),
      r = perspectivePoint(matrix, 0, height, camera)
    if (!p || !q || !r) return
    ctx.save()
    ctx.transform(
      (q.x - p.x) / width,
      (q.y - p.y) / width,
      (r.x - p.x) / height,
      (r.y - p.y) / height,
      p.x,
      p.y,
    )
    ctx.drawImage(image, 0, 0, width, height)
    ctx.restore()
    return
  }
  const steps = 12
  for (let y = 0; y < steps; y++)
    for (let x = 0; x < steps; x++) {
      const left = (x * width) / steps,
        right = ((x + 1) * width) / steps,
        top = (y * height) / steps,
        bottom = ((y + 1) * height) / steps
      for (const tri of [
        [
          [left, top],
          [right, top],
          [left, bottom],
        ],
        [
          [right, bottom],
          [left, bottom],
          [right, top],
        ],
      ]) {
        const polygon = clipPerspective(matrix, tri as Vertex[], camera)
        for (let i = 1; i + 1 < polygon.length; i++) {
          const a = polygon[0]!,
            b = polygon[i]!,
            c = polygon[i + 1]!
          const p = perspectivePoint(matrix, a[0]!, a[1]!, camera),
            q = perspectivePoint(matrix, b[0]!, b[1]!, camera),
            r = perspectivePoint(matrix, c[0]!, c[1]!, camera)
          if (!p || !q || !r) continue
          const ux = b[0]! - a[0]!,
            uy = b[1]! - a[1]!,
            vx = c[0]! - a[0]!,
            vy = c[1]! - a[1]!,
            det = ux * vy - uy * vx
          if (Math.abs(det) < 1e-12) continue
          const aa = ((q.x - p.x) * vy - (r.x - p.x) * uy) / det,
            bb = ((q.y - p.y) * vy - (r.y - p.y) * uy) / det
          const cc = ((r.x - p.x) * ux - (q.x - p.x) * vx) / det,
            dd = ((r.y - p.y) * ux - (q.y - p.y) * vx) / det
          ctx.save()
          ctx.beginPath()
          ctx.moveTo(p.x, p.y)
          ctx.lineTo(q.x, q.y)
          ctx.lineTo(r.x, r.y)
          ctx.closePath()
          ctx.clip()
          ctx.transform(
            aa,
            bb,
            cc,
            dd,
            p.x - aa * a[0]! - cc * a[1]!,
            p.y - bb * a[0]! - dd * a[1]!,
          )
          ctx.drawImage(image, 0, 0, width, height)
          ctx.restore()
        }
      }
    }
}
