import { PointerEvent as ReactPointerEvent, useMemo, useRef, useState } from "react"
import {
  GRID_HEIGHT,
  GRID_WIDTH,
  applyTransform,
  clamp,
  pointsToString,
  snapPoint,
  type Point,
  type Shape,
  type Transform,
} from "./geometry"

type Operation = "translate" | "rotate" | "reflect"
type PointPickMode = "pivot" | "axis" | null

type EditorSnapshot = {
  operationBasePoints: Point[]
  operation: Operation
  transform: Transform
}

type TaskPreset = {
  id: string
  title: string
  detail: string
  emoji: string
  shape: Shape
  transform: Transform
}

const PRESETS: Shape[] = [
  {
    id: "triangle",
    name: "三角形",
    color: "#5b8def",
    points: [
      { x: 4, y: 11 },
      { x: 8, y: 5 },
      { x: 12, y: 11 },
    ],
  },
  {
    id: "square",
    name: "正方形",
    color: "#ff9c75",
    points: [
      { x: 4, y: 11 },
      { x: 4, y: 6 },
      { x: 9, y: 6 },
      { x: 9, y: 11 },
    ],
  },
  {
    id: "arrow",
    name: "小箭头",
    color: "#58c5ae",
    points: [
      { x: 4, y: 9 },
      { x: 8, y: 9 },
      { x: 8, y: 6 },
      { x: 13, y: 10 },
      { x: 8, y: 14 },
      { x: 8, y: 11 },
      { x: 4, y: 11 },
    ],
  },
  {
    id: "flag",
    name: "小旗",
    color: "#f6bd45",
    points: [
      { x: 5, y: 12 },
      { x: 5, y: 5 },
      { x: 12, y: 5 },
      { x: 9, y: 8 },
      { x: 12, y: 11 },
      { x: 5, y: 11 },
    ],
  },
  {
    id: "house",
    name: "小房子",
    color: "#ec7f9c",
    points: [
      { x: 4, y: 12 },
      { x: 4, y: 8 },
      { x: 8, y: 4 },
      { x: 12, y: 8 },
      { x: 12, y: 12 },
    ],
  },
]

const TASKS: TaskPreset[] = [
  {
    id: "flag-right",
    title: "小旗向右走 3 格",
    detail: "平移 · 向右 3 格",
    emoji: "🚩",
    shape: PRESETS[3],
    transform: { type: "translate", dx: 3, dy: 0 },
  },
  {
    id: "triangle-turn",
    title: "三角形转一转",
    detail: "绕 O 点顺时针 90°",
    emoji: "🔺",
    shape: PRESETS[0],
    transform: { type: "rotate", angle: 90, direction: "clockwise", pivot: { x: 8, y: 5 } },
  },
  {
    id: "house-mirror",
    title: "房子的镜子朋友",
    detail: "关于中间竖轴对称",
    emoji: "🏠",
    shape: PRESETS[4],
    transform: { type: "reflect", axis: "vertical", offset: GRID_WIDTH / 2 },
  },
]

const OPERATION_OPTIONS: { type: Operation; label: string; icon: string; helper: string }[] = [
  { type: "translate", label: "平移", icon: "↔", helper: "沿格子移动" },
  { type: "rotate", label: "旋转", icon: "↻", helper: "绕一点转动" },
  { type: "reflect", label: "轴对称", icon: "◐", helper: "照镜子变换" },
]

function createDefaultTransform(): Transform {
  return { type: "translate", dx: 0, dy: 0 }
}

function createOperationTransform(nextOperation: Operation, points: Point[]): Transform {
  if (nextOperation === "translate") {
    return { type: "translate", dx: 0, dy: 0 }
  }

  if (nextOperation === "rotate") {
    return { type: "rotate", angle: 0, direction: "clockwise", pivot: points[0] }
  }

  return { type: "reflect", axis: "vertical", offset: GRID_WIDTH / 2 }
}

function getCanvasPoint(svg: SVGSVGElement, clientX: number, clientY: number): Point {
  const point = svg.createSVGPoint()
  point.x = clientX
  point.y = clientY
  const inverse = svg.getScreenCTM()?.inverse()
  const localPoint = inverse ? point.matrixTransform(inverse) : { x: 0, y: 0 }
  return {
    x: clamp(localPoint.x, 0, GRID_WIDTH),
    y: clamp(localPoint.y, 0, GRID_HEIGHT),
  }
}

function getGridPoint(svg: SVGSVGElement, clientX: number, clientY: number): Point {
  return snapPoint(getCanvasPoint(svg, clientX, clientY))
}

function getFreeDelta(start: Point, current: Point): Point {
  return {
    x: Math.round(current.x - start.x),
    y: Math.round(current.y - start.y),
  }
}

function getSignedRotation(transform: Transform): number {
  if (transform.type !== "rotate") return 0
  return transform.direction === "clockwise" ? transform.angle : -transform.angle
}

function normalizeRadians(radians: number): number {
  return ((radians + Math.PI * 3) % (Math.PI * 2)) - Math.PI
}

function createRotationTransform(signedAngle: number, pivot: Point): Transform {
  return {
    type: "rotate",
    angle: Math.round(Math.abs(signedAngle) * 10) / 10,
    direction: signedAngle < 0 ? "counterclockwise" : "clockwise",
    pivot,
  }
}

function getShapeIcon(shape: Shape) {
  return (
    <svg className="shape-icon" viewBox="0 0 16 16" aria-hidden="true">
      <polygon points={shape.points.map((point) => `${point.x / 1.5},${point.y / 1.5}`).join(" ")} fill={shape.color} />
    </svg>
  )
}

function App() {
  const stageRef = useRef<SVGSVGElement | null>(null)
  const pointersRef = useRef(new Map<number, Point>())
  const gestureRef = useRef<
    | { type: "drag"; startPoint: Point; startTransform: Transform; startSnapshot: EditorSnapshot }
    | {
        type: "rotate"
        lastPointerAngle: number
        currentSignedAngle: number
        pivot: Point
        startSnapshot: EditorSnapshot
      }
    | null
  >(null)

  const [shape, setShape] = useState<Shape>(PRESETS[3])
  const [selectedShapeId, setSelectedShapeId] = useState(PRESETS[3].id)
  const [operation, setOperation] = useState<Operation>("translate")
  const [operationBasePoints, setOperationBasePoints] = useState<Point[]>(PRESETS[3].points)
  const [transform, setTransform] = useState<Transform>(createDefaultTransform())
  const [history, setHistory] = useState<EditorSnapshot[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawingPoints, setDrawingPoints] = useState<Point[]>([])
  const [pointPickMode, setPointPickMode] = useState<PointPickMode>(null)
  const [showTaskMenu, setShowTaskMenu] = useState(false)
  const [controlsCollapsed, setControlsCollapsed] = useState(false)
  const [showSymmetry, setShowSymmetry] = useState(true)
  const [notice, setNotice] = useState("点一点图形，或者试试右侧的变换按钮")

  const transformedPoints = useMemo(() => applyTransform(operationBasePoints, transform), [operationBasePoints, transform])
  const drawingMirrorPoints = useMemo(
    () => (operation === "reflect" && transform.type === "reflect" ? applyTransform(drawingPoints, transform) : []),
    [drawingPoints, operation, transform],
  )
  const hasOutOfBoundsPoint = transformedPoints.some(
    (point) => point.x < 0 || point.x > GRID_WIDTH || point.y < 0 || point.y > GRID_HEIGHT,
  )

  function getSnapshot(): EditorSnapshot {
    return { operationBasePoints, operation, transform }
  }

  function updateTransform(next: Transform, shouldRecord = true) {
    if (shouldRecord) {
      setHistory((items) => [...items, getSnapshot()])
    }
    setTransform(next)
  }

  function startOperation(nextOperation: Operation, shouldRecord = true) {
    if (nextOperation === operation) return
    const currentPoints = applyTransform(operationBasePoints, transform)
    if (shouldRecord) {
      setHistory((items) => [...items, getSnapshot()])
    }
    setOperationBasePoints(currentPoints)
    setOperation(nextOperation)
    setTransform(createOperationTransform(nextOperation, currentPoints))
    setPointPickMode(null)
  }

  function chooseShape(nextShape: Shape) {
    setShape(nextShape)
    setSelectedShapeId(nextShape.id)
    setIsDrawing(false)
    setDrawingPoints([])
    setOperationBasePoints(nextShape.points)
    setTransform(createDefaultTransform())
    setOperation("translate")
    setHistory([])
    setNotice(`已选中${nextShape.name}，拖动它试试看`)
  }

  function chooseOperation(nextOperation: Operation) {
    startOperation(nextOperation)
    if (nextOperation === "rotate" && nextOperation !== operation) {
      setNotice("旋转模式已开启：确认 O 点后，只能绕中心旋转图形")
    }
    if (nextOperation === "reflect" && nextOperation !== operation) {
      setNotice("轴对称模式已开启：中间是对称轴，在一侧画图即可")
    }
  }

  function startDrawing() {
    setIsDrawing(true)
    setDrawingPoints([])
    setPointPickMode(null)
    setNotice(operation === "reflect" ? "沿中间对称轴的一侧点格点，另一侧会显示镜像" : "在格点上依次点出图形，点回第一个点即可闭合")
  }

  function finishDrawing(points = drawingPoints) {
    if (points.length < 3) {
      setNotice("至少需要 3 个点，才能组成图形")
      return
    }

    const customShape: Shape = {
      id: "custom",
      name: "我的图形",
      color: "#8066d9",
      points,
    }
    setShape(customShape)
    setSelectedShapeId(customShape.id)
    setDrawingPoints(points)
    setIsDrawing(false)
    setOperationBasePoints(points)
    setTransform(createOperationTransform(operation, points))
    setHistory([])
    setNotice(operation === "reflect" ? "图形完成啦！另一侧已经显示对称图形" : "图形完成啦！拖动它，或选择一种变换方式")
  }

  function addDrawingPoint(point: Point) {
    if (drawingPoints.length > 2 && point.x === drawingPoints[0].x && point.y === drawingPoints[0].y) {
      finishDrawing()
      return
    }
    setDrawingPoints((points) => [...points, point])
  }

  function handleStagePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    const stage = stageRef.current
    if (!stage) return
    const point = getGridPoint(stage, event.clientX, event.clientY)

    if (isDrawing) {
      addDrawingPoint(point)
      return
    }

    if (pointPickMode === "pivot") {
      if (transform.type === "rotate") {
        updateTransform({ ...transform, pivot: point })
      }
      setPointPickMode(null)
      setNotice(`旋转中心已设为（${point.x}, ${point.y}），拖动图形即可旋转`)
      return
    }

    if (pointPickMode === "axis" && transform.type === "reflect") {
      const offset = transform.axis === "vertical" ? point.x : point.y
      updateTransform({ ...transform, offset })
      setPointPickMode(null)
      setNotice(`对称轴已设在第 ${offset} 格`)
    }
  }

  function handleShapePointerDown(event: ReactPointerEvent<SVGPolygonElement>) {
    event.stopPropagation()
    const stage = stageRef.current
    if (!stage || isDrawing) return
    const gridPoint = getGridPoint(stage, event.clientX, event.clientY)
    const canvasPoint = getCanvasPoint(stage, event.clientX, event.clientY)
    setSelectedShapeId(shape.id)

    if (pointPickMode === "pivot" && transform.type === "rotate") {
      updateTransform({ ...transform, pivot: gridPoint })
      setPointPickMode(null)
      setNotice(`旋转中心已设为（${gridPoint.x}, ${gridPoint.y}）`)
      return
    }

    if (pointPickMode === "axis" && transform.type === "reflect") {
      const offset = transform.axis === "vertical" ? gridPoint.x : gridPoint.y
      updateTransform({ ...transform, offset })
      setPointPickMode(null)
      setNotice(`对称轴已设在第 ${offset} 格`)
      return
    }

    if (operation === "reflect") {
      setNotice("轴对称模式下请在中间轴的一侧画图，图形不能直接拖动")
      return
    }

    pointersRef.current.set(event.pointerId, canvasPoint)
    event.currentTarget.setPointerCapture(event.pointerId)

    if (pointersRef.current.size === 1) {
      const startSnapshot = getSnapshot()

      if (operation === "rotate" && transform.type === "rotate") {
        gestureRef.current = {
          type: "rotate",
          lastPointerAngle: Math.atan2(canvasPoint.y - transform.pivot.y, canvasPoint.x - transform.pivot.x),
          currentSignedAngle: getSignedRotation(transform),
          pivot: transform.pivot,
          startSnapshot,
        }
        setNotice("绕着 O 点拖动，图形会旋转任意角度")
        return
      }

      if (operation !== "translate") {
        const currentPoints = applyTransform(operationBasePoints, transform)
        setOperationBasePoints(currentPoints)
        setOperation("translate")
        setTransform(createDefaultTransform())
      }
      gestureRef.current = {
        type: "drag",
        startPoint: gridPoint,
        startTransform: operation === "translate" ? transform : createDefaultTransform(),
        startSnapshot,
      }
    }
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const stage = stageRef.current
    if (!stage) return
    if (!pointersRef.current.has(event.pointerId)) return
    const currentGridPoint = getGridPoint(stage, event.clientX, event.clientY)
    const currentCanvasPoint = getCanvasPoint(stage, event.clientX, event.clientY)
    pointersRef.current.set(event.pointerId, currentCanvasPoint)
    const gesture = gestureRef.current
    if (!gesture) return

    if (gesture.type === "drag" && pointersRef.current.size === 1) {
      const delta = getFreeDelta(gesture.startPoint, currentGridPoint)
      const startTranslate = gesture.startTransform.type === "translate" ? gesture.startTransform : { dx: 0, dy: 0 }
      updateTransform(
        { type: "translate", dx: startTranslate.dx + delta.x, dy: startTranslate.dy + delta.y },
        false,
      )
    }

    if (gesture.type === "rotate" && pointersRef.current.size === 1) {
      const currentPointerAngle = Math.atan2(currentCanvasPoint.y - gesture.pivot.y, currentCanvasPoint.x - gesture.pivot.x)
      const angleStep = normalizeRadians(currentPointerAngle - gesture.lastPointerAngle)
      gesture.lastPointerAngle = currentPointerAngle
      gesture.currentSignedAngle += (angleStep * 180) / Math.PI
      updateTransform(createRotationTransform(gesture.currentSignedAngle, gesture.pivot), false)
    }
  }

  function handlePointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    if (!pointersRef.current.has(event.pointerId)) return
    pointersRef.current.delete(event.pointerId)
    const gesture = gestureRef.current

    if (gesture && pointersRef.current.size === 0) {
      setHistory((items) => [...items, gesture.startSnapshot])
    }

    if (pointersRef.current.size === 0) {
      gestureRef.current = null
    }
  }

  function handleUndo() {
    setHistory((items) => {
      const previous = items.at(-1)
      if (!previous) {
        setNotice("这里还没有可以撤销的步骤")
        return items
      }
      setOperationBasePoints(previous.operationBasePoints)
      setTransform(previous.transform)
      setOperation(previous.operation)
      setNotice("已撤销上一步变换")
      return items.slice(0, -1)
    })
  }

  function handleReset() {
    setOperationBasePoints(shape.points)
    setTransform(createDefaultTransform())
    setOperation("translate")
    setPointPickMode(null)
    setHistory([])
    setNotice("已经回到原来的位置")
  }

  function handleNewExercise() {
    setShape(PRESETS[3])
    setSelectedShapeId(PRESETS[3].id)
    setOperation("translate")
    setOperationBasePoints(PRESETS[3].points)
    setTransform(createDefaultTransform())
    setHistory([])
    setIsDrawing(false)
    setDrawingPoints([])
    setPointPickMode(null)
    setNotice("新练习开始！先挑一个你喜欢的图形吧")
  }

  function loadTask(task: TaskPreset) {
    setShape(task.shape)
    setSelectedShapeId(task.shape.id)
    setOperationBasePoints(task.shape.points)
    setTransform(task.transform)
    setOperation(task.transform.type)
    setHistory([])
    setIsDrawing(false)
    setDrawingPoints([])
    setPointPickMode(null)
    setShowTaskMenu(false)
    setNotice(`题目已准备好：${task.title}`)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div>
            <div className="brand-name">图形小实验室</div>
            <div className="brand-subtitle">让图形动起来，数学看得见</div>
          </div>
        </div>

        <div className="top-actions">
          <button className="button button-soft" onClick={() => setControlsCollapsed((value) => !value)} aria-expanded={!controlsCollapsed}>
            <span className="button-icon">☰</span>
            {controlsCollapsed ? "展开配置" : "收起配置"}
          </button>
          <div className="task-menu-wrap">
            <button className={`button button-soft ${showTaskMenu ? "is-active" : ""}`} onClick={() => setShowTaskMenu((value) => !value)}>
              <span className="button-icon">✦</span>
              预设题目
            </button>
            {showTaskMenu && (
              <div className="task-menu">
                <div className="menu-label">选一个小挑战</div>
                {TASKS.map((task) => (
                  <button className="task-menu-item" key={task.id} onClick={() => loadTask(task)}>
                    <span className="task-emoji">{task.emoji}</span>
                    <span>
                      <strong>{task.title}</strong>
                      <small>{task.detail}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="button button-plain" onClick={handleNewExercise}>新练习</button>
        </div>
      </header>

      <main className={`workspace ${controlsCollapsed ? "is-controls-collapsed" : ""}`}>
        <aside className="left-column">
          <section className="panel-card shapes-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">第一步</span>
                <h2>挑一个图形</h2>
              </div>
              <span className="heading-sticker">画</span>
            </div>
            <div className="shape-grid">
              {PRESETS.map((preset) => (
                <button
                  className={`shape-choice ${selectedShapeId === preset.id && !isDrawing ? "is-selected" : ""}`}
                  key={preset.id}
                  onClick={() => chooseShape(preset)}
                >
                  {getShapeIcon(preset)}
                  <span>{preset.name}</span>
                </button>
              ))}
            </div>
            <button className={`draw-choice ${isDrawing ? "is-selected" : ""}`} onClick={startDrawing}>
              <span className="draw-choice-icon">＋</span>
              <span>
                <strong>自己画一个</strong>
                <small>点按格点连成图形</small>
              </span>
              <span className="chevron">›</span>
            </button>
          </section>

        </aside>

        <section className="stage-card">
          <div className="stage-header">
            <div>
              <span className="eyebrow">第二步 · 在格子图上试一试</span>
              <h1>{isDrawing ? "画出你的图形" : `${shape.name}的运动轨迹`}</h1>
            </div>
            <div className={`stage-status ${hasOutOfBoundsPoint ? "is-warning" : ""}`}>
              <span className="status-dot" />
              {hasOutOfBoundsPoint ? "图形跑出格子啦" : "练习中"}
            </div>
          </div>

          <div className="stage-wrap">
            <svg
              ref={stageRef}
              className="grid-stage"
              viewBox={`0 0 ${GRID_WIDTH} ${GRID_HEIGHT}`}
              role="img"
              aria-label="图形运动格子图"
              onPointerDown={handleStagePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              <rect className="stage-background" x="0" y="0" width={GRID_WIDTH} height={GRID_HEIGHT} rx="0.4" />
              <g className="grid-lines" aria-hidden="true">
                {Array.from({ length: GRID_WIDTH + 1 }, (_, index) => (
                  <line key={`vertical-${index}`} x1={index} y1="0" x2={index} y2={GRID_HEIGHT} />
                ))}
                {Array.from({ length: GRID_HEIGHT + 1 }, (_, index) => (
                  <line key={`horizontal-${index}`} x1="0" y1={index} x2={GRID_WIDTH} y2={index} />
                ))}
              </g>
              <g className="grid-dots" aria-hidden="true">
                {Array.from({ length: GRID_WIDTH + 1 }, (_, x) =>
                  Array.from({ length: GRID_HEIGHT + 1 }, (_, y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="0.07" />),
                )}
              </g>
              <g className="axis-labels" aria-hidden="true">
                <text x="0.35" y="15.55">0</text>
                <text x="23.25" y="15.55">24</text>
                <text x="0.3" y="0.8">y</text>
                <text x="23.3" y="15.2">x</text>
              </g>

              {!isDrawing && (
                <>
                  <polygon className="original-shape" points={pointsToString(shape.points)} />
                  {(operation !== "reflect" || showSymmetry) && (
                    <polygon
                      className={`transformed-shape ${operation === "rotate" ? "is-rotating" : ""}`}
                      points={pointsToString(transformedPoints)}
                      fill={shape.color}
                      onPointerDown={handleShapePointerDown}
                    />
                  )}
                  {transform.type === "rotate" && (
                    <g className="pivot-marker">
                      <circle cx={transform.pivot.x} cy={transform.pivot.y} r="0.38" />
                    </g>
                  )}
                </>
              )}

              {transform.type === "reflect" && (
                <g className="reflect-axis">
                  {transform.axis === "vertical" ? (
                    <line x1={transform.offset} y1="0" x2={transform.offset} y2={GRID_HEIGHT} />
                  ) : (
                    <line x1="0" y1={transform.offset} x2={GRID_WIDTH} y2={transform.offset} />
                  )}
                  <text x={transform.axis === "vertical" ? transform.offset + 0.45 : 0.5} y={transform.axis === "vertical" ? 1 : transform.offset - 0.5}>对称轴</text>
                </g>
              )}

              {isDrawing && drawingPoints.length > 0 && (
                <>
                  <polyline className="drawing-line" points={pointsToString(drawingPoints)} />
                  {drawingPoints.length > 2 && <line className="drawing-line" x1={drawingPoints.at(-1)?.x} y1={drawingPoints.at(-1)?.y} x2={drawingPoints[0].x} y2={drawingPoints[0].y} opacity="0.28" />}
                  {drawingPoints.map((point, index) => (
                    <circle className={`drawing-point ${index === 0 ? "is-first" : ""}`} key={`${point.x}-${point.y}-${index}`} cx={point.x} cy={point.y} r="0.32" />
                  ))}
                  {showSymmetry && drawingMirrorPoints.length > 0 && (
                    <>
                      <polyline className="drawing-line drawing-mirror-line" points={pointsToString(drawingMirrorPoints)} />
                      {drawingMirrorPoints.length > 2 && <line className="drawing-line drawing-mirror-line" x1={drawingMirrorPoints.at(-1)?.x} y1={drawingMirrorPoints.at(-1)?.y} x2={drawingMirrorPoints[0].x} y2={drawingMirrorPoints[0].y} opacity="0.28" />}
                      {drawingMirrorPoints.map((point, index) => (
                        <circle className="drawing-point drawing-mirror-point" key={`mirror-${point.x}-${point.y}-${index}`} cx={point.x} cy={point.y} r="0.28" />
                      ))}
                    </>
                  )}
                </>
              )}
            </svg>
            {isDrawing && (
              <div className="drawing-hint">
                <span className="hint-icon">✦</span>
                点格点画线 · {drawingPoints.length} 个点
                {drawingPoints.length >= 3 && <button onClick={() => finishDrawing()}>完成图形</button>}
              </div>
            )}
          </div>

          <div className="stage-footer">
            <div className="legend">
              <span><i className="legend-dot original" />原图</span>
              <span><i className="legend-dot current" />变换后</span>
            </div>
            <div className="stage-tip">
              <span className="tip-bulb">☼</span>
              {notice}
            </div>
          </div>
        </section>

        <aside className="right-column">
          <section className="panel-card operation-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">第三步</span>
                <h2>让它动起来</h2>
              </div>
              <span className="motion-sticker">动</span>
            </div>
            <div className="operation-tabs">
              {OPERATION_OPTIONS.map((option) => (
                <button className={`operation-tab ${operation === option.type ? `is-${option.type}` : ""}`} key={option.type} onClick={() => chooseOperation(option.type)}>
                  <span className="operation-icon">{option.icon}</span>
                  <span>{option.label}</span>
                  <small>{option.helper}</small>
                </button>
              ))}
            </div>

            <div className="control-divider" />

            {operation === "translate" && transform.type === "translate" && (
              <div className="control-panel">
                <div className="control-title-row">
                  <div>
                    <h3>平移几格？</h3>
                    <p>拖动图形，或输入格数</p>
                  </div>
                  <span className="control-badge blue">↔</span>
                </div>
                <div className="number-controls">
                  <label>
                    <span>横向</span>
                    <div className="number-input-wrap"><input type="number" value={transform.dx} onChange={(event) => updateTransform({ ...transform, dx: Number(event.target.value) })} /><b>格</b></div>
                  </label>
                  <label>
                    <span>纵向</span>
                    <div className="number-input-wrap"><input type="number" value={transform.dy} onChange={(event) => updateTransform({ ...transform, dy: Number(event.target.value) })} /><b>格</b></div>
                  </label>
                </div>
                <div className="quick-move-grid">
                  <button onClick={() => updateTransform({ ...transform, dy: transform.dy - 1 })}>↑ 上 1</button>
                  <button onClick={() => updateTransform({ ...transform, dy: transform.dy + 1 })}>↓ 下 1</button>
                  <button onClick={() => updateTransform({ ...transform, dx: transform.dx - 1 })}>← 左 1</button>
                  <button onClick={() => updateTransform({ ...transform, dx: transform.dx + 1 })}>→ 右 1</button>
                </div>
              </div>
            )}

            {operation === "rotate" && transform.type === "rotate" && (
              <div className="control-panel">
                <div className="control-title-row">
                  <div>
                    <h3>转多少度？</h3>
                    <p>图形会绕 O 点旋转，不会被平移</p>
                  </div>
                  <span className="control-badge coral">↻</span>
                </div>
                <div className="angle-input-row">
                  <label htmlFor="rotation-angle">旋转角度</label>
                  <div className="number-input-wrap"><input id="rotation-angle" aria-label="旋转角度" type="number" min="0" step="0.1" value={transform.angle} onChange={(event) => updateTransform({ ...transform, angle: Math.max(0, Number(event.target.value)) })} /><b>°</b></div>
                </div>
                <input className="angle-slider" type="range" min="0" max="360" step="1" aria-label="旋转角度滑杆" value={Math.min(transform.angle, 360)} onChange={(event) => updateTransform({ ...transform, angle: Number(event.target.value) })} />
                <div className="choice-row">
                  {[90, 180, 270].map((angle) => (
                    <button className={Math.round(transform.angle) === angle ? "is-selected" : ""} key={angle} onClick={() => updateTransform({ ...transform, angle })}>{angle}°</button>
                  ))}
                </div>
                <div className="direction-row">
                  <button className={transform.direction === "clockwise" ? "is-selected" : ""} onClick={() => updateTransform({ ...transform, direction: "clockwise" })}>↻ 顺时针</button>
                  <button className={transform.direction === "counterclockwise" ? "is-selected" : ""} onClick={() => updateTransform({ ...transform, direction: "counterclockwise" })}>↺ 逆时针</button>
                </div>
                <button className={`pick-point-button ${pointPickMode === "pivot" ? "is-picking" : ""}`} onClick={() => setPointPickMode(pointPickMode === "pivot" ? null : "pivot")}>
                  <span>⊙</span>
                  {pointPickMode === "pivot" ? "请在格子图上点旋转中心" : `旋转中心（${transform.pivot.x}, ${transform.pivot.y}）`}
                </button>
              </div>
            )}

            {operation === "reflect" && transform.type === "reflect" && (
              <div className="control-panel">
                <div className="control-title-row">
                  <div>
                    <h3>选一面镜子</h3>
                    <p>对称轴固定在格子图正中间</p>
                  </div>
                  <span className="control-badge mint">◐</span>
                </div>
                <div className="direction-row">
                  <button className={transform.axis === "vertical" ? "is-selected" : ""} onClick={() => updateTransform({ ...transform, axis: "vertical", offset: GRID_WIDTH / 2 })}>↕ 中间竖轴</button>
                  <button className={transform.axis === "horizontal" ? "is-selected" : ""} onClick={() => updateTransform({ ...transform, axis: "horizontal", offset: GRID_HEIGHT / 2 })}>↔ 中间横轴</button>
                </div>
                <div className="axis-center-note">
                  <span className="axis-center-icon">{transform.axis === "vertical" ? "│" : "─"}</span>
                  {transform.axis === "vertical" ? "竖轴在第 12 格" : "横轴在第 8 格"}
                </div>
                <label className="symmetry-toggle">
                  <span>
                    <strong>显示对称图形</strong>
                    <small>关闭后只保留原图，方便观察轨迹</small>
                  </span>
                  <input type="checkbox" checked={showSymmetry} onChange={(event) => setShowSymmetry(event.target.checked)} />
                  <span className="toggle-track" aria-hidden="true"><span /></span>
                </label>
                <p className="reflect-help">在对称轴左/右或上/下的一侧画图，另一侧会同步出现镜像。</p>
              </div>
            )}

          </section>

          <div className="history-actions">
            <button className="button button-outline" onClick={handleUndo} disabled={history.length === 0}>↶ 撤销</button>
            <button className="button button-outline" onClick={handleReset}>回到原位</button>
          </div>

          <section className="tip-card">
            <div className="tip-card-icon">💡</div>
            <div>
              <strong>小提示</strong>
              <p>先观察原图顶点的位置，再数一数每个点移动了几格。</p>
            </div>
          </section>
        </aside>
      </main>

      <footer className="app-footer">
        <span><i className="footer-spark">✦</i> 图形会记住每一次变换</span>
        <span>格子图 · 24 × 16</span>
      </footer>
    </div>
  )
}

export default App
