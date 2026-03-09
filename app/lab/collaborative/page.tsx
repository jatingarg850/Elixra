'use client'

import { useState, useEffect, useCallback, Suspense, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image'
import {
    ArrowLeft,
    Users,
    Wifi,
    WifiOff,
    Copy,
    CheckCircle,
    Sparkles,
    FlaskConical,
    ClipboardList,
    Flame,
    Plus,
    Share2,
    Save,
    Download,
    RotateCcw
} from 'lucide-react'
import LabTable from '@/components/LabTable'
import ChemicalShelf from '@/components/ChemicalShelf'
import ReactionPanel from '@/components/ReactionPanel'
import EquipmentPanel from '@/components/EquipmentPanel'
import ActiveEquipmentDisplay from '@/components/ActiveEquipmentDisplay'
import TestTubeSelectionModal from '@/components/TestTubeSelectionModal'
import CollaborationNotifications from '@/components/features/CollaborationNotifications'
import { StaticGrid } from '@/components/GridBackground'
import { useCollaboration } from '@/hooks/useCollaboration'
import { useDragScroll } from '@/hooks/useDragScroll'
import { Experiment, ReactionResult } from '@/types/chemistry'
import { calculatePH, formatPH } from '@/lib/ph-calculator'
import { EQUIPMENT_CONFIG } from '@/lib/equipment-config'
import { EquipmentAttachment } from '@/lib/equipment-animations'
import { useSession } from 'next-auth/react'
import { useAuth } from '@/contexts/AuthContext'
import SaveConfirmation from '@/components/SaveConfirmation'

function CollaborativeLabContent() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const roomCode = searchParams.get('room')
    const { data: sessionData, status } = useSession()
    const { syncExperiments, experiments, saveExperiment, toggleSaveExperiment } = useAuth()

    const {
        session,
        isConnected,
        error,
        userId,
        joinSession,
        updateExperiment,
        updateCursor,
        leaveSession
    } = useCollaboration(roomCode)

    // Lab State
    const [currentExperiment, setCurrentExperiment] = useState<Experiment | null>(null)
    const [reactionResult, setReactionResult] = useState<ReactionResult | null>(null)
    const [isReacting, setIsReacting] = useState(false)
    const [hasJoined, setHasJoined] = useState(false)
    const [copied, setCopied] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [isExporting, setIsExporting] = useState(false)
    const [saveStatus, setSaveStatus] = useState<{ isVisible: boolean; message: string; type: 'success' | 'error' }>({
        isVisible: false,
        message: '',
        type: 'success'
    })

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
        setIsExporting(true)
        // Simulate export
        await new Promise(resolve => setTimeout(resolve, 1000))
        setIsExporting(false)
    }

    const handleLeave = () => {
        leaveSession()
        window.location.href = '/'
    }

    // Auto-join if authenticated
    useEffect(() => {
        if (status === 'authenticated' && sessionData?.user?.name && !hasJoined && isConnected) {
            joinSession(sessionData.user.name)
            setHasJoined(true)
        } else if (status === 'unauthenticated') {
            router.push('/auth/signin?callbackUrl=' + encodeURIComponent(window.location.href))
        }
    }, [status, sessionData, hasJoined, isConnected, joinSession, router])

    // Sync remote state to local state
    useEffect(() => {
        if (session?.experiment) {
            const remoteExp = session.experiment as Experiment
            setCurrentExperiment(remoteExp)

            // We need to pass the remote experiment state down to LabTable
            // But LabTable manages its own state internally.
            // Ideally, we should lift state up, but for now we'll trigger a force update via a key or prop
        }
    }, [session?.experiment])

    const handleExperimentChange = async (updatedExperiment: Experiment) => {
        // This function will be called by LabTable whenever its state changes
        // We'll then sync it to the session
        await updateExperiment(updatedExperiment)
    }

    // Poll for session updates more aggressively if we're not seeing updates
    useEffect(() => {
        if (!roomCode) return
        // Force a re-fetch every 2 seconds to ensure we're not missing anything
        // The hook already polls, but this is a safety net for the experiment state
        const interval = setInterval(() => {
            // This is handled by useCollaboration hook, but we can add extra logic here if needed
        }, 2000)
        return () => clearInterval(interval)
    }, [roomCode])

    const [activeMobileTab, setActiveMobileTab] = useState<'shelf' | 'bench' | 'analysis'>('bench')
    const [addChemicalToTestTube, setAddChemicalToTestTube] = useState<((chemical: any) => void) | null>(null)
    const [addTestTubeFunc, setAddTestTubeFunc] = useState<(() => void) | null>(null)
    const [addBeakerFunc, setAddBeakerFunc] = useState<(() => void) | null>(null)
    const [openEquipmentPanel, setOpenEquipmentPanel] = useState(false)
    const [equipmentAttachments, setEquipmentAttachments] = useState<any[]>([])
    const [selectedTubeId, setSelectedTubeId] = useState('tube-1')
    const [selectedTubeContents, setSelectedTubeContents] = useState<any[]>([])
    const [availableTestTubes, setAvailableTestTubes] = useState<Array<{ id: string; contents: any[] }>>([])

    // Equipment Selection State
    const [isSelectionModalOpen, setIsSelectionModalOpen] = useState(false)
    const [pendingEquipmentId, setPendingEquipmentId] = useState<string | null>(null)

    // Refs
    const labTableRef = useRef<HTMLDivElement>(null)
    const reactionPanelRef = useRef<HTMLDivElement>(null)

    useDragScroll()

    useEffect(() => {
        if (!roomCode) {
            router.push('/collaborate')
        }
    }, [roomCode, router])

    useEffect(() => {
        if (session?.experiment) {
            setCurrentExperiment(session.experiment)
            if (session.experiment.reactionResult) {
                setReactionResult(session.experiment.reactionResult)
            }
        }
    }, [session?.experiment])

    // Mobile Scroll Effects
    useEffect(() => {
        const isMobile = window.innerWidth < 1024
        if (isMobile && labTableRef.current) {
            setTimeout(() => {
                labTableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }, 500)
        }
    }, [])

    useEffect(() => {
        const isMobile = window.innerWidth < 1024
        if (isMobile && reactionResult && reactionPanelRef.current) {
            setTimeout(() => {
                reactionPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }, 500)
        }
    }, [reactionResult])

    // Calculations
    const currentPH = selectedTubeContents.length > 0 ? formatPH(calculatePH(selectedTubeContents)) : 0

    const calculateTemperature = (): number => {
        const ROOM_TEMP = 25
        if (selectedTubeContents.length === 0) return -999

        let temperature = ROOM_TEMP
        const tubeAttachments = equipmentAttachments.filter(a => a.targetTubeId === selectedTubeId && a.isActive)

        const bunsenBurner = tubeAttachments.find(a => a.equipmentType === 'bunsen-burner')
        const hotPlate = tubeAttachments.find(a => a.equipmentType === 'hot-plate')
        const stirrer = tubeAttachments.find(a => a.equipmentType === 'magnetic-stirrer')

        if (bunsenBurner) temperature = ROOM_TEMP + ((bunsenBurner.settings.temperature || 0) / 1000) * 275
        if (hotPlate) temperature = Math.max(temperature, hotPlate.settings.temperature || 0)
        if (stirrer) temperature += ((stirrer.settings.rpm || 0) / 1500) * 2

        return Math.round(temperature * 10) / 10
    }

    const calculateWeight = (): number => {
        if (selectedTubeContents.length === 0) return 0
        let totalWeight = 0
        selectedTubeContents.forEach(content => {
            if (content.unit === 'g') totalWeight += content.amount
            else if (content.unit === 'ml') totalWeight += content.amount
            else if (content.unit === 'drops') totalWeight += content.amount * 0.05
        })
        return totalWeight
    }

    const handleJoin = async () => {
        // No manual join needed anymore, handled by useEffect
    }

    const handleReaction = async (experiment: Experiment) => {
        setIsReacting(true)
        setCurrentExperiment(experiment)

        // Optimistically update collaborators that a reaction is starting
        await updateExperiment({
            ...experiment,
            isReacting: true
        })

        try {
            const response = await fetch('/api/react', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(experiment)
            })

            const contentType = response.headers.get('content-type')
            if (contentType && contentType.includes('text/html')) {
                // If we get an HTML response (likely a 404 from Next.js because backend is down/wrong port)
                // We should parse the text to give a better error
                const text = await response.text()
                console.error('Received HTML response from backend:', text)
                throw new Error('Backend server error: Received HTML instead of JSON. Please check if Python backend is running on port 8000.')
            }

            if (response.ok) {
                const result = await response.json()
                setReactionResult(result)

                // Sync to participants with the result
                await updateExperiment({
                    ...experiment,
                    reactionResult: result,
                    isReacting: false
                })

                // Mobile switch tab
                if (window.innerWidth < 1024) {
                    setActiveMobileTab('analysis')
                }
            } else {
                throw new Error(`Reaction analysis failed with status: ${response.status}`)
            }
        } catch (error) {
            console.error('Reaction failed:', error)
            alert(error instanceof Error ? error.message : 'Reaction analysis failed')
            // Reset state on error
            await updateExperiment({
                ...experiment,
                isReacting: false
            })
        } finally {
            setIsReacting(false)
        }
    }

    const handleMouseMove = (e: React.MouseEvent) => {
        const x = (e.clientX / window.innerWidth) * 100
        const y = (e.clientY / window.innerHeight) * 100
        updateCursor(x, y)
    }

    const copyRoomCode = () => {
        if (roomCode) {
            navigator.clipboard.writeText(roomCode)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }

    // Equipment Handling
    const handleRequestEquipmentActivation = (equipmentId: string) => {
        setPendingEquipmentId(equipmentId)
        setIsSelectionModalOpen(true)
    }

    const handleEquipmentTubeSelected = (tubeId: string) => {
        if (!pendingEquipmentId) return
        setIsSelectionModalOpen(false)
        setSelectedTubeId(tubeId)

        const id = pendingEquipmentId
        const eq = EQUIPMENT_CONFIG.find(e => e.id === id)
        if (!eq) return

        let updatedAttachments = [...equipmentAttachments]

        // Exclusivity Logic
        if (id === 'bunsen-burner' || id === 'hot-plate') {
            const conflicting = updatedAttachments.find(a =>
                (a.equipmentType === 'bunsen-burner' || a.equipmentType === 'hot-plate') && a.targetTubeId === tubeId
            )
            if (conflicting) updatedAttachments = updatedAttachments.filter(a => a.equipmentId !== conflicting.equipmentId)
        }
        if (id === 'magnetic-stirrer' || id === 'centrifuge') {
            const conflicting = updatedAttachments.find(a =>
                (a.equipmentType === 'magnetic-stirrer' || a.equipmentType === 'centrifuge') && a.targetTubeId === tubeId
            )
            if (conflicting) updatedAttachments = updatedAttachments.filter(a => a.equipmentId !== conflicting.equipmentId)
        }

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

    if (status === 'loading') {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-950 dark:via-slate-900 dark:to-gray-900 flex items-center justify-center p-4">
                <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
        )
    }

    if (status === 'unauthenticated') {
        return null // Will redirect via useEffect
    }

    if (!isConnected && !session) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-950 dark:via-slate-900 dark:to-gray-900 flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md w-full shadow-2xl text-center"
                >
                    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Connecting to Lab...</h2>
                    <p className="text-gray-600 dark:text-gray-400">Please wait while we join the session.</p>
                </motion.div>
            </div>
        )
    }

    return (
        <div
            className="min-h-screen bg-elixra-cream dark:bg-elixra-charcoal relative overflow-hidden transition-colors duration-500"
            onMouseMove={handleMouseMove}
        >
            {/* Background Grid */}
            <StaticGrid className="opacity-30 fixed inset-0 z-0 pointer-events-none" />

            {/* Collaboration Status Bar */}
            <div className="relative z-20 bg-white/50 dark:bg-black/20 backdrop-blur-md border-b border-elixra-copper/10 px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button onClick={handleLeave} className="flex items-center gap-2 text-sm text-elixra-text-secondary hover:text-elixra-bunsen transition-colors">
                        <ArrowLeft className="w-4 h-4" />
                        <span className="hidden sm:inline">Leave</span>
                    </button>
                    <div className="h-4 w-px bg-elixra-copper/20" />
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className="text-sm font-medium text-elixra-text-primary">
                            {isConnected ? 'Connected' : 'Disconnected'}
                        </span>
                    </div>
                    <div className="hidden sm:flex items-center gap-2 px-2 py-1 bg-elixra-bunsen/10 rounded-md">
                        <span className="text-xs font-mono text-elixra-bunsen">{roomCode}</span>
                        <button onClick={copyRoomCode} className="text-elixra-bunsen hover:opacity-80">
                            {copied ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        </button>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-elixra-text-secondary" />
                    <div className="flex -space-x-2">
                        {session?.participants.map((p) => (
                            <div
                                key={p.userId}
                                className="w-6 h-6 rounded-full border-2 border-white dark:border-gray-800 flex items-center justify-center text-[10px] text-white font-bold"
                                style={{ backgroundColor: p.color }}
                                title={p.name}
                            >
                                {p.name[0]}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="h-[calc(100vh-8.5rem)] lg:h-[calc(100vh-7rem)] grid grid-cols-1 lg:grid-cols-[320px_1fr_380px] gap-3 sm:gap-4 p-2 sm:p-4 relative z-10 pb-20 lg:pb-4">

                {/* Left Panel - Chemical Shelf */}
                <motion.div
                    initial={{ x: -100, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    className={`${activeMobileTab === 'shelf' ? 'flex' : 'hidden'} lg:flex h-full glass-panel rounded-3xl transition-all duration-300 overflow-hidden flex-col`}
                >
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
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <ChemicalShelf onAddChemicalToTestTube={(chemical) => {
                            if (addChemicalToTestTube) addChemicalToTestTube(chemical)
                            if (window.innerWidth < 1024) setActiveMobileTab('bench')
                        }} />
                    </div>
                </motion.div>

                {/* Center Panel - Lab Bench */}
                <motion.div
                    initial={{ y: 100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className={`${activeMobileTab === 'bench' ? 'flex' : 'hidden'} lg:flex h-full bg-elixra-cream/80 dark:bg-white/5 backdrop-blur-xl border border-elixra-copper/10 rounded-3xl transition-all duration-300 overflow-hidden flex-col shadow-inner relative`}
                    ref={labTableRef}
                >
                    <div className="flex-shrink-0 p-4 border-b border-elixra-copper/10 bg-elixra-cream/30 dark:bg-white/5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-elixra-bunsen/10 rounded-lg">
                                    <FlaskConical className="w-5 h-5 text-elixra-bunsen" />
                                </div>
                                <h2 className="text-lg font-bold text-elixra-text-primary">Lab Bench</h2>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setOpenEquipmentPanel(true)}
                                    className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 rounded-lg border border-orange-500/20 transition-all font-medium"
                                >
                                    <Flame className="w-4 h-4" />
                                    <span>Equipment</span>
                                </button>
                                <button
                                    onClick={() => {
                                        if (addTestTubeFunc) addTestTubeFunc()
                                        else (window as any).__addTestTube?.()
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

                    <div className="flex-1 overflow-y-auto custom-scrollbar relative">
                        <div className="lg:hidden absolute top-2 right-2 z-10">
                            <button
                                onClick={() => setOpenEquipmentPanel(true)}
                                className="p-2 bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 rounded-lg border border-orange-500/20 shadow-sm backdrop-blur-sm"
                            >
                                <Flame className="w-5 h-5" />
                            </button>
                        </div>

                        <LabTable
                            onReaction={handleReaction}
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
                            externalExperimentState={currentExperiment}
                            onExperimentStateChange={handleExperimentChange}
                        />
                    </div>
                </motion.div>

                {/* Right Panel - Analysis */}
                <motion.div
                    ref={reactionPanelRef}
                    initial={{ x: 100, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    className={`${activeMobileTab === 'analysis' ? 'flex' : 'hidden'} lg:flex h-full glass-panel rounded-3xl transition-all duration-300 overflow-hidden flex-col ${reactionResult ? 'border-elixra-bunsen/50 shadow-lg shadow-elixra-bunsen/20' : ''}`}
                >
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
                        </div>
                    </div>
                    <div className="flex-1 lg:overflow-y-auto custom-scrollbar">
                        <ReactionPanel
                            experiment={currentExperiment}
                            result={reactionResult}
                            isLoading={isReacting}
                        />
                    </div>
                </motion.div>
            </div>

            {/* Mobile Navigation */}
            <div className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-white dark:bg-elixra-charcoal border-t border-elixra-copper/10 z-50 px-4 flex items-center justify-around shadow-lg-up pb-safe">
                <button
                    onClick={() => setActiveMobileTab('shelf')}
                    className={`flex flex-col items-center justify-center space-y-1 w-20 py-1 rounded-xl transition-all ${activeMobileTab === 'shelf' ? 'text-elixra-bunsen bg-elixra-bunsen/10' : 'text-gray-400 hover:text-gray-500'
                        }`}
                >
                    <Sparkles className="w-6 h-6" />
                    <span className="text-[10px] font-medium">Shelf</span>
                </button>
                <button
                    onClick={() => setActiveMobileTab('bench')}
                    className={`flex flex-col items-center justify-center space-y-1 w-20 py-1 rounded-xl transition-all ${activeMobileTab === 'bench' ? 'text-elixra-bunsen bg-elixra-bunsen/10' : 'text-gray-400 hover:text-gray-500'
                        }`}
                >
                    <FlaskConical className="w-6 h-6" />
                    <span className="text-[10px] font-medium">Bench</span>
                </button>
                <button
                    onClick={() => setActiveMobileTab('analysis')}
                    className={`flex flex-col items-center justify-center space-y-1 w-20 py-1 rounded-xl transition-all relative ${activeMobileTab === 'analysis' ? 'text-elixra-bunsen bg-elixra-bunsen/10' : 'text-gray-400 hover:text-gray-500'
                        }`}
                >
                    <ClipboardList className="w-6 h-6" />
                    <span className="text-[10px] font-medium">Analysis</span>
                    {reactionResult && (
                        <span className="absolute top-1 right-5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white dark:border-elixra-charcoal"></span>
                    )}
                </button>
            </div>

            {/* Collaborative Elements */}
            <CollaborationNotifications session={session} userId={userId} />

            <AnimatePresence>
                {session?.participants
                    .filter(p => p.userId !== userId && p.cursor)
                    .map((participant) => (
                        <motion.div
                            key={participant.userId}
                            className="fixed pointer-events-none z-50"
                            style={{
                                left: `${participant.cursor!.x}%`,
                                top: `${participant.cursor!.y}%`
                            }}
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0 }}
                        >
                            <div className="relative">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                    <path d="M5.65376 12.3673L13.1844 4.83666L15.2653 6.91751L7.73469 14.4481L5.65376 12.3673Z" fill={participant.color} />
                                    <path d="M13.1844 4.83666L19.2653 10.9176L12.9653 17.2176L6.88439 11.1367L13.1844 4.83666Z" fill={participant.color} />
                                </svg>
                                <div
                                    className="absolute top-6 left-6 px-2 py-1 rounded text-xs font-medium text-white whitespace-nowrap shadow-lg"
                                    style={{ backgroundColor: participant.color }}
                                >
                                    {participant.name}
                                </div>
                            </div>
                        </motion.div>
                    ))}
            </AnimatePresence>

            {/* Equipment Panel & Modals */}
            <EquipmentPanel
                onEquipmentChange={setEquipmentAttachments}
                currentAttachments={equipmentAttachments}
                selectedTubeId={selectedTubeId}
                hideFloatingButton={true}
                externalIsOpen={openEquipmentPanel}
                onClose={() => setOpenEquipmentPanel(false)}
                currentPH={currentPH}
                currentTemperature={calculateTemperature()}
                currentWeight={calculateWeight()}
                onRequestActivation={handleRequestEquipmentActivation}
            />

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

            <SaveConfirmation
                isVisible={saveStatus.isVisible}
                message={saveStatus.message}
                type={saveStatus.type}
                onClose={() => setSaveStatus(prev => ({ ...prev, isVisible: false }))}
            />

            <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(46, 107, 107, 0.1); border-radius: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(46, 107, 107, 0.3); border-radius: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(46, 107, 107, 0.5); }
        .custom-scrollbar { scrollbar-width: thin; scrollbar-color: rgba(46, 107, 107, 0.3) rgba(46, 107, 107, 0.1); }
      `}</style>
        </div>
    )
}

export default function CollaborativeLabPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-950 dark:via-slate-900 dark:to-gray-900 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-600 dark:text-gray-400">Loading collaboration...</p>
                </div>
            </div>
        }>
            <CollaborativeLabContent />
        </Suspense>
    )
}
