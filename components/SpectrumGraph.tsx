'use client'

import React, { useRef, useEffect, useState, useCallback } from 'react'
import {
  ZoomIn, ZoomOut, RotateCcw, Move, MousePointer2,
  Download, FileSpreadsheet, Maximize2, Share2
} from 'lucide-react'
import { Peak, TooltipData, SpectrumViewport } from '@/types/spectroscopy'

const PADDING = { top: 40, right: 60, bottom: 80, left: 80 }

interface SpectrumData {
  type: 'uv-vis' | 'ir' | 'nmr'
  sampleName: string
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  xLabel: string
  yLabel: string
  xInverted?: boolean
  peaks: Peak[]
}

interface SpectrumGraphProps {
  spectrum: SpectrumData
  comparisonSpectrum?: SpectrumData | null
  onPeakSelected?: (peak: Peak | null) => void
  selectedPeakId?: string
}

export default function SpectrumGraph({
  spectrum,
  comparisonSpectrum,
  onPeakSelected,
  selectedPeakId,
}: SpectrumGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)
  const [cursorMode, setCursorMode] = useState<'select' | 'pan'>('select')
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  const [viewport, setViewport] = useState<SpectrumViewport>({
    xMin: spectrum.xMin,
    xMax: spectrum.xMax,
    yMin: spectrum.yMin,
    yMax: spectrum.yMax,
    zoom: 1,
  })

  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)

  // --- Helper Functions ---

  const getGraphCoordinates = useCallback((width: number, height: number) => {
    const graphWidth = width - PADDING.left - PADDING.right
    const graphHeight = height - PADDING.top - PADDING.bottom
    return { graphWidth, graphHeight }
  }, [])

  // Responsive Canvas Sizing
  useEffect(() => {
    if (!containerRef.current) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        // Only update if dimensions actually changed to prevent loops
        setDimensions(prev => {
          if (Math.abs(prev.width - width) > 1 || Math.abs(prev.height - height) > 1) {
            return { width, height }
          }
          return prev
        })
      }
    })

    resizeObserver.observe(containerRef.current)
    return () => resizeObserver.disconnect()
  }, [])

  // Update viewport when spectrum changes
  useEffect(() => {
    // Calculate max Y from actual peaks to ensure they fit
    const maxPeakY = spectrum.peaks.length > 0
      ? Math.max(...spectrum.peaks.map(p => p.y))
      : spectrum.yMax

    // Consider comparison spectrum if present
    const maxComparisonY = comparisonSpectrum?.peaks?.length
      ? Math.max(...comparisonSpectrum.peaks.map(p => p.y))
      : 0

    // Always start Y axis at 0 or lower to show baseline, especially for small values
    const effectiveMinY = Math.min(0, spectrum.yMin)
    const effectiveMaxY = Math.max(maxPeakY, maxComparisonY, spectrum.yMax * 0.5)

    const rangeY = effectiveMaxY - effectiveMinY

    setViewport({
      xMin: spectrum.xMin,
      xMax: spectrum.xMax,
      yMin: effectiveMinY,
      yMax: effectiveMinY + rangeY * 1.2, // Add 20% padding to top
      zoom: 1,
    })
  }, [spectrum, comparisonSpectrum])

  // Find nearest peak
  const findNearestPeak = useCallback(
    (canvasX: number, canvasY: number): Peak | null => {
      if (!canvasRef.current || dimensions.width === 0) return null

      const { graphWidth, graphHeight } = getGraphCoordinates(dimensions.width, dimensions.height)

      // Canvas relative coords
      const rect = canvasRef.current.getBoundingClientRect()
      const x = canvasX - rect.left
      const y = canvasY - rect.top

      let nearest: Peak | null = null
      let minDistance = 30 // pixel threshold

      spectrum.peaks.forEach((peak) => {
        // Calculate Peak Canvas Position
        const peakCanvasX = PADDING.left + ((peak.x - viewport.xMin) / (viewport.xMax - viewport.xMin)) * graphWidth
        const peakCanvasY = PADDING.top + ((viewport.yMax - peak.y) / (viewport.yMax - viewport.yMin)) * graphHeight

        // Euclidean distance
        const distance = Math.sqrt(Math.pow(x - peakCanvasX, 2) + Math.pow(y - peakCanvasY, 2))

        if (distance < minDistance) {
          minDistance = distance
          nearest = peak
        }
      })

      return nearest
    },
    [spectrum.peaks, viewport, dimensions, getGraphCoordinates]
  )

  // --- Interaction Handlers ---

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current || dimensions.width === 0) return

      const canvas = canvasRef.current
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      const { graphWidth, graphHeight } = getGraphCoordinates(dimensions.width, dimensions.height)

      // Pan Logic
      if (cursorMode === 'pan' && isDragging && dragStart) {
        const deltaX = (e.clientX - dragStart.x) / graphWidth
        const deltaY = (e.clientY - dragStart.y) / graphHeight

        const xRange = viewport.xMax - viewport.xMin
        const yRange = viewport.yMax - viewport.yMin

        setViewport((prev) => ({
          ...prev,
          xMin: prev.xMin - deltaX * xRange,
          xMax: prev.xMax - deltaX * xRange,
          // Constrain Y panning to reasonable bounds (don't pan way below 0)
          yMin: Math.max(spectrum.yMin * -0.5, prev.yMin + deltaY * yRange),
          yMax: Math.max(spectrum.yMax * 0.1, prev.yMax + deltaY * yRange),
        }))

        setDragStart({ x: e.clientX, y: e.clientY })
        return
      }

      // Tooltip Logic
      if (!isDragging) {
        const isInGraph = x >= PADDING.left && x <= dimensions.width - PADDING.right && y >= PADDING.top && y <= dimensions.height - PADDING.bottom

        if (isInGraph) {
          const peak = findNearestPeak(e.clientX, e.clientY)
          const dataX = viewport.xMin + ((x - PADDING.left) / graphWidth) * (viewport.xMax - viewport.xMin)
          const dataY = viewport.yMax - ((y - PADDING.top) / graphHeight) * (viewport.yMax - viewport.yMin)

          // Smart tooltip positioning
          const isRightSide = x > dimensions.width / 2
          const tooltipX = isRightSide ? x - 220 : x + 20

          // Determine vertical placement to avoid overlapping peak
          // If peak is too high (y is small), place tooltip below
          const isTopTight = y < 150
          const placement = isTopTight ? 'bottom' : 'top'
          const tooltipY = isTopTight ? y + 20 : y - 20

          if (peak) {
            setTooltip({
              x: tooltipX,
              y: tooltipY,
              xValue: peak.x,
              yValue: peak.y,
              peakLabel: peak.label,
              interpretation: peak.interpretation,
              visible: true,
              placement
            })
          } else {
            setTooltip({
              x: tooltipX,
              y: tooltipY,
              xValue: dataX,
              yValue: dataY,
              peakLabel: '',
              interpretation: '',
              visible: true,
              placement
            })
          }
        } else {
          setTooltip(null)
        }
      }
    },
    [viewport, isDragging, dragStart, findNearestPeak, cursorMode, dimensions, spectrum.yMin, spectrum.yMax, getGraphCoordinates]
  )

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (cursorMode === 'pan') {
      setIsDragging(true)
      setDragStart({ x: e.clientX, y: e.clientY })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
    setDragStart(null)
  }

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (cursorMode === 'select') {
      const peak = findNearestPeak(e.clientX, e.clientY)
      if (peak) onPeakSelected?.(peak)
    }
  }

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    if (!canvasRef.current || dimensions.width === 0) return

    const rect = canvasRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const { graphWidth, graphHeight } = getGraphCoordinates(dimensions.width, dimensions.height)

    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9
    // Clamp zoom level
    const newZoom = Math.max(0.5, Math.min(20, viewport.zoom * (e.deltaY > 0 ? 0.9 : 1.1)))

    if (Math.abs(newZoom - viewport.zoom) < 0.01) return

    // Center of zoom
    const zoomCenterX = viewport.xMin + ((x - PADDING.left) / graphWidth) * (viewport.xMax - viewport.xMin)
    const zoomCenterY = viewport.yMax - ((y - PADDING.top) / graphHeight) * (viewport.yMax - viewport.yMin)

    // New ranges
    const currentXRange = viewport.xMax - viewport.xMin
    const currentYRange = viewport.yMax - viewport.yMin
    const newXRange = currentXRange * (e.deltaY > 0 ? 1.1 : 0.9)
    const newYRange = currentYRange * (e.deltaY > 0 ? 1.1 : 0.9)

    // Calculate new bounds ensuring zoom center remains fixed
    const xRatio = (x - PADDING.left) / graphWidth
    const yRatio = (y - PADDING.top) / graphHeight

    setViewport({
      xMin: zoomCenterX - newXRange * xRatio,
      xMax: zoomCenterX + newXRange * (1 - xRatio),
      yMin: Math.max(spectrum.yMin * -0.2, zoomCenterY - newYRange * (1 - yRatio)),
      yMax: zoomCenterY + newYRange * yRatio,
      zoom: newZoom
    })
  }

  // --- Export Functions ---
  const handleExportImage = () => {
    if (!canvasRef.current) return
    const link = document.createElement('a')
    link.download = `${spectrum.sampleName}_spectrum.png`
    link.href = canvasRef.current.toDataURL('image/png')
    link.click()
  }

  const handleExportData = () => {
    const headers = ['ID', spectrum.xLabel, spectrum.yLabel, 'Label', 'Interpretation']
    const rows = spectrum.peaks.map(p => [
      p.id, p.x.toFixed(2), p.y.toFixed(2), `"${p.label}"`, `"${p.interpretation}"`
    ])
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${spectrum.sampleName}_peaks.csv`
    link.click()
  }

  // --- Rendering ---

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || dimensions.width === 0 || dimensions.height === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas internal dimensions to match display dimensions for sharpness
    // You could also handle pixel ratio here for Retina displays
    canvas.width = dimensions.width
    canvas.height = dimensions.height

    const width = dimensions.width
    const height = dimensions.height
    const { graphWidth, graphHeight } = getGraphCoordinates(width, height)

    // 1. Background
    ctx.fillStyle = '#1e293b' // Darker slate
    ctx.fillRect(0, 0, width, height)

    // 2. Grid Lines
    ctx.strokeStyle = '#334155'
    ctx.lineWidth = 1
    ctx.globalAlpha = 0.2

    // Vertical Grid
    const xStep = (viewport.xMax - viewport.xMin) / 10
    for (let i = 0; i <= 10; i++) {
      const xVal = viewport.xMin + i * xStep
      const x = PADDING.left + ((xVal - viewport.xMin) / (viewport.xMax - viewport.xMin)) * graphWidth
      if (x >= PADDING.left && x <= width - PADDING.right) {
        ctx.beginPath()
        ctx.moveTo(x, PADDING.top)
        ctx.lineTo(x, height - PADDING.bottom)
        ctx.stroke()
      }
    }

    // Horizontal Grid
    const yStep = (viewport.yMax - viewport.yMin) / 8
    for (let i = 0; i <= 8; i++) {
      const yVal = viewport.yMin + i * yStep
      const y = PADDING.top + ((viewport.yMax - yVal) / (viewport.yMax - viewport.yMin)) * graphHeight
      if (y >= PADDING.top && y <= height - PADDING.bottom) {
        ctx.beginPath()
        ctx.moveTo(PADDING.left, y)
        ctx.lineTo(width - PADDING.right, y)
        ctx.stroke()
      }
    }

    ctx.globalAlpha = 1

    // 4. Spectrum Rendering (Continuous)
    const drawSpectrum = (peaks: Peak[], color: string, isDashed = false) => {
      if (peaks.length === 0) return

      const sortedPeaks = [...peaks].sort((a, b) => a.x - b.x)
      const points: { x: number, y: number }[] = []

      // Resolution: calculate points every 2 pixels
      for (let px = PADDING.left; px <= width - PADDING.right; px += 2) {
        const dataX = viewport.xMin + ((px - PADDING.left) / graphWidth) * (viewport.xMax - viewport.xMin)

        let totalIntensity = 0
        // Sum Lorentzian contributions
        // Optimization: Only consider peaks close to dataX
        // Peak width (Gamma) roughly 1-2% of full range
        const gamma = (spectrum.xMax - spectrum.xMin) * 0.015

        for (const peak of sortedPeaks) {
          if (Math.abs(dataX - peak.x) > gamma * 6) continue // Optimization
          const contribution = peak.y * (Math.pow(gamma, 2) / (Math.pow(dataX - peak.x, 2) + Math.pow(gamma, 2)))
          totalIntensity += contribution
        }

        // Constrain Y
        const dataY = Math.max(0, totalIntensity)
        const py = PADDING.top + ((viewport.yMax - dataY) / (viewport.yMax - viewport.yMin)) * graphHeight
        points.push({ x: px, y: py })
      }

      if (points.length > 0) {
        ctx.save()
        ctx.strokeStyle = color
        ctx.lineWidth = 2.5
        if (isDashed) ctx.setLineDash([5, 5])

        ctx.beginPath()
        ctx.moveTo(points[0].x, height - PADDING.bottom) // Start at baseline
        points.forEach(p => ctx.lineTo(p.x, Math.min(p.y, height - PADDING.bottom))) // Clip to baseline
        ctx.stroke()

        // Fill (Only for primary)
        if (!isDashed) {
          ctx.lineTo(points[points.length - 1].x, height - PADDING.bottom)
          ctx.closePath()
          const gradient = ctx.createLinearGradient(0, PADDING.top, 0, height - PADDING.bottom)
          gradient.addColorStop(0, color.replace(')', ', 0.4)').replace('rgb', 'rgba'))
          gradient.addColorStop(1, color.replace(')', ', 0.05)').replace('rgb', 'rgba'))
          ctx.fillStyle = gradient
          ctx.fill()
        }
        ctx.restore()
      }
    }

    // Draw Comparison First (Behind)
    if (comparisonSpectrum) {
      drawSpectrum(comparisonSpectrum.peaks, 'rgb(245, 158, 11)', true)
    }
    // Draw Primary
    drawSpectrum(spectrum.peaks, 'rgb(59, 130, 246)', false)

    // 5. Axes (Draw ON TOP of spectrum to ensure visibility)
    // Use pixel snapping for sharp lines
    ctx.save()
    ctx.strokeStyle = '#ffffff' // Pure white for maximum visibility
    ctx.lineWidth = 3 // Increased width for visibility
    ctx.lineCap = 'square'

    ctx.beginPath()
    // Y Axis
    const xAxisY = Math.floor(height - PADDING.bottom) + 0.5
    const yAxisX = Math.floor(PADDING.left) + 0.5

    ctx.moveTo(yAxisX, PADDING.top)
    ctx.lineTo(yAxisX, xAxisY)
    ctx.stroke()

    // X Axis (Draw separately to ensure it renders)
    ctx.beginPath()
    ctx.moveTo(yAxisX, xAxisY)
    ctx.lineTo(width - PADDING.right, xAxisY)
    ctx.stroke()
    ctx.restore()

    // 6. Labels & Titles (Draw here to ensure they are on top)
    ctx.save()
    ctx.fillStyle = '#e2e8f0' // Lighter text
    ctx.font = '12px Inter, sans-serif'

    // Helper for decimals
    const getDecimals = (min: number, max: number, ticks: number) => {
      const range = Math.abs(max - min)
      const step = range / ticks
      if (step === 0) return 1
      if (step < 0.001) return 4
      if (step < 0.1) return 3
      if (step < 1) return 2
      if (step < 10) return 1
      return 0
    }

    // X Axis Labels & Ticks
    const xTicks = 8
    const xDecimals = getDecimals(viewport.xMin, viewport.xMax, xTicks)
    const xAxisYPos = height - PADDING.bottom

    ctx.textAlign = 'center'
    ctx.textBaseline = 'top' // Align text below the point

    for (let i = 0; i <= xTicks; i++) {
      const val = viewport.xMin + i * (viewport.xMax - viewport.xMin) / xTicks
      const x = PADDING.left + i * graphWidth / xTicks

      // Draw Tick
      ctx.beginPath()
      ctx.moveTo(x, xAxisYPos)
      ctx.lineTo(x, xAxisYPos + 6) // 6px tick length
      ctx.strokeStyle = '#e2e8f0'
      ctx.lineWidth = 1
      ctx.stroke()

      // Draw Label
      ctx.fillText(val.toFixed(xDecimals), x, xAxisYPos + 10)
    }

    // X Axis Title
    ctx.font = 'bold 14px Inter, sans-serif'
    ctx.fillStyle = '#f8fafc' // Almost white
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillText(spectrum.xLabel, PADDING.left + graphWidth / 2, height - 10)

    // Y Axis Labels & Ticks
    const yTicks = 6
    const yDecimals = getDecimals(viewport.yMin, viewport.yMax, yTicks)
    const yAxisXPos = PADDING.left

    ctx.font = '12px Inter, sans-serif'
    ctx.fillStyle = '#e2e8f0' // Lighter text
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'

    for (let i = 0; i <= yTicks; i++) {
      const val = viewport.yMin + i * (viewport.yMax - viewport.yMin) / yTicks
      const y = height - PADDING.bottom - i * graphHeight / yTicks

      // Draw Tick
      ctx.beginPath()
      ctx.moveTo(yAxisXPos, y)
      ctx.lineTo(yAxisXPos - 6, y) // 6px tick length pointing left
      ctx.strokeStyle = '#e2e8f0'
      ctx.lineWidth = 1
      ctx.stroke()

      // Ensure 0 is exactly 0 to avoid -0.00
      const displayVal = Math.abs(val) < 1e-10 ? 0 : val
      ctx.fillText(displayVal.toFixed(yDecimals), yAxisXPos - 10, y)
    }

    // Y Axis Title
    ctx.save()
    ctx.translate(25, PADDING.top + graphHeight / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.font = 'bold 14px Inter, sans-serif'
    ctx.fillStyle = '#f8fafc' // Almost white
    ctx.fillText(spectrum.yLabel, 0, 0)
    ctx.restore()

    ctx.restore() // Restore original state

    // Draw Zero Line if strictly inside graph (not at bottom)
    if (viewport.yMin < 0 && viewport.yMax > 0) {
      const yZero = PADDING.top + ((viewport.yMax - 0) / (viewport.yMax - viewport.yMin)) * graphHeight
      if (Math.abs(yZero - (height - PADDING.bottom)) > 2) { // Only if distinct from bottom axis
        ctx.save()
        ctx.beginPath()
        ctx.moveTo(PADDING.left, yZero)
        ctx.lineTo(width - PADDING.right, yZero)
        ctx.strokeStyle = '#64748b' // Slate-500
        ctx.lineWidth = 1
        ctx.setLineDash([4, 4])
        ctx.stroke()
        ctx.restore()
      }
    }

    // 7. Peak Markers (On top)
    spectrum.peaks.forEach(peak => {
      const px = PADDING.left + ((peak.x - viewport.xMin) / (viewport.xMax - viewport.xMin)) * graphWidth
      const py = PADDING.top + ((viewport.yMax - peak.y) / (viewport.yMax - viewport.yMin)) * graphHeight

      // Only draw if visible
      if (px >= PADDING.left && px <= width - PADDING.right && py >= PADDING.top && py <= height - PADDING.bottom) {
        const isSelected = peak.id === selectedPeakId

        // Marker line
        ctx.beginPath()
        ctx.moveTo(px, height - PADDING.bottom)
        ctx.lineTo(px, py)
        ctx.strokeStyle = isSelected ? '#ec4899' : 'rgba(59, 130, 246, 0.3)'
        ctx.lineWidth = 1
        ctx.stroke()

        // Marker head
        ctx.beginPath()
        ctx.arc(px, py, isSelected ? 6 : 4, 0, Math.PI * 2)
        ctx.fillStyle = isSelected ? '#ec4899' : '#3b82f6'
        ctx.fill()

        // Label (if selected or high intensity)
        if (isSelected || peak.y > spectrum.yMax * 0.8) {
          ctx.fillStyle = '#e2e8f0'
          ctx.font = '11px Inter, sans-serif'
          ctx.textAlign = 'center'
          // Prioritize label if available, otherwise use X value
          ctx.fillText(peak.label || peak.x.toFixed(1), px, py - 10)
        }
      }
    })

  }, [spectrum, comparisonSpectrum, viewport, selectedPeakId, dimensions, getGraphCoordinates])

  // Reset handler
  const handleResetZoom = () => {
    const maxPeakY = spectrum.peaks.length > 0
      ? Math.max(...spectrum.peaks.map(p => p.y))
      : spectrum.yMax
    const maxComparisonY = comparisonSpectrum?.peaks?.length
      ? Math.max(...comparisonSpectrum.peaks.map(p => p.y))
      : 0

    const effectiveMinY = Math.min(0, spectrum.yMin)
    const effectiveMaxY = Math.max(maxPeakY, maxComparisonY, spectrum.yMax * 0.5)
    const rangeY = effectiveMaxY - effectiveMinY

    setViewport({
      xMin: spectrum.xMin,
      xMax: spectrum.xMax,
      yMin: effectiveMinY,
      yMax: effectiveMinY + rangeY * 1.2,
      zoom: 1,
    })
  }

  return (
    <div className="flex flex-col h-full w-full space-y-2">
      {/* Graph Container - Flex grow to fill available space */}
      <div ref={containerRef} className="relative flex-grow min-h-[300px] max-h-[500px] w-full bg-slate-900 rounded-xl border border-slate-700 overflow-hidden shadow-inner">

        {dimensions.width > 0 && (
          <canvas
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => { handleMouseUp(); setTooltip(null); }}
            onClick={handleClick}
            onWheel={handleWheel}
            className={`block w-full h-full touch-none ${cursorMode === 'pan' ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-crosshair'}`}
          />
        )}

        {/* Tooltip Overlay */}
        {tooltip && tooltip.visible && (
          <div
            className="absolute z-50 pointer-events-none bg-slate-800/90 border border-slate-600 text-slate-100 px-3 py-2 rounded-lg shadow-xl text-xs backdrop-blur-md transition-opacity duration-75"
            style={{
              left: tooltip.x,
              top: tooltip.y,
              transform: tooltip.placement === 'bottom' ? 'translate(0, 0)' : 'translate(0, -100%)'
            }}
          >
            <div className="font-bold mb-1 text-blue-400">{tooltip.peakLabel || 'Point Info'}</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <span className="text-slate-400">{spectrum.xLabel}:</span>
              <span className="font-mono">{tooltip.xValue.toFixed(2)}</span>
              <span className="text-slate-400">{spectrum.yLabel}:</span>
              <span className="font-mono">{tooltip.yValue.toFixed(2)}</span>
            </div>
            {tooltip.interpretation && (
              <div className="mt-2 pt-2 border-t border-slate-600/50 text-slate-300 italic">
                {tooltip.interpretation}
              </div>
            )}
          </div>
        )}

        {/* Loading / Empty State */}
        {spectrum.peaks.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500 pointer-events-none">
            <div className="text-center">
              <p className="text-lg font-semibold">No Data Available</p>
              <p className="text-sm">Spectrum contains no peaks</p>
            </div>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-nowrap items-center justify-between gap-2 p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm overflow-x-auto">

        {/* Left Controls: Cursor & Legend */}
        <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
          <div className="flex bg-slate-100 dark:bg-slate-700 rounded-lg p-1 border border-slate-200 dark:border-slate-600">
            <button
              onClick={() => setCursorMode('select')}
              className={`p-1.5 rounded-md transition-all ${cursorMode === 'select' ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
              title="Select Mode"
            >
              <MousePointer2 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCursorMode('pan')}
              className={`p-1.5 rounded-md transition-all ${cursorMode === 'pan' ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
              title="Pan Mode"
            >
              <Move className="h-4 w-4" />
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-3 text-xs font-medium text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
              <span>{spectrum.sampleName || 'Primary'}</span>
            </div>
            {comparisonSpectrum && (
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                <span>{comparisonSpectrum.sampleName || 'Comparison'}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Controls: Zoom & Export */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex items-center gap-1 sm:gap-2 pr-2 border-r border-slate-200 dark:border-slate-700 mr-1">
            <button onClick={() => setViewport(prev => ({ ...prev, zoom: Math.min(20, prev.zoom * 1.2) }))} className="icon-btn" title="Zoom In">
              <ZoomIn className="h-4 w-4" />
            </button>
            <button onClick={() => setViewport(prev => ({ ...prev, zoom: Math.max(0.5, prev.zoom / 1.2) }))} className="icon-btn" title="Zoom Out">
              <ZoomOut className="h-4 w-4" />
            </button>
            <button onClick={handleResetZoom} className="icon-btn" title="Reset View">
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={handleExportImage} className="icon-btn" title="Export Image">
              <Download className="h-4 w-4" />
            </button>
            <button onClick={handleExportData} className="icon-btn" title="Export CSV">
              <FileSpreadsheet className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .icon-btn {
            @apply p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors;
        }
      `}</style>
    </div>
  )
}
