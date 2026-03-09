/**
 * Lab Timer Animation Component
 * Implements canonical spec: countdown/countup with progress ring and alerts
 */

'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect, useRef } from 'react'
import { getTimerColor } from '@/lib/equipment-animations'
import { EQUIPMENT_Z_INDEX } from '@/lib/equipment-positioning'

interface LabTimerProps {
    timeRemaining: number // in seconds (0-7200 for 0-120 min)
    timerMode: 'countdown' | 'countup'
    isTimerRunning: boolean
    isActive: boolean
    tubePosition: { x: number; y: number; width: number; height: number }
    onPause?: () => void
    onResume?: () => void
    onReset?: () => void
}

export default function LabTimer({
    timeRemaining,
    timerMode,
    isTimerRunning,
    isActive,
    tubePosition,
    onPause,
    onResume,
    onReset,
}: LabTimerProps) {
    const [startTime, setStartTime] = useState<number | null>(null)
    const [pauseAt, setPauseAt] = useState<number | null>(null)
    const initialDurationRef = useRef(timeRemaining) // Use ref to prevent stale values
    const [currentTime, setCurrentTime] = useState(timeRemaining)
    const [isExpired, setIsExpired] = useState(false)

    // Update ref when timer is not running (allows reset to new value)
    useEffect(() => {
        if (!isTimerRunning) {
            initialDurationRef.current = timeRemaining
        }
    }, [timeRemaining, isTimerRunning])

    // Start timer when running begins
    useEffect(() => {
        if (!isActive) return

        if (isTimerRunning && !startTime) {
            // Starting fresh or resuming
            if (pauseAt !== null) {
                // Resume: adjust startTime to account for paused duration
                const pausedDuration = currentTime
                setStartTime(Date.now() - (timerMode === 'countdown' ? (initialDurationRef.current - pausedDuration) * 1000 : pausedDuration * 1000))
                setPauseAt(null)
            } else {
                // Fresh start
                setStartTime(Date.now())
            }
        } else if (!isTimerRunning && startTime) {
            // Pausing
            setPauseAt(currentTime)
            setStartTime(null)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isTimerRunning, isActive, currentTime, timerMode])

    // Update current time using timestamps with visibility control
    useEffect(() => {
        if (!isActive || !isTimerRunning || !startTime) return

        const interval = setInterval(() => {
            // Pause updates when tab is hidden (performance optimization)
            if (document.hidden) return

            const elapsed = Math.floor((Date.now() - startTime) / 1000)

            if (timerMode === 'countdown') {
                const remaining = Math.max(0, initialDurationRef.current - elapsed)
                setCurrentTime(remaining)

                if (remaining === 0 && !isExpired) {
                    setIsExpired(true)
                }
            } else {
                // Countup never wraps
                setCurrentTime(elapsed)
            }
        }, 100) // Update more frequently for accuracy

        return () => clearInterval(interval)
    }, [isActive, isTimerRunning, startTime, timerMode, isExpired])

    if (!isActive) return null

    // Format time as MM:SS
    const minutes = Math.floor(currentTime / 60)
    const seconds = currentTime % 60
    const timeString = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`

    // Progress calculation using ref
    const progress = timerMode === 'countdown'
        ? (currentTime / initialDurationRef.current) * 100
        : Math.min((currentTime / initialDurationRef.current) * 100, 100)

    // Color based on time remaining (for countdown)
    const ringColor = getTimerColor(minutes)

    // Circle parameters for progress ring
    const radius = 50
    const circumference = 2 * Math.PI * radius
    const strokeDashoffset = circumference - (progress / 100) * circumference

    return (
        <>
            {/* Floating timer display above tube */}
            <motion.div
                className="absolute pointer-events-auto"
                style={{
                    left: tubePosition.x + tubePosition.width / 2,
                    top: tubePosition.y - 80,
                    transform: 'translateX(-50%)',
                    zIndex: EQUIPMENT_Z_INDEX.timer,
                }}
                initial={{ opacity: 0, y: 10, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.9 }}
                transition={{ duration: 0.3 }}
            >
                <div className="bg-gray-900/95 backdrop-blur-sm px-4 py-3 rounded-xl border border-gray-700 shadow-2xl">
                    {/* Time display */}
                    <motion.div
                        className="font-mono text-2xl font-bold text-center"
                        style={{ color: isExpired ? '#ef4444' : ringColor }}
                        animate={
                            isExpired
                                ? { scale: [1, 1.1, 1], opacity: [1, 0.7, 1] }
                                : {}
                        }
                        transition={{ duration: 0.5, repeat: isExpired ? Infinity : 0 }}
                    >
                        {timeString}
                    </motion.div>

                    {/* Mode indicator */}
                    <div className="text-xs text-gray-400 text-center mt-1">
                        {timerMode === 'countdown' ? 'Countdown' : 'Elapsed'}
                    </div>

                    {/* Controls */}
                    <div className="flex justify-center space-x-2 mt-2">
                        {isTimerRunning ? (
                            <button
                                onClick={onPause}
                                className="px-2 py-1 bg-yellow-600 hover:bg-yellow-700 text-white text-xs rounded transition-colors"
                            >
                                Pause
                            </button>
                        ) : (
                            <button
                                onClick={onResume}
                                className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded transition-colors"
                            >
                                Resume
                            </button>
                        )}
                        <button
                            onClick={onReset}
                            className="px-2 py-1 bg-gray-600 hover:bg-gray-700 text-white text-xs rounded transition-colors"
                        >
                            Reset
                        </button>
                    </div>
                </div>
            </motion.div>

            {/* Progress ring around tube */}
            <motion.div
                className="absolute pointer-events-none"
                style={{
                    left: tubePosition.x + tubePosition.width / 2,
                    top: tubePosition.y + tubePosition.height / 2,
                    transform: 'translate(-50%, -50%)',
                    zIndex: EQUIPMENT_Z_INDEX.timer - 2,
                }}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
            >
                <svg
                    width={tubePosition.width + 40}
                    height={tubePosition.height + 40}
                    viewBox={`0 0 ${tubePosition.width + 40} ${tubePosition.height + 40}`}
                >
                    {/* Background ring */}
                    <ellipse
                        cx={(tubePosition.width + 40) / 2}
                        cy={(tubePosition.height + 40) / 2}
                        rx={radius}
                        ry={radius * (tubePosition.height / tubePosition.width)}
                        fill="none"
                        stroke="rgba(75, 85, 99, 0.3)"
                        strokeWidth="3"
                    />

                    {/* Progress ring */}
                    <motion.ellipse
                        cx={(tubePosition.width + 40) / 2}
                        cy={(tubePosition.height + 40) / 2}
                        rx={radius}
                        ry={radius * (tubePosition.height / tubePosition.width)}
                        fill="none"
                        stroke={ringColor}
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                        style={{
                            transform: 'rotate(-90deg)',
                            transformOrigin: 'center',
                        }}
                        animate={
                            isTimerRunning && !isExpired
                                ? {}
                                : isExpired
                                    ? { opacity: [1, 0.5, 1] }
                                    : {}
                        }
                        transition={{
                            strokeDashoffset: { duration: 0.5, ease: 'easeInOut' },
                            opacity: { duration: 0.8, repeat: isExpired ? Infinity : 0 },
                        }}
                    />

                    {/* Tick marks at 15-min intervals */}
                    {[0, 15, 30, 45, 60, 75, 90, 105].map((min) => {
                        const angle = (min / 120) * 360 - 90
                        const x1 = (tubePosition.width + 40) / 2 + radius * Math.cos((angle * Math.PI) / 180)
                        const y1 = (tubePosition.height + 40) / 2 + radius * (tubePosition.height / tubePosition.width) * Math.sin((angle * Math.PI) / 180)
                        const x2 = (tubePosition.width + 40) / 2 + (radius - 5) * Math.cos((angle * Math.PI) / 180)
                        const y2 = (tubePosition.height + 40) / 2 + (radius - 5) * (tubePosition.height / tubePosition.width) * Math.sin((angle * Math.PI) / 180)

                        return (
                            <line
                                key={min}
                                x1={x1}
                                y1={y1}
                                x2={x2}
                                y2={y2}
                                stroke="rgba(156, 163, 175, 0.5)"
                                strokeWidth="2"
                            />
                        )
                    })}
                </svg>
            </motion.div>

            {/* Alert glow when timer expires */}
            <AnimatePresence>
                {isExpired && (
                    <motion.div
                        className="absolute pointer-events-none"
                        style={{
                            left: tubePosition.x,
                            top: tubePosition.y,
                            width: tubePosition.width,
                            height: tubePosition.height,
                            boxShadow: '0 0 30px 10px rgba(239, 68, 68, 0.6)',
                            borderRadius: '0 0 24px 24px',
                            zIndex: EQUIPMENT_Z_INDEX.timer - 3,
                        }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0, 1, 0] }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1, repeat: Infinity }}
                    />
                )}
            </AnimatePresence>

            {/* Elapsed trail indicator (faint arc showing time passed) */}
            {timerMode === 'countdown' && currentTime < initialDurationRef.current && (
                <motion.div
                    className="absolute pointer-events-none"
                    style={{
                        left: tubePosition.x + tubePosition.width / 2,
                        top: tubePosition.y + tubePosition.height / 2,
                        transform: 'translate(-50%, -50%)',
                        zIndex: EQUIPMENT_Z_INDEX.timer - 3,
                    }}
                >
                    <svg
                        width={tubePosition.width + 40}
                        height={tubePosition.height + 40}
                        viewBox={`0 0 ${tubePosition.width + 40} ${tubePosition.height + 40}`}
                    >
                        <ellipse
                            cx={(tubePosition.width + 40) / 2}
                            cy={(tubePosition.height + 40) / 2}
                            rx={radius - 3}
                            ry={(radius - 3) * (tubePosition.height / tubePosition.width)}
                            fill="none"
                            stroke="rgba(156, 163, 175, 0.2)"
                            strokeWidth="2"
                            strokeDasharray={circumference}
                            strokeDashoffset={strokeDashoffset}
                            style={{
                                transform: 'rotate(-90deg)',
                                transformOrigin: 'center',
                            }}
                        />
                    </svg>
                </motion.div>
            )}
        </>
    )
}
