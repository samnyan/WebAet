/** Conjugate local axis scaling through layer rotation and parent linear transform. */
export function axisScalePreview(
  parent: readonly number[],
  inverse: readonly number[],
  rotation: number,
  factor: number,
  axis: 'x' | 'y',
  x: number,
  y: number,
) {
  const c = Math.cos((rotation * Math.PI) / 180),
    s = Math.sin((rotation * Math.PI) / 180)
  const fx = axis === 'x' ? factor : 1,
    fy = axis === 'y' ? factor : 1
  const multiply = (a: readonly number[], b: readonly number[]) => [
    a[0]! * b[0]! + a[2]! * b[1]!,
    a[1]! * b[0]! + a[3]! * b[1]!,
    a[0]! * b[2]! + a[2]! * b[3]!,
    a[1]! * b[2]! + a[3]! * b[3]!,
  ]
  const linear = multiply(
    multiply(multiply(parent, [c, s, -s, c]), [fx * c, -fy * s, fx * s, fy * c]),
    inverse,
  )
  return {
    linear,
    dx: x - linear[0]! * x - linear[2]! * y,
    dy: y - linear[1]! * x - linear[3]! * y,
  }
}
