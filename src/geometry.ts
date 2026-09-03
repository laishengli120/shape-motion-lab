export const GRID_WIDTH = 24
export const GRID_HEIGHT = 16

export type Point = {
  x: number
  y: number
}

export type Shape = {
  id: string
  name: string
  points: Point[]
  color: string
}

export type Transform =
  | { type: "translate"; dx: number; dy: number }
  | {
      type: "rotate"
      angle: number
      direction: "clockwise" | "counterclockwise"
      pivot: Point
    }
  | { type: "reflect"; axis: "horizontal" | "vertical"; offset: number }

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function snapPoint(point: Point): Point {
  return {
    x: clamp(Math.round(point.x), 0, GRID_WIDTH),
    y: clamp(Math.round(point.y), 0, GRID_HEIGHT),
  }
}

export function translatePoints(points: Point[], dx: number, dy: number): Point[] {
  return points.map((point) => ({ x: point.x + dx, y: point.y + dy }))
}

export function rotatePoint(point: Point, pivot: Point, angle: number, direction: "clockwise" | "counterclockwise"): Point {
  const radians = ((direction === "clockwise" ? angle : -angle) * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const dx = point.x - pivot.x
  const dy = point.y - pivot.y

  return {
    x: Math.round((pivot.x + dx * cos - dy * sin) * 100) / 100,
    y: Math.round((pivot.y + dx * sin + dy * cos) * 100) / 100,
  }
}

export function rotatePoints(points: Point[], pivot: Point, angle: number, direction: "clockwise" | "counterclockwise"): Point[] {
  return points.map((point) => rotatePoint(point, pivot, angle, direction))
}

export function reflectPoints(points: Point[], axis: "horizontal" | "vertical", offset: number): Point[] {
  return points.map((point) =>
    axis === "vertical"
      ? { x: Math.round((2 * offset - point.x) * 100) / 100, y: point.y }
      : { x: point.x, y: Math.round((2 * offset - point.y) * 100) / 100 },
  )
}

export function applyTransform(points: Point[], transform: Transform): Point[] {
  if (transform.type === "translate") {
    return translatePoints(points, transform.dx, transform.dy)
  }

  if (transform.type === "rotate") {
    return rotatePoints(points, transform.pivot, transform.angle, transform.direction)
  }

  return reflectPoints(points, transform.axis, transform.offset)
}

export function centerOfPoints(points: Point[]): Point {
  const firstPoint = points[0]
  const bounds = points.reduce(
    (result, point) => ({
      minX: Math.min(result.minX, point.x),
      maxX: Math.max(result.maxX, point.x),
      minY: Math.min(result.minY, point.y),
      maxY: Math.max(result.maxY, point.y),
    }),
    { minX: firstPoint.x, maxX: firstPoint.x, minY: firstPoint.y, maxY: firstPoint.y },
  )

  return {
    x: Math.round(((bounds.minX + bounds.maxX) / 2) * 2) / 2,
    y: Math.round(((bounds.minY + bounds.maxY) / 2) * 2) / 2,
  }
}

export function pointsToString(points: Point[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ")
}
