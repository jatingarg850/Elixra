'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
    ArrowLeft,
    Save,
    Download,
    Share2,
    RotateCcw,
    Flame,
    Plus,
    Atom,
    Sparkles,
    FlaskConical,
    ClipboardList,
    Beaker
} from 'lucide-react'
import LabTable from '@/components/LabTable'
import ChemicalShelf from '@/components/ChemicalShelf'
import ReactionPanel from '@/components/ReactionPanel'
import ExperimentControls from '@/components/ExperimentControls'
import EquipmentPanel from '@/components/EquipmentPanel'
import ActiveEquipmentDisplay from '@/components/ActiveEquipmentDisplay'
import ModernNavbar from '@/components/ModernNavbar'
import { useDragScroll } from '@/hooks/useDragScroll'
import { Experiment, ReactionResult } from '@/types/chemistry'
import { calculatePH, formatPH } from '@/lib/ph-calculator'
import { useAuth } from '@/contexts/AuthContext'
import { EQUIPMENT_CONFIG } from '@/lib/equipment-config'
import { EquipmentAttachment } from '@/lib/equipment-animations'
import TestTubeSelectionModal from '@/components/TestTubeSelectionModal'

import { StaticGrid } from '@/components/GridBackground'

import SaveConfirmation from '@/components/SaveConfirmation'

export default function LabPage() {
    const router = useRouter()
    const { syncExperiments, experiments, saveExperiment, toggleSaveExperiment, isAuthenticated, isLoading } = useAuth()
    const [currentExperiment, setCurrentExperiment] = useState<Experiment | null>(null)

    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            router.push('/auth/signin')
        }
    }, [isLoading, isAuthenticated, router])

    const [saveStatus, setSaveStatus] = useState<{ isVisible: boolean; message: string; type: 'success' | 'error' }>({
        isVisible: false,
        message: '',
        type: 'success'
    })
    const [reactionResult, setReactionResult] = useState<ReactionResult | null>(null)
    const [isReacting, setIsReacting] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [isExporting, setIsExporting] = useState(false)
    const [isSharing, setIsSharing] = useState(false)
    const [addChemicalToTestTube, setAddChemicalToTestTube] = useState<((chemical: any) => void) | null>(null)
    const [addTestTubeFunc, setAddTestTubeFunc] = useState<(() => void) | null>(null)
    const [addBeakerFunc, setAddBeakerFunc] = useState<(() => void) | null>(null)
    const [showFeatures, setShowFeatures] = useState(false)
    const [equipmentAttachments, setEquipmentAttachments] = useState<any[]>([])
    const [selectedTubeId, setSelectedTubeId] = useState('tube-1')
    const [openEquipmentPanel, setOpenEquipmentPanel] = useState(false)
    const [selectedTubeContents, setSelectedTubeContents] = useState<any[]>([])

    // Mobile Tab State
    const [activeMobileTab, setActiveMobileTab] = useState<'shelf' | 'bench' | 'analysis'>('bench')

    // Equipment selection state
    const [availableTestTubes, setAvailableTestTubes] = useState<Array<{ id: string; contents: any[] }>>([])
    const [isSelectionModalOpen, setIsSelectionModalOpen] = useState(false)
    const [pendingEquipmentId, setPendingEquipmentId] = useState<string | null>(null)

    // Calculate dynamic pH and temperature for selected tube
    const currentPH = selectedTubeContents.length > 0 ? formatPH(calculatePH(selectedTubeContents)) : 0

    const calculateTemperature = (): number => {
        const ROOM_TEMP = 25
        const EMPTY_TUBE_INDICATOR = -999

        if (selectedTubeContents.length === 0) return EMPTY_TUBE_INDICATOR

        let temperature = ROOM_TEMP
        const tubeAttachments = equipmentAttachments.filter(a => a.targetTubeId === selectedTubeId && a.isActive)

        const bunsenBurner = tubeAttachments.find(a => a.equipmentType === 'bunsen-burner')
        const hotPlate = tubeAttachments.find(a => a.equipmentType === 'hot-plate')
        const stirrer = tubeAttachments.find(a => a.equipmentType === 'magnetic-stirrer')

        if (bunsenBurner) {
            const burnerTemp = bunsenBurner.settings.temperature || 0
            temperature = ROOM_TEMP + (burnerTemp / 1000) * 275
        }

        if (hotPlate) {
            const plateTemp = hotPlate.settings.temperature || 0
            temperature = Math.max(temperature, plateTemp)
        }

        if (stirrer) {
            const rpm = stirrer.settings.rpm || 0
            temperature += (rpm / 1500) * 2
        }

        return Math.round(temperature * 10) / 10
    }

    const currentTemperature = calculateTemperature()

    // Calculate dynamic weight for selected tube
    const calculateWeight = (): number => {
        if (selectedTubeContents.length === 0) return 0

        let totalWeight = 0
        selectedTubeContents.forEach(content => {
            if (content.unit === 'g') {
                totalWeight += content.amount
            } else if (content.unit === 'ml') {
                totalWeight += content.amount // 1ml ≈ 1g
            } else if (content.unit === 'drops') {
                totalWeight += content.amount * 0.05 // 1 drop ≈ 0.05g
            }
        })

        return totalWeight
    }

    const currentWeight = calculateWeight()

    // Debug equipment changes
    useEffect(() => {
        console.log('Lab: Equipment attachments changed', {
            count: equipmentAttachments.length,
            attachments: equipmentAttachments
        })
    }, [equipmentAttachments])
    const labTableRef = useRef<HTMLDivElement>(null)
    const reactionPanelRef = useRef<HTMLDivElement>(null)

    useDragScroll()

    useEffect(() => {
        const isMobile = window.innerWidth < 1024
        if (isMobile && labTableRef.current) {
            setTimeout(() => {
                labTableRef.current?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                })
            }, 500)
        }
    }, [])

    // Scroll to reaction results on mobile when reaction completes
    useEffect(() => {
        const isMobile = window.innerWidth < 1024
        if (isMobile && reactionResult && reactionPanelRef.current) {
            setTimeout(() => {
                reactionPanelRef.current?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                })
            }, 500)
        }
    }, [reactionResult])

    const handleAddChemicalToTestTube = (chemical: any) => {
        if (addChemicalToTestTube && chemical) {
            addChemicalToTestTube(chemical)
        }
    }

    const handleReaction = async (experiment: Experiment) => {
        setIsReacting(true)
        setCurrentExperiment(experiment)

        // Add equipment info to experiment
        console.log('Lab: Performing reaction with equipment', {
            totalAttachments: equipmentAttachments.length,
            attachments: equipmentAttachments
        })

        const experimentWithEquipment = {
            ...experiment,
            equipment: equipmentAttachments.map(att => ({
                name: att.equipmentType,
                settings: att.settings
            }))
        }

        console.log('Lab: Experiment with equipment', experimentWithEquipment)

        try {
            const response = await fetch('/api/react', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(experimentWithEquipment),
            })

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`)
            }

            const result = await response.json()

            if (result.error) {
                throw new Error(result.error)
            }

            setReactionResult(result)

            await fetch('/api/experiments', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...experiment,
                    experimentName: experiment.name,
                    reactionDetails: result,
                    isSaved: false
                }),
            })
        } catch (error) {
            console.error('Reaction failed:', error)
        } finally {
            setIsReacting(false)
        }
    }

    const clearExperiment = () => {
        setCurrentExperiment(null)
        setReactionResult(null)
    }

    const handleSave = async () => {
        if (!currentExperiment || !reactionResult) {
            alert('Please perform an experiment first!')
            return
        }

        const experimentData = {
            ...currentExperiment,
            experimentName: currentExperiment.name,
            reactionDetails: reactionResult,
            savedAt: new Date().toISOString(),
            isSaved: true
        }

        // Check for duplicates
        const existingExperiment = experiments.find(exp =>
            exp.experimentName === experimentData.experimentName &&
            JSON.stringify(exp.chemicals) === JSON.stringify(experimentData.chemicals) &&
            JSON.stringify(exp.reactionDetails) === JSON.stringify(experimentData.reactionDetails)
        )

        setIsSaving(true)
        try {
            if (existingExperiment) {
                if (existingExperiment.isSaved) {
                    setSaveStatus({
                        isVisible: true,
                        message: 'This experiment has already been saved!',
                        type: 'error'
                    })
                    setIsSaving(false)
                    return
                } else {
                    // Update the unsaved history log to be marked as saved
                    await toggleSaveExperiment(existingExperiment._id!, true)
                    setSaveStatus({
                        isVisible: true,
                        message: 'Experiment saved successfully!',
                        type: 'success'
                    })
                    await syncExperiments()
                }
            } else {
                await saveExperiment(experimentData)
                setSaveStatus({
                    isVisible: true,
                    message: 'Experiment saved successfully!',
                    type: 'success'
                })
                await syncExperiments()
            }
        } catch (error) {
            console.error('Save failed:', error)
            setSaveStatus({
                isVisible: true,
                message: 'Failed to save experiment. Please try again.',
                type: 'error'
            })
        } finally {
            setIsSaving(false)
        }
    }

    const handleExport = async () => {
        if (!currentExperiment || !reactionResult) {
            alert('Please perform an experiment first!')
            return
        }

        setIsExporting(true)
        try {
            // Dynamic import to avoid SSR issues
            const { generateExperimentPDF } = await import('@/lib/pdfExport')

            generateExperimentPDF({
                experiment: currentExperiment,
                result: reactionResult,
                date: new Date(),
                author: 'Lab User'
            })

            // Small delay to show the loading state
            await new Promise(resolve => setTimeout(resolve, 500))
        } catch (error) {
            console.error('Export failed:', error)
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            alert(`❌ Failed to export PDF: ${errorMessage}\n\nPlease try again or check the console for details.`)
        } finally {
            setIsExporting(false)
        }
    }

    const handleShare = async () => {
        if (!currentExperiment || !reactionResult) {
            alert('Please perform an experiment first!')
            return
        }

        setIsSharing(true)
        const shareData = {
            title: 'Chemistry Experiment Results',
            text: `Chemical Reaction: ${reactionResult.balancedEquation || 'View my experiment results'}`,
            url: window.location.href
        }

        try {
            if (navigator.share) {
                // Use Web Share API if available
                await navigator.share(shareData)
            } else {
                // Fallback: Copy to clipboard
                const shareText = `Chemistry Experiment Results\n\nChemicals Used:\n${currentExperiment.chemicals.map(c =>
                    `- ${c.chemical.name} (${c.chemical.formula}): ${c.amount} ${c.unit}`
                ).join('\n')
                    }\n\nReaction: ${reactionResult.balancedEquation || 'N/A'}\n\nObservations:\n${reactionResult.observations?.join('\n- ') || 'None'
                    }\n\nGenerated by ChemLab AI`

                await navigator.clipboard.writeText(shareText)
                alert('✅ Experiment details copied to clipboard!')
            }
        } catch (error) {
            console.error('Share failed:', error)
            alert('❌ Failed to share experiment. Please try again.')
        } finally {
            setIsSharing(false)
        }
    }

    // Handle equipment activation request
    const handleRequestEquipmentActivation = (equipmentId: string) => {
        setPendingEquipmentId(equipmentId)
        setIsSelectionModalOpen(true)
    }

    // Handle tube selection for equipment
    const handleEquipmentTubeSelected = (tubeId: string) => {
        if (!pendingEquipmentId) return

        setIsSelectionModalOpen(false)
        setSelectedTubeId(tubeId) // Update global selection

        // Proceed with activation logic
        const id = pendingEquipmentId
        const eq = EQUIPMENT_CONFIG.find(e => e.id === id)
        if (!eq) return

        let updatedAttachments = [...equipmentAttachments]

        // EXCLUSIVITY ENFORCEMENT: Check for conflicts
        // Heating exclusivity: Bunsen OR Hot Plate
        if (id === 'bunsen-burner' || id === 'hot-plate') {
            const conflictingHeater = updatedAttachments.find(
                a => (a.equipmentType === 'bunsen-burner' || a.equipmentType === 'hot-plate') &&
                    a.targetTubeId === tubeId
            )
            if (conflictingHeater) {
                updatedAttachments = updatedAttachments.filter(a => a.equipmentId !== conflictingHeater.equipmentId)
            }
        }

        // Motion exclusivity: Stirrer OR Centrifuge
        if (id === 'magnetic-stirrer' || id === 'centrifuge') {
            const conflictingMotion = updatedAttachments.find(
                a => (a.equipmentType === 'magnetic-stirrer' || a.equipmentType === 'centrifuge') &&
                    a.targetTubeId === tubeId
            )
            if (conflictingMotion) {
                updatedAttachments = updatedAttachments.filter(a => a.equipmentId !== conflictingMotion.equipmentId)
            }
        }

        // Turn ON - create attachment
        const newAttachment: EquipmentAttachment = {
            equipmentId: `${id}-${Date.now()}`,
            equipmentType: id,
            targetTubeId: tubeId,
            isActive: true,
            settings: {
                temperature: (id === 'bunsen-burner' || id === 'hot-plate') ? eq.value : undefined,
                rpm: (id === 'magnetic-stirrer' || id === 'centrifuge') ? eq.value : undefined,
                pH: id === 'ph-meter' ? eq.value : undefined,
                measuredTemp: id === 'thermometer' ? eq.value : undefined,
                weight: id === 'analytical-balance' ? eq.value : undefined,
                timeRemaining: id === 'timer' ? eq.value : undefined,
                timerMode: id === 'timer' ? 'countdown' : undefined,
                isTimerRunning: id === 'timer' ? false : undefined
            }
        }

        setEquipmentAttachments([...updatedAttachments, newAttachment])
        setPendingEquipmentId(null)
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[#020617]">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
        )
    }

    if (!isAuthenticated) {
        return null
    }

    return (
        <div className="min-h-screen bg-elixra-cream dark:bg-elixra-charcoal relative overflow-hidden transition-colors duration-500">
            {/* Background Grid */}
            <StaticGrid className="opacity-30 fixed inset-0 z-0 pointer-events-none" />

            {/* Modern Navbar - Same as Homepage */}
            <ModernNavbar />

            {/* Main Content - Responsive Grid */}
            <div className="h-[calc(100vh-8rem)] lg:h-[calc(100vh-4rem)] grid grid-cols-1 lg:grid-cols-[320px_1fr_380px] gap-3 sm:gap-4 p-2 sm:p-4 relative z-10 pb-20 lg:pb-4">
                {/* Left Panel - Chemical Shelf */}
                <motion.div
                    initial={{ x: -100, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.1 }}
                    className={`${activeMobileTab === 'shelf' ? 'flex' : 'hidden'} lg:flex h-full glass-panel rounded-3xl transition-all duration-300 overflow-hidden flex-col`}
                >
                    {/* Header */}
                    <div className="flex-shrink-0 p-4 border-b border-elixra-copper/10 bg-elixra-cream/30 dark:bg-white/5">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-elixra-bunsen/10 rounded-lg">
                                <Sparkles className="w-5 h-5 text-elixra-bunsen" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-elixra-text-primary">Chemical Reagents</h2>
                                <p className="text-xs text-elixra-text-secondary">Click or drag to add</p>
                            </div>
                        </div>
                    </div>

                    {/* Scrollable Content */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <ChemicalShelf onAddChemicalToTestTube={(chemical) => {
                            handleAddChemicalToTestTube(chemical)
                            // On mobile, switch to bench after adding a chemical
                            if (window.innerWidth < 1024) {
                                setActiveMobileTab('bench')
                            }
                        }} />
                    </div>
                </motion.div>

                {/* Center Panel - Lab Bench */}
                <motion.div
                    initial={{ y: 100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                    className={`${activeMobileTab === 'bench' ? 'flex' : 'hidden'} lg:flex h-full bg-elixra-cream/80 dark:bg-white/5 backdrop-blur-xl border border-elixra-copper/10 rounded-3xl transition-all duration-300 overflow-hidden flex-col shadow-inner relative`}
                    ref={labTableRef}
                >
                    {/* Header */}
                    <div className="flex-shrink-0 p-4 border-b border-elixra-copper/10 bg-elixra-cream/30 dark:bg-white/5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-elixra-bunsen/10 rounded-lg">
                                    <FlaskConical className="w-5 h-5 text-elixra-bunsen" />
                                </div>
                                <h2 className="text-lg font-bold text-elixra-text-primary">Lab Bench</h2>
                            </div>
                            {/* Add Glassware Buttons */}
                            <div className="flex gap-2">
                                {/* Desktop Equipment Toggle */}
                                <button
                                    onClick={() => setOpenEquipmentPanel(true)}
                                    className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 rounded-lg border border-orange-500/20 transition-all font-medium"
                                    title="Open Advanced Equipment Panel"
                                >
                                    <Flame className="w-4 h-4" />
                                    <span>Equipment</span>
                                </button>

                                <button
                                    onClick={() => {
                                        if (addTestTubeFunc) {
                                            addTestTubeFunc()
                                        } else {
                                            (window as any).__addTestTube?.()
                                        }
                                    }}
                                    className="flex items-center gap-2 px-3 py-1.5 btn-primary text-sm font-medium transition-all"
                                >
                                    <Plus className="w-4 h-4" />
                                    <span className="hidden sm:inline">Test Tube</span>
                                    <span className="sm:hidden">Tube</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Scrollable Lab Content */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar relative">
                        {/* Equipment Quick Access for Mobile */}
                        <div className="lg:hidden absolute top-2 right-2 z-10">
                            <button
                                onClick={() => setOpenEquipmentPanel(true)}
                                className="p-2 bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 rounded-lg border border-orange-500/20 shadow-sm backdrop-blur-sm"
                            >
                                <Flame className="w-5 h-5" />
                            </button>
                        </div>

                        <LabTable
                            onReaction={(exp) => {
                                handleReaction(exp)
                                // On mobile, switch to analysis after reaction
                                if (window.innerWidth < 1024) {
                                    setActiveMobileTab('analysis')
                                }
                            }}
                            reactionResult={reactionResult}
                            isReacting={isReacting}
                            onAddChemicalToTestTube={setAddChemicalToTestTube}
                            onAddTestTube={setAddTestTubeFunc}
                            onAddBeaker={setAddBeakerFunc}
                            equipmentAttachments={equipmentAttachments}
                            onEquipmentChange={setEquipmentAttachments}
                            selectedTubeId={selectedTubeId}
                            onSelectTube={setSelectedTubeId}
                            onSelectedTubeContentsChange={setSelectedTubeContents}
                            onTestTubesChange={setAvailableTestTubes}
                        />
                    </div>
                </motion.div>

                {/* Right Panel - Reaction Analysis */}
                <motion.div
                    ref={reactionPanelRef}
                    initial={{ x: 100, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.3 }}
                    className={`${activeMobileTab === 'analysis' ? 'flex' : 'hidden'} lg:flex h-full glass-panel rounded-3xl transition-all duration-300 overflow-hidden flex-col ${reactionResult ? 'border-elixra-bunsen/50 shadow-lg shadow-elixra-bunsen/20' : ''
                        }`}
                >
                    {/* Header */}
                    <div className="flex-shrink-0 p-4 border-b border-elixra-copper/10 bg-elixra-cream/30 dark:bg-white/5">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-elixra-copper/10 rounded-lg">
                                <ClipboardList className="w-5 h-5 text-elixra-copper" />
                            </div>
                            <div className="flex-1">
                                <h2 className="text-lg font-bold text-elixra-text-primary">Analysis</h2>
                                <p className="text-xs text-elixra-text-secondary">AI-powered results</p>
                            </div>
                            <div className="flex gap-2">
                                {reactionResult && (
                                    <>
                                        <button
                                            onClick={handleSave}
                                            disabled={isSaving}
                                            className="p-2 rounded-lg bg-elixra-bunsen/10 text-elixra-bunsen hover:bg-elixra-bunsen/20 transition-all"
                                            title="Save to History"
                                        >
                                            {isSaving ? <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Save className="w-5 h-5" />}
                                        </button>
                                        <button
                                            onClick={handleExport}
                                            disabled={isExporting}
                                            className="p-2 rounded-lg bg-elixra-copper/10 text-elixra-copper hover:bg-elixra-copper/20 transition-all"
                                            title="Export PDF"
                                        >
                                            {isExporting ? <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Download className="w-5 h-5" />}
                                        </button>
                                    </>
                                )}
                            </div>
                            {reactionResult && (
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className="lg:hidden px-2 py-1 bg-green-500/20 border border-green-500/50 rounded-full"
                                >
                                    <span className="text-xs text-green-300 font-semibold">New!</span>
                                </motion.div>
                            )}
                        </div>
                    </div>

                    {/* Scrollable Content - Only internal scroll on large screens */}
                    <div className="flex-1 lg:overflow-y-auto custom-scrollbar">
                        <ReactionPanel
                            experiment={currentExperiment}
                            result={reactionResult}
                            isLoading={isReacting}
                        />
                    </div>
                </motion.div>
            </div>

            {/* Mobile Bottom Navigation Bar */}
            <div className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-white dark:bg-elixra-charcoal border-t border-elixra-copper/10 z-50 px-4 flex items-center justify-around shadow-lg-up pb-safe">
                <button
                    onClick={() => setActiveMobileTab('shelf')}
                    className={`flex flex-col items-center justify-center space-y-1 w-20 py-1 rounded-xl transition-all ${activeMobileTab === 'shelf'
                            ? 'text-elixra-bunsen bg-elixra-bunsen/10'
                            : 'text-gray-400 hover:text-gray-500'
                        }`}
                >
                    <Sparkles className="w-6 h-6" />
                    <span className="text-[10px] font-medium">Shelf</span>
                </button>

                <button
                    onClick={() => setActiveMobileTab('bench')}
                    className={`flex flex-col items-center justify-center space-y-1 w-20 py-1 rounded-xl transition-all ${activeMobileTab === 'bench'
                            ? 'text-elixra-bunsen bg-elixra-bunsen/10'
                            : 'text-gray-400 hover:text-gray-500'
                        }`}
                >
                    <FlaskConical className="w-6 h-6" />
                    <span className="text-[10px] font-medium">Bench</span>
                </button>

                <button
                    onClick={() => setActiveMobileTab('analysis')}
                    className={`flex flex-col items-center justify-center space-y-1 w-20 py-1 rounded-xl transition-all relative ${activeMobileTab === 'analysis'
                            ? 'text-elixra-bunsen bg-elixra-bunsen/10'
                            : 'text-gray-400 hover:text-gray-500'
                        }`}
                >
                    <ClipboardList className="w-6 h-6" />
                    <span className="text-[10px] font-medium">Analysis</span>
                    {reactionResult && (
                        <span className="absolute top-1 right-5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white dark:border-elixra-charcoal"></span>
                    )}
                </button>
            </div>

            {/* Mobile: View Results Button */}


            {/* Floating Features Button - REMOVED in favor of Tab Bar */}
            {/* Features Panel - REMOVED in favor of Tab Bar */}

            {/* Custom Scrollbar Styles */}
            <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }

        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(46, 107, 107, 0.1);
          border-radius: 3px;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(46, 107, 107, 0.3);
          border-radius: 3px;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(46, 107, 107, 0.5);
        }

        /* Firefox */
        .custom-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: rgba(46, 107, 107, 0.3) rgba(46, 107, 107, 0.1);
        }
      `}</style>

            {/* Active Equipment Display - Floating on lab screen */}
            {/* <ActiveEquipmentDisplay equipment={activeEquipment} /> */}

            {/* Equipment Panel - Integrated into Features button, no separate floating button */}
            <EquipmentPanel
                onEquipmentChange={setEquipmentAttachments}
                currentAttachments={equipmentAttachments}
                selectedTubeId={selectedTubeId}
                hideFloatingButton={true}
                externalIsOpen={openEquipmentPanel}
                onClose={() => setOpenEquipmentPanel(false)}
                currentPH={currentPH}
                currentTemperature={currentTemperature}
                currentWeight={currentWeight}
                onRequestActivation={handleRequestEquipmentActivation}
            />

            <SaveConfirmation
                isVisible={saveStatus.isVisible}
                message={saveStatus.message}
                type={saveStatus.type}
                onClose={() => setSaveStatus(prev => ({ ...prev, isVisible: false }))}
            />

            {/* Equipment Selection Modal */}
            <TestTubeSelectionModal
                isOpen={isSelectionModalOpen}
                onClose={() => {
                    setIsSelectionModalOpen(false)
                    setPendingEquipmentId(null)
                }}
                onSelect={handleEquipmentTubeSelected}
                testTubes={availableTestTubes}
                chemical={null}
                title="Select Equipment Target"
                description={`Which test tube should the ${EQUIPMENT_CONFIG.find(e => e.id === pendingEquipmentId)?.name || 'equipment'} be attached to?`}
            />
        </div>
    )
}
