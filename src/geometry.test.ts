import { describe, expect, it } from "vitest"
import { applyTransform, centerOfPoints, reflectPoints, rotatePoint, snapPoint, translatePoints, type Point } from "./geometry"

const triangle: Point[] = [
  { x: 2, y: 3 },
  { x: 4, y: 3 },
  { x: 3, y: 1 },
]

describe("geometry transformations", () => {
  it("translates points by grid cells", () => {
    expect(translatePoints(triangle, 3, -2)).toEqual([
      { x: 5, y: 1 },
      { x: 7, y: 1 },
      { x: 6, y: -1 },
    ])
  })

  it("rotates clockwise around a pivot", () => {
    expect(rotatePoint({ x: 3, y: 2 }, { x: 2, y: 2 }, 90, "clockwise")).toEqual({ x: 2, y: 3 })
    expect(rotatePoint({ x: 3, y: 2 }, { x: 2, y: 2 }, 90, "counterclockwise")).toEqual({ x: 2, y: 1 })
    expect(rotatePoint({ x: 3, y: 2 }, { x: 2, y: 2 }, 37.5, "clockwise")).toEqual({ x: 2.79, y: 2.61 })
    expect(rotatePoint({ x: 2, y: 2 }, { x: 2, y: 2 }, 37.5, "clockwise")).toEqual({ x: 2, y: 2 })
  })

  it("reflects across horizontal and vertical axes", () => {
    expect(reflectPoints([{ x: 3, y: 5 }], "vertical", 2)).toEqual([{ x: 1, y: 5 }])
    expect(reflectPoints([{ x: 3, y: 5 }], "horizontal", 2)).toEqual([{ x: 3, y: -1 }])
  })

  it("snaps and clamps points to the grid", () => {
    expect(snapPoint({ x: 2.6, y: 7.4 })).toEqual({ x: 3, y: 7 })
    expect(snapPoint({ x: -2, y: 99 })).toEqual({ x: 0, y: 16 })
  })

  it("applies a transform through the shared interface", () => {
    expect(applyTransform([{ x: 1, y: 1 }], { type: "translate", dx: 2, dy: 3 })).toEqual([{ x: 3, y: 4 }])
  })

  it("finds the center of shapes away from the canvas center", () => {
    expect(centerOfPoints([{ x: 2, y: 3 }, { x: 4, y: 7 }, { x: 3, y: 5 }])).toEqual({ x: 3, y: 5 })
  })
})
