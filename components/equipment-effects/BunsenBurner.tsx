/**
 * Bunsen Burner Animation Component
 * Implements canonical spec: flame heating with shimmer, glow, and vapor
 */

'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'
import { getIntensityScale } from '@/lib/equipment-animations'
import {
    getEquipmentPosition,
    getFlameHeight,
    EQUIPMENT_Z_INDEX,
    getGlowRadius
} from '@/lib/equipment-positioning'

interface BunsenBurnerProps {
    temperature: number // 0-1500°C
    isActive: boolean
    tubePosition: { x: number; y: number; width: number; height: number }
}

export default function BunsenBurner({ temperature, isActive, tubePosition }: BunsenBurnerProps) {
    const [vaporParticles, setVaporParticles] = useState<number[]>([])
    const { level, percentage } = getIntensityScale('bunsen-burner', temperature)

    // Flame height scaling based on tube geometry
    const flameHeight = getFlameHeight(temperature, 1500, tubePosition.height)

    // Flame width should match tube width (slightly narrower)
    const flameWidth = tubePosition.width * 0.6

    // Position anchored to tube bottom center - 16px gap below tube
    const position = getEquipmentPosition(tubePosition, 'bottom-center', { y: 16 - flameHeight })

    // Vapor spawning at 100°C+
    useEffect(() => {
        // Force render log
        console.log(`🔥 BunsenBurner Render:`, {
            isActive,
            temperature,
            tubePosition,
            flameHeight,
            flameWidth,
            position
        })

        if (!isActive || temperature < 100) {
            setVaporParticles([])
            return
        }

        const spawnRate = Math.max(2000 - (temperature / 1500) * 1800, 200) // Faster at higher temps
        const interval = setInterval(() => {
            setVaporParticles(prev => {
                const newParticles = [...prev, Date.now()]
                return newParticles.slice(-10) // Max 10 particles
            })
        }, spawnRate)

        return () => clearInterval(interval)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isActive, temperature])

    if (!isActive) return null

    // Ensure minimum visual presence (pilot light) even if temp is 0
    // Increased scale for better visibility
    const effectiveFlameScale = temperature <= 0 ? 0.4 : 1
    const effectiveOpacity = temperature <= 0 ? 0.8 : 1

    return (
        <div
            className="pointer-events-none"
            style={{
                position: 'fixed',
                left: position.left,
                top: position.top,
                transform: position.transform,
                zIndex: EQUIPMENT_Z_INDEX.bunsenBurner,
            }}
        >
            {/* Base Highlight for visibility on dark backgrounds */}
            <div
                className="absolute pointer-events-none"
                style={{
                    left: '50%',
                    top: flameHeight - 2, // Slightly above base
                    transform: 'translateX(-50%)',
                    width: flameWidth * 1.6,
                    height: 16,
                    background: 'radial-gradient(ellipse, rgba(255, 255, 255, 0.1) 0%, transparent 70%)',
                    zIndex: 10000
                }}
            />

            {/* Flame SVG - 3 layers, scaled to tube width */}
            <motion.svg
                width={flameWidth}
                height={Math.max(flameHeight, 20)} // Minimum height for pilot light
                viewBox={`0 0 ${flameWidth} ${Math.max(flameHeight, 20)}`}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: effectiveOpacity, scale: effectiveFlameScale }}
                exit={{ opacity: 0, scale: 0 }}
                transition={{ duration: 0.5 }}
                style={{ filter: 'drop-shadow(0 0 12px rgba(255, 100, 0, 0.8))' }}
            >
                {/* Outer orange layer - wider base */}
                <motion.path
                    d={`M ${flameWidth / 2} ${flameHeight} 
                        Q ${flameWidth * 0.2} ${flameHeight * 0.7} ${flameWidth * 0.3} ${flameHeight * 0.4} 
                        Q ${flameWidth * 0.4} ${flameHeight * 0.15} ${flameWidth / 2} 0 
                        Q ${flameWidth * 0.6} ${flameHeight * 0.15} ${flameWidth * 0.7} ${flameHeight * 0.4} 
                        Q ${flameWidth * 0.8} ${flameHeight * 0.7} ${flameWidth / 2} ${flameHeight} Z`}
                    fill="url(#flameGradientOuter)"
                    animate={{
                        scaleY: [1, 1.08, 0.96, 1.04, 1],
                        skewX: [-1.5, 1.5, -0.8, 0.8, -1.5],
                    }}
                    transition={{
                        duration: 0.2,
                        repeat: Infinity,
                        ease: 'easeInOut',
                    }}
                />

                {/* Middle yellow layer */}
                <motion.path
                    d={`M ${flameWidth / 2} ${flameHeight * 0.92} 
                        Q ${flameWidth * 0.28} ${flameHeight * 0.65} ${flameWidth * 0.35} ${flameHeight * 0.38} 
                        Q ${flameWidth * 0.43} ${flameHeight * 0.18} ${flameWidth / 2} ${flameHeight * 0.08} 
                        Q ${flameWidth * 0.57} ${flameHeight * 0.18} ${flameWidth * 0.65} ${flameHeight * 0.38} 
                        Q ${flameWidth * 0.72} ${flameHeight * 0.65} ${flameWidth / 2} ${flameHeight * 0.92} Z`}
                    fill="url(#flameGradientMiddle)"
                    animate={{
                        scaleY: [1, 1.12, 0.92, 1.08, 1],
                        skewX: [1.2, -1.2, 0.6, -0.6, 1.2],
                    }}
                    transition={{
                        duration: 0.15,
                        repeat: Infinity,
                        ease: 'easeInOut',
                    }}
                />

                {/* Inner blue core */}
                <motion.ellipse
                    cx={flameWidth / 2}
                    cy={flameHeight * 0.72}
                    rx={flameWidth * 0.12}
                    ry={flameHeight * 0.18}
                    fill="url(#flameGradientCore)"
                    animate={{
                        scaleY: [1, 1.15, 0.97, 1.1, 1],
                    }}
                    transition={{
                        duration: 0.13,
                        repeat: Infinity,
                        ease: 'easeInOut',
                    }}
                />

                {/* Gradients */}
                <defs>
                    <linearGradient id="flameGradientOuter" x1="0%" y1="100%" x2="0%" y2="0%">
                        <stop offset="0%" stopColor="#ff6600" stopOpacity="0.9" />
                        <stop offset="50%" stopColor="#ff8800" stopOpacity="0.8" />
                        <stop offset="100%" stopColor="#ffaa00" stopOpacity="0.6" />
                    </linearGradient>
                    <linearGradient id="flameGradientMiddle" x1="0%" y1="100%" x2="0%" y2="0%">
                        <stop offset="0%" stopColor="#ffaa00" stopOpacity="0.9" />
                        <stop offset="50%" stopColor="#ffcc00" stopOpacity="0.8" />
                        <stop offset="100%" stopColor="#ffee00" stopOpacity="0.7" />
                    </linearGradient>
                    <linearGradient id="flameGradientCore" x1="0%" y1="100%" x2="0%" y2="0%">
                        <stop offset="0%" stopColor="#0088ff" stopOpacity="0.8" />
                        <stop offset="100%" stopColor="#00ccff" stopOpacity="0.6" />
                    </linearGradient>
                </defs>
            </motion.svg>

            {/* Heat shimmer on tube */}
            <motion.div
                className="absolute"
                style={{
                    left: '50%',
                    bottom: flameHeight - 10,
                    transform: 'translateX(-50%)',
                    width: tubePosition.width,
                    height: tubePosition.height * 0.6,
                    pointerEvents: 'none',
                }}
                animate={{
                    filter: [
                        'blur(0px)',
                        `blur(${level === 'extreme' ? 2 : level === 'high' ? 1.5 : 1}px)`,
                        'blur(0px)',
                    ],
                }}
                transition={{ duration: 0.3, repeat: Infinity }}
            />

            {/* Vapor particles (100°C+) */}
            <AnimatePresence>
                {vaporParticles.map(id => (
                    <motion.div
                        key={id}
                        className="absolute rounded-full bg-white"
                        style={{
                            left: '50%',
                            bottom: flameHeight + tubePosition.height * 0.8,
                            width: 4,
                            height: 4,
                        }}
                        initial={{ opacity: 0, y: 0, x: -2 }}
                        animate={{
                            opacity: [0, 0.6, 0],
                            y: [-10, -40, -70],
                            x: [0, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 30],
                        }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 2, ease: 'easeOut' }}
                        onAnimationComplete={() => {
                            setVaporParticles(prev => prev.filter(p => p !== id))
                        }}
                    />
                ))}
            </AnimatePresence>

            {/* Burner base - sits below flame */}
            <div
                className="absolute pointer-events-none"
                style={{
                    left: '50%',
                    top: flameHeight,
                    transform: 'translateX(-50%)',
                    width: flameWidth * 1.5,
                    height: 12,
                    background: 'linear-gradient(to bottom, #718096 0%, #4a5568 100%)', // Lighter gray for visibility
                    border: '1px solid rgba(255,255,255,0.2)', // Border for contrast
                    borderRadius: '4px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                }}
            />

            {/* Burner stand legs */}
            <div
                className="absolute pointer-events-none"
                style={{
                    left: '50%',
                    top: flameHeight + 12,
                    transform: 'translateX(-50%)',
                    width: flameWidth * 1.8,
                    height: 3,
                    background: '#1a202c',
                    borderRadius: '2px',
                }}
            />

            {/* Tube glow overlay - matches tube shape */}
            <div
                className="absolute pointer-events-none"
                style={{
                    left: '50%',
                    bottom: flameHeight,
                    transform: 'translateX(-50%)',
                    width: tubePosition.width,
                    height: tubePosition.height * 0.3,
                    background: `radial-gradient(ellipse at top, rgba(255, 100, 0, ${0.25 + percentage * 0.002}) 0%, transparent 60%)`,
                    borderRadius: '0 0 24px 24px',
                    pointerEvents: 'none',
                }}
            />
        </div>
    )
}
