export const lerp = (x: number, y: number, a: number) => x * (1 - a) + y * a

export const easeOutExpo = (x: number) => {
  return x === 1 ? 1 : 1 - Math.pow(2, -10 * x)
}

export const EaseOutCirc = (x: number) => {
  return Math.sqrt(1.0 - Math.pow(x - 1.0, 2.0))
}

export const UpDownCirc = (x: number) => {
  return Math.sin(EaseOutCirc(x) * Math.PI)
}

export const clamp = (x: number, a: number, b: number) => {
  return Math.min(Math.max(x, a), b)
}
