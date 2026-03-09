'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Atom as AtomIcon,
  Plus,
  Trash2,
  RotateCw,
  Sparkles,
  Search,
  Filter,
  Undo2,
  Redo2,
  Mic,
  MicOff,
  ChevronLeft,
  ChevronRight,
  Info,
  Settings,
  Zap,
  Save,
  Download
} from 'lucide-react'
import ModernNavbar from '@/components/ModernNavbar'
import SaveConfirmation from '@/components/SaveConfirmation'
import dynamic from 'next/dynamic'
import MoleculeDropZone from '@/components/MoleculeDropZone'
import { PerspectiveGrid, StaticGrid } from '@/components/GridBackground'
import { SpatialHash, BondCalculationWorker, PerformanceMonitor } from '@/lib/spatialHash'
import { PERIODIC_TABLE, PeriodicElement } from '@/lib/periodicTable'
import { Element } from '@/types/molecule'
import { validateMolecule, ChemicalValidator, ValidationResult, calculateOptimalBondPosition } from '@/lib/chemicalValidation'
import { MOLECULAR_TEMPLATES, MolecularTemplate, searchTemplates } from '@/lib/molecularTemplates'
import { EnhancedAIAnalyzer, EnhancedAnalysis } from '@/lib/enhancedAIAnalysis'
import { UndoRedoManager, ACTION_TYPES, createActionDescription } from '@/lib/undoRedo'
import VoiceCommandSystem from '@/components/VoiceCommandSystem'
import PeriodicTable from '@/components/PeriodicTable'
import AtomBondDialog from '@/components/AtomBondDialog'
import { useAutoScroll } from '@/hooks/useAutoScroll'
import AutoScrollIndicator from '@/components/AutoScrollIndicator'

const EnhancedMolecule3DViewer = dynamic(() => import('@/components/EnhancedMolecule3DViewer'), {
  ssr: false,
  loading: () => (
    <div className="h-[500px] w-full bg-elixra-charcoal/10 dark:bg-white/10 animate-pulse rounded-lg flex items-center justify-center text-elixra-secondary">
      Loading 3D Viewer...
    </div>
  )
})

import { Atom, Bond } from '@/types/molecule'
import { getBackendUrl } from '@/lib/api-config'
import { ChemicalContent, ReactionResult } from '@/types/chemistry'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import {
  calculateBonds,
  getMolecularFormula,
  calculateMolecularWeight,
  updateBondsOnMove,
  canFormBond,
} from '@/lib/bondingLogic'

export default function EnhancedMoleculesPage() {
  const router = useRouter()
  const { isAuthenticated, isLoading, saveExperiment, syncExperiments, experiments } = useAuth()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/auth/signin')
    }
  }, [isLoading, isAuthenticated, router])

  const [atoms, setAtoms] = useState<Atom[]>([])
  const [bonds, setBonds] = useState<Bond[]>([])
  const [selectedElement, setSelectedElement] = useState<PeriodicElement | null>(null)
  const [moleculeName, setMoleculeName] = useState('Custom Molecule')
  const [analysis, setAnalysis] = useState<EnhancedAnalysis | null>(null)
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [selectedAtomId, setSelectedAtomId] = useState<string | null>(null)
  const [selectedBondId, setSelectedBondId] = useState<string | null>(null)
  const [showBondDialog, setShowBondDialog] = useState(false)
  const [pendingDropElement, setPendingDropElement] = useState<Element | null>(null)
  const [pendingDropPosition, setPendingDropPosition] = useState<{ x: number; y: number; z: number } | null>(null)

  // Save/Export states
  const [isSaving, setIsSaving] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [saveStatus, setSaveStatus] = useState<{ isVisible: boolean; message: string; type: 'success' | 'error' }>({
    isVisible: false,
    message: '',
    type: 'success'
  })

  // Performance optimization
  const orbitControlsRef = useRef<any>(null)
  const spatialHashRef = useRef<SpatialHash>(new SpatialHash())
  const bondWorkerRef = useRef<BondCalculationWorker>(new BondCalculationWorker())
  const performanceMonitorRef = useRef<PerformanceMonitor>(new PerformanceMonitor())
  const undoRedoManagerRef = useRef<UndoRedoManager>(new UndoRedoManager())
  const aiAnalyzerRef = useRef<EnhancedAIAnalyzer>(EnhancedAIAnalyzer.getInstance())

  // UI states
  const [showPeriodicTable, setShowPeriodicTable] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [showValidation, setShowValidation] = useState(false)
  const [isVoiceListening, setIsVoiceListening] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [templateSearch, setTemplateSearch] = useState('')
  const [qualityLevel, setQualityLevel] = useState('high')
  const [fps, setFPS] = useState(60)
  const [showAdvancedControls, setShowAdvancedControls] = useState(false)

  // Auto-scroll hook
  const { showIndicator: showScrollIndicator } = useAutoScroll({
    threshold: 50,
    maxSpeed: 100
  })

  // Initialize performance monitoring
  useEffect(() => {
    performanceMonitorRef.current.start()
    const monitor = performanceMonitorRef.current
    const unsubscribe = monitor.onFPSChange((newFPS, newQuality) => {
      setFPS(newFPS)
      setQualityLevel(newQuality)
    })

    return () => {
      monitor.stop()
      unsubscribe()
    }
  }, [])

  // Initialize undo/redo manager
  useEffect(() => {
    const unsubscribe = undoRedoManagerRef.current.addListener((state) => {
      setAtoms(state.atoms)
      setBonds(state.bonds)
    })

    return () => unsubscribe()
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') {
        return
      }

      // Hotkeys only work on desktop
      if (window.innerWidth < 1024) return

      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'z':
            e.preventDefault()
            if (e.shiftKey) {
              handleRedo()
            } else {
              handleUndo()
            }
            break
          case 'y':
            e.preventDefault()
            handleRedo()
            break
          case 'e':
            e.preventDefault()
            setShowPeriodicTable(true)
            break
          case 't':
            e.preventDefault()
            setShowTemplates(true)
            break
          case 'a':
            e.preventDefault()
            handleAnalyze()
            break
          case 'v':
            e.preventDefault()
            setIsVoiceListening(!isVoiceListening)
            break
        }
      }

      // Template hotkeys
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        const template = MOLECULAR_TEMPLATES.find(t => t.hotkey === e.key.toLowerCase())
        if (template) {
          loadTemplate(template)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Lock body scroll when modals are open
  useEffect(() => {
    if (showPeriodicTable || showTemplates || showAnalysis || showValidation || showBondDialog) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [showPeriodicTable, showTemplates, showAnalysis, showValidation, showBondDialog])

  const handleDropAtom = (element: Element, position?: { x: number; y: number; z: number }) => {
    setPendingDropElement(element)
    setPendingDropPosition(position || null)
    setShowBondDialog(true)
  }

  const loadTemplate = (template: MolecularTemplate) => {
    // Scale template atoms to prevent visual overlapping (increase bond length)
    const SCALE = 2.0
    const newState = {
      atoms: template.atoms.map(atom => ({
        ...atom,
        x: atom.x * SCALE,
        y: atom.y * SCALE,
        z: atom.z * SCALE
      })),
      bonds: template.bonds.map(bond => ({ ...bond })),
      timestamp: Date.now(),
      action: ACTION_TYPES.LOAD_TEMPLATE,
      description: `Loaded ${template.name}`
    }

    setAtoms(newState.atoms)
    setBonds(newState.bonds)
    setMoleculeName(template.name)
    setSelectedAtomId(null)
    setSelectedBondId(null)

    undoRedoManagerRef.current.recordState(
      newState.atoms,
      newState.bonds,
      ACTION_TYPES.LOAD_TEMPLATE,
      `Loaded ${template.name}`
    )
  }

  const addAtom = useCallback((element?: Element, position?: { x: number; y: number; z: number } | null, bondsToCreate?: Array<{ atomId: string; bondType: 'single' | 'double' | 'triple' | 'ionic' | 'hydrogen' | 'dative' }>) => {
    if (!element) return

    // If we have existing atoms and bonds are not specified, open the dialog to let user configure bonding
    if (atoms.length > 0 && !bondsToCreate) {
      setPendingDropElement(element)
      setPendingDropPosition(position || null)
      setShowBondDialog(true)
      return
    }

    let finalPosition: { x: number; y: number; z: number } | null = null

    // Determine the reference atom for positioning
    const referenceAtomId = bondsToCreate && bondsToCreate.length > 0 ? bondsToCreate[0].atomId : null

    // If this is the first atom and no position specified, place at origin
    if (atoms.length === 0 && !position && !referenceAtomId) {
      finalPosition = { x: 0, y: 0, z: 0 }
    } else {
      // Always find a position that's 3+ units away from ALL atoms
      let attempts = 0
      const maxAttempts = 100

      while (!finalPosition && attempts < maxAttempts) {
        let candidatePos: { x: number; y: number; z: number }

        if (referenceAtomId) {
          const referenceAtom = atoms.find(a => a.id === referenceAtomId)
          if (!referenceAtom) break

          // Use optimal positioning logic for symmetry
          candidatePos = calculateOptimalBondPosition(referenceAtom, atoms, 2.5)
          finalPosition = candidatePos
          break // Found optimal position
        } else {
          // Random position in space
          candidatePos = {
            x: Math.random() * 8 - 4,
            y: Math.random() * 8 - 4,
            z: Math.random() * 8 - 4
          }
        }

        // Check if this position is 3+ units from ALL existing atoms
        const isValid = atoms.every(atom => {
          const dx = atom.x - candidatePos.x
          const dy = atom.y - candidatePos.y
          const dz = atom.z - candidatePos.z
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
          return dist >= 3.0
        })

        if (isValid) {
          finalPosition = candidatePos
        }
        attempts++
      }

      // If no valid position found, place it anyway
      if (!finalPosition) {
        finalPosition = {
          x: Math.random() * 10 - 5,
          y: Math.random() * 10 - 5,
          z: Math.random() * 10 - 5
        }
      }
    }

    if (!finalPosition) {
      // This should theoretically not happen due to the logic above, but for type safety:
      finalPosition = { x: 0, y: 0, z: 0 }
    }

    const newAtom: Atom = {
      id: `atom-${Date.now()}`,
      element: element.symbol,
      x: finalPosition.x,
      y: finalPosition.y,
      z: finalPosition.z,
      color: element.color
    }

    const updatedAtoms = [...atoms, newAtom]
    setAtoms(updatedAtoms)

    // Create bonds if specified
    if (bondsToCreate && bondsToCreate.length > 0) {
      const newBonds = bondsToCreate.map((bond, index) => ({
        id: `bond-${Date.now()}-${index}`,
        from: bond.atomId,
        to: newAtom.id,
        type: bond.bondType
      }))
      setBonds([...bonds, ...newBonds])

      undoRedoManagerRef.current.recordState(
        updatedAtoms,
        [...bonds, ...newBonds],
        ACTION_TYPES.ADD_ATOM,
        `Added ${element.name} with bonds`
      )
    } else {
      // Calculate bonds automatically
      const newBonds = calculateBonds(updatedAtoms)
      setBonds(newBonds)

      undoRedoManagerRef.current.recordState(
        updatedAtoms,
        newBonds,
        ACTION_TYPES.ADD_ATOM,
        `Added ${element.name}`
      )
    }
  }, [atoms, bonds])

  const removeAtom = useCallback((id: string) => {
    const updatedAtoms = atoms.filter(a => a.id !== id)
    const updatedBonds = bonds.filter(b => b.from !== id && b.to !== id)

    setAtoms(updatedAtoms)
    setBonds(updatedBonds)
    setSelectedAtomId(null)

    undoRedoManagerRef.current.recordState(
      updatedAtoms,
      updatedBonds,
      ACTION_TYPES.REMOVE_ATOM,
      'Removed atom'
    )
  }, [atoms, bonds])

  const removeBond = useCallback((id: string) => {
    const updatedBonds = bonds.filter(b => b.id !== id)
    setBonds(updatedBonds)
    setSelectedBondId(null)

    undoRedoManagerRef.current.recordState(
      atoms,
      updatedBonds,
      ACTION_TYPES.REMOVE_BOND,
      'Removed bond'
    )
  }, [atoms, bonds])

  const changeBondType = useCallback((bondId: string, newType: 'single' | 'double' | 'triple' | 'ionic' | 'hydrogen') => {
    const bond = bonds.find(b => b.id === bondId)
    if (!bond) return

    const fromAtom = atoms.find(a => a.id === bond.from)
    const toAtom = atoms.find(a => a.id === bond.to)

    if (!fromAtom || !toAtom) return

    if (canFormBond(fromAtom, toAtom, bonds, newType)) {
      const updatedBonds = bonds.map(b => b.id === bondId ? { ...b, type: newType } : b)
      setBonds(updatedBonds)

      undoRedoManagerRef.current.recordState(
        atoms,
        updatedBonds,
        ACTION_TYPES.CHANGE_BOND_TYPE,
        `Changed to ${newType} bond`
      )
    }
  }, [atoms, bonds])

  const clearAll = useCallback(() => {
    setAtoms([])
    setBonds([])
    setMoleculeName('Custom Molecule')
    setSelectedAtomId(null)
    setSelectedBondId(null)
    setAnalysis(null)
    setValidation(null)

    undoRedoManagerRef.current.recordState(
      [],
      [],
      ACTION_TYPES.CLEAR_SCENE,
      'Cleared scene'
    )
  }, [])

  // Real-time validation
  useEffect(() => {
    if (atoms.length > 0) {
      const result = validateMolecule(atoms, bonds)
      setValidation(result)
    } else {
      setValidation(null)
    }
  }, [atoms, bonds])

  const handleAnalyze = useCallback(async (silent = false) => {
    if (atoms.length === 0) return

    setAnalyzing(true)
    try {
      const formula = getMolecularFormula(atoms)
      const analysis = await aiAnalyzerRef.current.analyzeMolecule(atoms, bonds)
      setAnalysis(analysis)
      if (!silent) setShowAnalysis(true)
    } catch (error) {
      console.error('Analysis failed:', error)
    } finally {
      setAnalyzing(false)
    }
  }, [atoms, bonds])

  const handleSave = async () => {
    if (atoms.length === 0) return

    // 1. Map Atoms to Chemicals
    const chemicalsMap = new Map<string, { count: number, element: string }>()
    atoms.forEach(atom => {
      const current = chemicalsMap.get(atom.element) || { count: 0, element: atom.element }
      chemicalsMap.set(atom.element, { count: current.count + 1, element: atom.element })
    })

    const chemicals: ChemicalContent[] = Array.from(chemicalsMap.values()).map(item => ({
      chemical: {
        id: item.element.toLowerCase(),
        name: item.element,
        formula: item.element,
        color: '#ffffff', // default
        state: 'solid', // default
        category: 'Other'
      },
      amount: item.count,
      unit: 'mol' // using mol as a proxy for atom count
    }))

    // 2. Map Analysis to ReactionResult
    const formula = getMolecularFormula(atoms)
    const reactionDetails: ReactionResult = {
      balancedEquation: formula,
      reactionType: 'Molecular Structure',
      visualObservation: `Structure with ${atoms.length} atoms and ${bonds.length} bonds.`,
      color: 'N/A',
      smell: 'N/A',
      temperatureChange: 'none',
      gasEvolution: null,
      emission: null,
      stateChange: null,
      phChange: null,
      productsInfo: [],
      explanation: {
        mechanism: analysis?.structure.geometry || 'N/A',
        bondBreaking: `Contains ${bonds.length} bonds.`,
        energyProfile: 'Stable structure',
        atomicLevel: `Hybridization: ${Object.values(analysis?.structure.hybridization || {}).join(', ') || 'N/A'}`,
        keyConcept: analysis?.properties.polarity || 'Molecular Chemistry'
      },
      safety: {
        riskLevel: analysis?.safety.toxicity || 'Unknown',
        precautions: analysis?.safety.handling.join(', ') || 'Handle with care',
        disposal: 'Standard chemical disposal',
        firstAid: 'Standard first aid',
        generalHazards: 'N/A'
      },
      precipitate: false,
      products: [],
      observations: [],
      confidence: 1.0
    }

    const experimentData = {
      name: moleculeName,
      chemicals: chemicals,
      reactionDetails: reactionDetails,
      savedAt: new Date().toISOString(),
      isSaved: true,
      glassware: [] // Empty for molecule editor
    }

    setIsSaving(true)
    try {
      // @ts-ignore
      await saveExperiment(experimentData)
      setSaveStatus({ isVisible: true, message: 'Structure saved to history!', type: 'success' })
      await syncExperiments()
    } catch (error) {
      console.error('Save failed', error)
      setSaveStatus({ isVisible: true, message: 'Failed to save.', type: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleExport = async () => {
    if (atoms.length === 0) return

    setIsExporting(true)
    try {
      const { generateExperimentPDF } = await import('@/lib/pdfExport')

      // Mock Experiment data for the PDF generator
      const chemicalsMap = new Map<string, { count: number, element: string }>()
      atoms.forEach(atom => {
        const current = chemicalsMap.get(atom.element) || { count: 0, element: atom.element }
        chemicalsMap.set(atom.element, { count: current.count + 1, element: atom.element })
      })

      const chemicals: ChemicalContent[] = Array.from(chemicalsMap.values()).map(item => ({
        chemical: {
          id: item.element.toLowerCase(),
          name: item.element,
          formula: item.element,
          color: '#ffffff',
          state: 'solid',
          category: 'Other'
        },
        amount: item.count,
        unit: 'mol'
      }))

      const formula = getMolecularFormula(atoms)

      await generateExperimentPDF({
        experiment: {
          name: moleculeName,
          chemicals: chemicals,
          glassware: []
        },
        result: {
          balancedEquation: formula,
          reactionType: 'Molecular Structure',
          visualObservation: `Structure with ${atoms.length} atoms and ${bonds.length} bonds.`,
          color: 'N/A',
          smell: 'N/A',
          temperatureChange: 'none',
          gasEvolution: null,
          emission: null,
          stateChange: null,
          phChange: null,
          productsInfo: [],
          explanation: {
            mechanism: analysis?.structure.geometry || 'N/A',
            bondBreaking: `Contains ${bonds.length} bonds.`,
            energyProfile: 'Stable structure',
            atomicLevel: `Hybridization: ${Object.values(analysis?.structure.hybridization || {}).join(', ') || 'N/A'}`,
            keyConcept: analysis?.properties.polarity || 'Molecular Chemistry'
          },
          safety: {
            riskLevel: analysis?.safety.toxicity || 'Unknown',
            precautions: analysis?.safety.handling.join(', ') || 'Handle with care',
            disposal: 'Standard chemical disposal',
            firstAid: 'Standard first aid',
            generalHazards: 'N/A'
          },
          precipitate: false,
          products: [],
          observations: [],
          confidence: 1.0
        },
        date: new Date(),
        author: 'Lab User'
      })
    } catch (error) {
      console.error('Export failed:', error)
      alert('Failed to export PDF')
    } finally {
      setIsExporting(false)
    }
  }

  // Auto-analyze on structural changes (debounced)
  useEffect(() => {
    if (atoms.length === 0) return

    const timer = setTimeout(() => {
      handleAnalyze(true)
    }, 2000) // 2 second debounce

    return () => clearTimeout(timer)
  }, [atoms, bonds, handleAnalyze])

  const handleValidate = () => {
    setShowValidation(true)
  }

  const autoCompleteWithHydrogen = () => {
    const validator = new ChemicalValidator(atoms, bonds)
    const { newAtoms, newBonds } = validator.autoCompleteWithHydrogen()

    if (newAtoms.length === 0) return

    const updatedAtoms = [...atoms, ...newAtoms]
    const updatedBonds = [...bonds, ...newBonds]

    setAtoms(updatedAtoms)
    setBonds(updatedBonds)

    undoRedoManagerRef.current.recordState(
      updatedAtoms,
      updatedBonds,
      ACTION_TYPES.AUTO_COMPLETE,
      'Auto-completed with hydrogen'
    )
  }

  const handleUndo = () => {
    undoRedoManagerRef.current.undo()
  }

  const handleRedo = () => {
    undoRedoManagerRef.current.redo()
  }

  const handleSelectAtom = useCallback((atomId: string) => {
    setSelectedAtomId(atomId)
    setSelectedBondId(null)
  }, [])

  const handleSelectBond = useCallback((bondId: string) => {
    setSelectedBondId(bondId)
    setSelectedAtomId(null)
  }, [])

  const handleCanvasClick = useCallback(() => {
    setSelectedAtomId(null)
    setSelectedBondId(null)
  }, [])

  const handleGenerateMolecule = async (query: string) => {
    setIsGenerating(true)

    try {
      const backendUrl = getBackendUrl()
      const res = await fetch(`${backendUrl}/generate-molecule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      })

      if (!res.ok) throw new Error("Failed to generate structure")

      const template = await res.json()

      // Ensure IDs are unique
      const uniqueSuffix = Date.now()
      template.atoms = template.atoms.map((a: any) => ({ ...a, id: `${a.id}-${uniqueSuffix}` }))
      template.bonds = template.bonds.map((b: any) => ({
        ...b,
        id: `${b.id}-${uniqueSuffix}`,
        from: `${b.from}-${uniqueSuffix}`,
        to: `${b.to}-${uniqueSuffix}`
      }))

      loadTemplate(template)

      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(`Generated structure for ${template.name}`)
        window.speechSynthesis.speak(u)
      }

    } catch (e) {
      console.error(e)
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(`Sorry, I couldn't generate structure for ${query}`)
        window.speechSynthesis.speak(u)
      }
    } finally {
      setIsGenerating(false)
    }
  }

  const handleVoiceCommand = (command: any) => {
    switch (command.action) {
      case 'GENERATE_MOLECULE':
        if (command.data?.query) {
          handleGenerateMolecule(command.data.query)
        }
        break
      case 'ADD_ELEMENT':
        if (command.data?.element) {
          const element = PERIODIC_TABLE.find(e =>
            e.symbol.toLowerCase() === command.data.element.toLowerCase() ||
            e.name.toLowerCase() === command.data.element.toLowerCase()
          )
          if (element) {
            addAtom(element)
          }
        }
        break
      case 'ADD_COMPLEX':
        {
          const { subjectElement, count, bondType, targetElement } = command.data
          const targetEl = PERIODIC_TABLE.find(e => e.symbol === targetElement)
          const subjectEl = PERIODIC_TABLE.find(e => e.symbol === subjectElement)

          if (targetEl && subjectEl) {
            // Create a local copy of state to build the structure
            const currentAtoms = [...atoms]
            const currentBonds = [...bonds]

            // 1. Create Target Atom
            // Find a good spot - if empty, 0,0,0. If not, random/offset.
            let targetPos = { x: 0, y: 0, z: 0 }
            if (currentAtoms.length > 0) {
              targetPos = { x: Math.random() * 4 - 2, y: Math.random() * 4 - 2, z: Math.random() * 4 - 2 }
            }

            const targetId = `atom-${Date.now()}-target`
            const targetAtom: Atom = {
              id: targetId,
              element: targetEl.symbol,
              x: targetPos.x,
              y: targetPos.y,
              z: targetPos.z,
              color: targetEl.color
            }
            currentAtoms.push(targetAtom)

            // 2. Add Subjects bonded to Target
            for (let i = 0; i < count; i++) {
              // Use existing logic to find spot relative to target
              const pos = calculateOptimalBondPosition(targetAtom, currentAtoms, 2.0)

              const subjectId = `atom-${Date.now()}-sub-${i}`
              const subjectAtom: Atom = {
                id: subjectId,
                element: subjectEl.symbol,
                x: pos.x,
                y: pos.y,
                z: pos.z,
                color: subjectEl.color
              }
              currentAtoms.push(subjectAtom)

              currentBonds.push({
                id: `bond-${Date.now()}-sub-${i}`,
                from: targetId,
                to: subjectId,
                type: bondType
              })
            }

            setAtoms(currentAtoms)
            setBonds(currentBonds)

            undoRedoManagerRef.current.recordState(
              currentAtoms,
              currentBonds,
              ACTION_TYPES.ADD_ATOM,
              `Added ${count} ${subjectEl.name} to ${targetEl.name}`
            )
          }
        }
        break
      case 'LOAD_TEMPLATE':
        if (command.data?.template) {
          const template = MOLECULAR_TEMPLATES.find(t => t.id === command.data.template)
          if (template) {
            loadTemplate(template)
          }
        }
        break
      case 'CLEAR_SCENE':
        clearAll()
        break
      case 'UNDO':
        handleUndo()
        break
      case 'REDO':
        handleRedo()
        break
      case 'ANALYZE':
        handleAnalyze()
        break
      case 'VALIDATE':
        handleValidate()
        break
      case 'AUTO_COMPLETE':
        autoCompleteWithHydrogen()
        break
    }
  }

  // Mobile Tab State
  const [activeMobileTab, setActiveMobileTab] = useState<'editor' | 'library' | 'analysis'>('editor')

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
    <div className="min-h-screen bg-elixra-cream dark:bg-elixra-charcoal relative overflow-hidden transition-colors duration-300">
      <PerspectiveGrid />

      <AutoScrollIndicator isVisible={showScrollIndicator} />

      {/* Bond Dialog */}
      {showBondDialog && pendingDropElement && (
        <AtomBondDialog
          newElement={pendingDropElement}
          existingAtoms={atoms}
          onConfirm={(bonds) => {
            setShowBondDialog(false)
            addAtom(pendingDropElement, pendingDropPosition, bonds)
            setPendingDropElement(null)
            setPendingDropPosition(null)
          }}
          onCancel={() => {
            setShowBondDialog(false)
            setPendingDropElement(null)
            setPendingDropPosition(null)
          }}
        />
      )}

      {/* Periodic Table Modal */}
      <AnimatePresence>
        {showPeriodicTable && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center p-4 pt-32"
            onClick={() => setShowPeriodicTable(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass-panel bg-white/90 dark:bg-elixra-charcoal/90 backdrop-blur-xl border border-elixra-border-subtle rounded-2xl p-6 w-full max-w-6xl max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg md:text-2xl font-bold text-elixra-charcoal dark:text-white whitespace-nowrap">
                  Periodic Table of Elements
                </h2>
                <button
                  onClick={() => setShowPeriodicTable(false)}
                  className="p-2 rounded-lg glass-panel bg-white/40 dark:bg-white/10 border border-elixra-border-subtle hover:border-elixra-bunsen/30 transition-all"
                >
                  ✕
                </button>
              </div>
              <PeriodicTable
                onElementSelect={(element) => {
                  setSelectedElement(element)
                  setShowPeriodicTable(false)
                  // On mobile, switch to editor after selection
                  if (window.innerWidth < 1024) {
                    setActiveMobileTab('editor')
                  }
                }}
                selectedElement={selectedElement?.symbol || null}
                className="max-w-5xl overflow-x-auto pb-4"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Templates Modal */}
      <AnimatePresence>
        {showTemplates && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center p-4 pt-24"
            onClick={() => setShowTemplates(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass-panel bg-white/90 dark:bg-elixra-charcoal/90 backdrop-blur-xl border border-elixra-border-subtle rounded-2xl p-6 w-full max-w-5xl max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl md:text-2xl font-bold text-elixra-charcoal dark:text-white">
                    Molecular Templates Library
                  </h2>
                  <button
                    onClick={() => setShowTemplates(false)}
                    className="p-2 rounded-lg glass-panel bg-white/40 dark:bg-white/10 border border-elixra-border-subtle hover:border-elixra-bunsen/30 transition-all"
                  >
                    ✕
                  </button>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-elixra-secondary" />
                  <input
                    type="text"
                    placeholder="Search templates by name, formula, or tags..."
                    value={templateSearch}
                    onChange={(e) => setTemplateSearch(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 glass-panel bg-white/60 dark:bg-white/10 border border-elixra-border-subtle rounded-xl focus:border-elixra-bunsen focus:ring-1 focus:ring-elixra-bunsen/50 transition-all text-sm"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[50vh] overflow-y-auto">
                  {searchTemplates(templateSearch).map(template => (
                    <motion.button
                      key={template.id}
                      onClick={() => {
                        loadTemplate(template)
                        setShowTemplates(false)
                        // On mobile, switch to editor
                        if (window.innerWidth < 1024) {
                          setActiveMobileTab('editor')
                        }
                      }}
                      className="glass-panel bg-white/90 dark:bg-elixra-charcoal/90 backdrop-blur-xl border border-elixra-border-subtle rounded-xl p-4 transition-all text-left shadow-lg"
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="font-bold text-elixra-charcoal dark:text-white text-lg truncate pr-2">
                          {template.name}
                        </div>
                        {template.hotkey && (
                          <div className="px-2 py-1 bg-elixra-bunsen text-white text-xs rounded font-mono font-bold shadow-sm hidden sm:block">
                            {template.hotkey.toUpperCase()}
                          </div>
                        )}
                      </div>

                      <div className="text-sm text-elixra-charcoal/90 dark:text-white/90 mb-2 font-medium">
                        {template.formula} • {template.molecularWeight.toFixed(1)} g/mol
                      </div>

                      <div className="text-xs text-elixra-charcoal/70 dark:text-white/70 mb-3 line-clamp-2">
                        {template.description}
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {template.tags.slice(0, 3).map(tag => (
                          <span key={tag} className="px-2 py-1 bg-elixra-bunsen text-white text-xs rounded font-bold shadow-sm">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Analysis Panel */}
      <AnimatePresence>
        {showAnalysis && analysis && (
          <motion.div
            initial={{ opacity: 0, x: 300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 300 }}
            className="fixed inset-0 sm:inset-auto sm:right-4 sm:top-20 w-full sm:w-[450px] glass-panel bg-white/95 dark:bg-elixra-charcoal/95 backdrop-blur-xl border border-elixra-border-subtle rounded-none sm:rounded-2xl p-6 h-full sm:h-auto sm:max-h-[80vh] overflow-y-auto z-40 shadow-2xl pt-20 sm:pt-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-elixra-charcoal dark:text-white flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-elixra-bunsen" />
                AI Analysis
              </h3>
              <div className="flex items-center gap-2">
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
                <button
                  onClick={() => setShowAnalysis(false)}
                  className="p-2 rounded-lg glass-panel bg-white/40 dark:bg-white/10 border border-elixra-border-subtle hover:border-elixra-bunsen/30 transition-all"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="space-y-6 pb-20 sm:pb-0">
              {/* Basic Info */}
              <div className="glass-panel bg-white/60 dark:bg-white/15 backdrop-blur-xl border border-elixra-border-subtle rounded-xl p-4">
                <div className="text-lg font-semibold text-elixra-charcoal dark:text-white mb-2">
                  {analysis.commonName}
                </div>
                <div className="text-sm text-elixra-secondary mb-1">
                  {analysis.iupacName}
                </div>
                {analysis.casNumber && (
                  <div className="text-xs text-elixra-secondary/70">
                    CAS Registry Number: {analysis.casNumber}
                  </div>
                )}
              </div>

              {/* Properties */}
              <div>
                <div className="text-sm font-semibold text-elixra-charcoal dark:text-white mb-3 flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  Physical Properties
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="glass-panel bg-white/40 dark:bg-white/10 rounded-lg p-3">
                    <div className="text-xs text-elixra-secondary">Formula</div>
                    <div className="font-medium text-elixra-charcoal dark:text-white">{analysis.formula}</div>
                  </div>
                  <div className="glass-panel bg-white/40 dark:bg-white/10 rounded-lg p-3">
                    <div className="text-xs text-elixra-secondary">Molecular Weight</div>
                    <div className="font-medium text-elixra-charcoal dark:text-white">{analysis.molecularWeight.toFixed(2)} g/mol</div>
                  </div>
                  <div className="glass-panel bg-white/40 dark:bg-white/10 rounded-lg p-3">
                    <div className="text-xs text-elixra-secondary">Physical State</div>
                    <div className="font-medium text-elixra-charcoal dark:text-white capitalize">{analysis.properties.physicalState}</div>
                  </div>
                  <div className="glass-panel bg-white/40 dark:bg-white/10 rounded-lg p-3">
                    <div className="text-xs text-elixra-secondary">Polarity</div>
                    <div className="font-medium text-elixra-charcoal dark:text-white capitalize">{analysis.properties.polarity}</div>
                  </div>
                  {analysis.properties.meltingPoint && (
                    <div className="glass-panel bg-white/40 dark:bg-white/10 rounded-lg p-3">
                      <div className="text-xs text-elixra-secondary">Melting Point</div>
                      <div className="font-medium text-elixra-charcoal dark:text-white">{analysis.properties.meltingPoint}°C</div>
                    </div>
                  )}
                  {analysis.properties.boilingPoint && (
                    <div className="glass-panel bg-white/40 dark:bg-white/10 rounded-lg p-3">
                      <div className="text-xs text-elixra-secondary">Boiling Point</div>
                      <div className="font-medium text-elixra-charcoal dark:text-white">{analysis.properties.boilingPoint}°C</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Functional Groups */}
              {analysis.structure.functionalGroups.length > 0 && (
                <div>
                  <div className="text-sm font-semibold text-elixra-charcoal dark:text-white mb-3">
                    Functional Groups
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {analysis.structure.functionalGroups.map(group => (
                      <span key={group} className="px-3 py-2 bg-elixra-bunsen/20 text-elixra-bunsen-dark dark:text-elixra-bunsen-light rounded-lg text-sm font-medium">
                        {group}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Applications */}
              <div>
                <div className="text-sm font-semibold text-elixra-charcoal dark:text-white mb-3">
                  Common Applications
                </div>
                <div className="space-y-3">
                  {analysis.applications.everyday.length > 0 && (
                    <div>
                      <div className="text-xs text-elixra-secondary mb-2">Everyday Uses</div>
                      <div className="space-y-1">
                        {analysis.applications.everyday.map((use, index) => (
                          <div key={index} className="text-sm text-elixra-charcoal dark:text-gray-200 flex items-start gap-2">
                            <div className="w-1.5 h-1.5 bg-elixra-bunsen rounded-full mt-2 flex-shrink-0" />
                            {use}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Safety */}
              <div>
                <div className="text-sm font-semibold text-elixra-charcoal dark:text-white mb-3">
                  Safety Information
                </div>
                <div className={`p-4 rounded-lg border ${analysis.safety.toxicity === 'non-toxic'
                    ? 'bg-elixra-success/20 border-elixra-success/30'
                    : analysis.safety.toxicity === 'low-toxicity'
                      ? 'bg-elixra-copper/20 border-elixra-copper/30'
                      : 'bg-elixra-error/20 border-elixra-error/30'
                  }`}>
                  <div className="font-medium capitalize mb-2">
                    {analysis.safety.toxicity.replace('-', ' ')}
                  </div>
                  <div className="text-sm text-elixra-charcoal dark:text-gray-200">
                    {analysis.safety.handling[0]}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Validation Panel */}
      <AnimatePresence>
        {showValidation && validation && (
          <motion.div
            initial={{ opacity: 0, x: -300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -300 }}
            className="fixed inset-0 sm:inset-auto sm:left-4 sm:top-20 w-full sm:w-[400px] glass-panel bg-white/95 dark:bg-elixra-charcoal/95 backdrop-blur-xl border border-elixra-border-subtle rounded-none sm:rounded-2xl p-6 h-full sm:h-auto sm:max-h-[80vh] overflow-y-auto z-40 shadow-2xl pt-20 sm:pt-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-elixra-charcoal dark:text-white flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${validation.isValid ? 'bg-elixra-success' : 'bg-elixra-error'
                  }`} />
                Chemical Validation
              </h3>
              <button
                onClick={() => setShowValidation(false)}
                className="p-2 rounded-lg glass-panel bg-white/40 dark:bg-white/10 border border-elixra-border-subtle hover:border-elixra-bunsen/30 transition-all"
              >
                ✕
              </button>
            </div>

            <div className="space-y-6 pb-20 sm:pb-0">
              {/* Status */}
              <div className={`p-4 rounded-xl border ${validation.isValid
                  ? 'bg-elixra-success/20 border-elixra-success/30'
                  : 'bg-elixra-error/20 border-elixra-error/30'
                }`}>
                <div className="font-semibold text-lg">
                  {validation.isValid ? '✓ Structure Valid' : '⚠ Structure Issues'}
                </div>
                <div className="text-sm text-elixra-secondary mt-1">
                  {validation.warnings.length} warnings • {validation.suggestions.length} suggestions
                </div>
              </div>

              {/* Warnings */}
              {validation.warnings.length > 0 && (
                <div>
                  <div className="text-sm font-semibold text-elixra-charcoal dark:text-white mb-3 flex items-center gap-2">
                    ⚠️ Warnings
                  </div>
                  <div className="space-y-3">
                    {validation.warnings.map((warning, index) => (
                      <div key={index} className={`p-4 rounded-xl border ${warning.severity === 'high'
                          ? 'bg-elixra-error/20 border-elixra-error/30'
                          : warning.severity === 'medium'
                            ? 'bg-elixra-copper/20 border-elixra-copper/30'
                            : 'bg-elixra-bunsen/20 border-elixra-bunsen/30'
                        }`}>
                        <div className="font-medium mb-2">{warning.message}</div>
                        <div className="text-xs text-elixra-secondary/70">
                          Atom: {warning.atomSymbol}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggestions */}
              {validation.suggestions.length > 0 && (
                <div>
                  <div className="text-sm font-semibold text-elixra-charcoal dark:text-white mb-3 flex items-center gap-2">
                    💡 Suggestions
                  </div>
                  <div className="space-y-3">
                    {validation.suggestions.map((suggestion, index) => (
                      <div key={index} className="p-4 rounded-xl border bg-elixra-bunsen/20 border-elixra-bunsen/30">
                        <div className="font-medium mb-2">{suggestion.action}</div>
                        <div className="text-sm text-elixra-secondary/80">
                          {suggestion.reason}
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={autoCompleteWithHydrogen}
                    className="w-full mt-4 btn-secondary"
                  >
                    <Zap className="h-4 w-4 mr-2" />
                    Auto-complete with Hydrogen
                  </button>
                </div>
              )}

              {/* Electron Counts */}
              <div>
                <div className="text-sm font-semibold text-elixra-charcoal dark:text-white mb-3">
                  Electron Counts
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {Object.entries(validation.electronCounts).map(([atomId, count]) => {
                    const atom = atoms.find(a => a.id === atomId)
                    if (!atom) return null
                    return (
                      <div key={atomId} className="flex items-center justify-between p-3 rounded-lg border bg-white/40 dark:bg-white/10">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: atom.color }}
                          />
                          <span className="font-medium">{atom.element}</span>
                        </div>
                        <div className="text-sm text-elixra-secondary">
                          {count} valence electrons
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ModernNavbar />

      <div className="relative z-10 max-w-7xl mx-auto px-2 sm:px-6 py-4 sm:py-12 mt-4 sm:mb-0 mb-20">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Sidebar - Mobile Hidden by default */}
          <div className={`${activeMobileTab === 'library' ? 'block' : 'hidden'} lg:block lg:col-span-1 space-y-4`}>
            {/* Element Quick Access */}
            <div className="glass-panel bg-white/40 dark:bg-white/5 backdrop-blur-2xl border border-elixra-border-subtle rounded-3xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-elixra-charcoal dark:text-white">
                  Quick Elements
                </h3>
                <button
                  onClick={() => setShowPeriodicTable(true)}
                  className="px-3 py-1.5 text-xs font-medium text-elixra-charcoal dark:text-white hover:text-white bg-elixra-bunsen/10 hover:bg-elixra-bunsen rounded-lg transition-all duration-200 border border-elixra-bunsen/20 hover:border-elixra-bunsen hover:shadow-lg hover:shadow-elixra-bunsen/20"
                >
                  View All
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {PERIODIC_TABLE.slice(0, 16).map(element => (
                  <motion.button
                    key={element.symbol}
                    draggable={true}
                    onDragStart={(e) => {
                      // @ts-ignore
                      window.__draggedElement = element
                      // @ts-ignore
                      if (e.dataTransfer) {
                        // @ts-ignore
                        e.dataTransfer.effectAllowed = 'copy'
                        // @ts-ignore
                        e.dataTransfer.setData('text/plain', element.symbol)
                      }
                    }}
                    onTouchStart={() => {
                      // @ts-ignore
                      window.__draggedElement = element
                    }}
                    onTouchEnd={(e) => {
                      // @ts-ignore
                      const touch = e.changedTouches[0]
                      const target = document.elementFromPoint(touch.clientX, touch.clientY)
                      const dropZone = target?.closest('#molecule-drop-zone')

                      if (dropZone) {
                        handleDropAtom(element)
                      }

                      // @ts-ignore
                      window.__draggedElement = null
                    }}
                    onClick={() => {
                      setPendingDropElement(element)
                      setPendingDropPosition(null)
                      setShowBondDialog(true)
                    }}
                    className={`
                      relative aspect-[4/3] rounded-lg border transition-all duration-200
                      flex flex-col items-center justify-between p-1.5
                      ${selectedElement?.symbol === element.symbol
                        ? 'border-elixra-bunsen ring-2 ring-elixra-bunsen/50'
                        : 'border-white/20 hover:border-white/60'
                      }
                      cursor-grab active:cursor-grabbing
                    `}
                    style={{
                      backgroundColor: `${element.color}30`,
                      borderColor: selectedElement?.symbol === element.symbol ? '#2E6B6B' : `${element.color}50`,
                      touchAction: 'none'
                    }}
                    whileHover={{ scale: 1.05, y: -2 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <div className="w-full flex justify-between items-start leading-none">
                      <span className="text-[10px] font-bold text-white/90">
                        {element.atomicNumber}
                      </span>
                    </div>
                    <div className="font-bold text-white text-xl drop-shadow-md">
                      {element.symbol}
                    </div>
                    <div className="text-[9px] text-white/90 font-semibold truncate w-full text-center">
                      {element.name}
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="glass-panel bg-white/40 dark:bg-white/5 backdrop-blur-2xl border border-elixra-border-subtle rounded-3xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-elixra-charcoal dark:text-white">
                  Quick Actions
                </h3>
                <button
                  onClick={() => setShowAdvancedControls(!showAdvancedControls)}
                  className="p-1 rounded-lg glass-panel bg-white/40 dark:bg-white/10 border border-elixra-border-subtle hover:border-elixra-bunsen/30 transition-all"
                  title="Advanced Controls"
                >
                  <Settings className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={clearAll}
                  disabled={atoms.length === 0}
                  className="p-4 glass-panel bg-white/80 dark:bg-white/15 rounded-xl border border-elixra-border-subtle hover:border-elixra-error hover:bg-elixra-error/10 transition-all text-sm flex flex-col items-center justify-center gap-3 group disabled:opacity-50 disabled:hover:scale-100 min-h-[100px]"
                  title="Clear Scene"
                >
                  <Trash2 className="h-8 w-8 text-elixra-secondary group-hover:text-elixra-error transition-colors" />
                  <div className="font-bold text-elixra-charcoal dark:text-white">Clear All</div>
                </button>
                <button
                  onClick={() => setShowTemplates(true)}
                  className="p-4 glass-panel bg-white/80 dark:bg-white/15 rounded-xl border border-elixra-border-subtle hover:border-elixra-bunsen hover:bg-elixra-bunsen/10 transition-all text-sm flex flex-col items-center justify-center gap-3 group min-h-[100px]"
                  title="Templates (Ctrl+T)"
                >
                  <div className="text-4xl text-elixra-charcoal dark:text-white group-hover:scale-110 transition-transform drop-shadow-sm">📋</div>
                  <div className="font-bold text-elixra-charcoal dark:text-white">Templates</div>
                </button>
                <button
                  onClick={handleUndo}
                  disabled={!undoRedoManagerRef.current.canUndo()}
                  className="p-4 glass-panel bg-white/80 dark:bg-white/15 rounded-xl border border-elixra-border-subtle hover:border-elixra-bunsen hover:bg-elixra-bunsen/10 transition-all text-sm flex flex-col items-center justify-center gap-3 group disabled:opacity-50 disabled:hover:scale-100 min-h-[100px]"
                  title="Undo (Ctrl+Z)"
                >
                  <Undo2 className="h-8 w-8 text-elixra-secondary group-hover:text-elixra-bunsen transition-colors" />
                  <div className="font-bold text-elixra-charcoal dark:text-white">Undo</div>
                </button>
                <button
                  onClick={handleRedo}
                  disabled={!undoRedoManagerRef.current.canRedo()}
                  className="p-4 glass-panel bg-white/80 dark:bg-white/15 rounded-xl border border-elixra-border-subtle hover:border-elixra-bunsen hover:bg-elixra-bunsen/10 transition-all text-sm flex flex-col items-center justify-center gap-3 group disabled:opacity-50 disabled:hover:scale-100 min-h-[100px]"
                  title="Redo (Ctrl+Y)"
                >
                  <Redo2 className="h-8 w-8 text-elixra-secondary group-hover:text-elixra-bunsen transition-colors" />
                  <div className="font-bold text-elixra-charcoal dark:text-white">Redo</div>
                </button>
              </div>

              <AnimatePresence>
                {showAdvancedControls && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-3 pt-3 border-t border-elixra-border-subtle"
                  >
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={handleValidate}
                        disabled={atoms.length === 0}
                        className="p-2 glass-panel bg-white/60 dark:bg-white/10 rounded-lg border border-elixra-border-subtle hover:border-elixra-bunsen/30 transition-all text-xs disabled:opacity-50"
                        title="Validate Structure"
                      >
                        <div className="w-4 h-4 rounded-full bg-elixra-success mx-auto" />
                        <div className="text-elixra-secondary">Validate</div>
                      </button>
                      <button
                        onClick={autoCompleteWithHydrogen}
                        disabled={atoms.length === 0 || !validation?.suggestions.some(s => s.type === 'add-hydrogen')}
                        className="p-2 glass-panel bg-white/60 dark:bg-white/10 rounded-lg border border-elixra-border-subtle hover:border-elixra-bunsen/30 transition-all text-xs disabled:opacity-50"
                        title="Auto-complete"
                      >
                        <Zap className="h-4 w-4 mx-auto" />
                        <div className="text-elixra-secondary">Auto-H</div>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Voice Commands */}
            <VoiceCommandSystem
              onCommand={handleVoiceCommand}
              isListening={isVoiceListening}
              onToggleListening={() => setIsVoiceListening(!isVoiceListening)}
              className="glass-panel bg-white/40 dark:bg-white/5 backdrop-blur-2xl border border-elixra-border-subtle rounded-3xl p-4"
            />
          </div>

          {/* Main Content */}
          <div className={`${activeMobileTab === 'editor' ? 'block' : 'hidden'} lg:block lg:col-span-3`}>
            <div className="glass-panel bg-white/40 dark:bg-white/5 backdrop-blur-2xl border border-elixra-border-subtle rounded-3xl p-4 sm:p-6 hover:border-elixra-bunsen/30 transition-all duration-300 relative overflow-hidden group">
              <StaticGrid className="opacity-30" />

              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 sm:mb-6 relative z-10 gap-3">
                <div>
                  <h2 className="text-lg font-bold text-elixra-charcoal dark:text-white whitespace-nowrap mb-1">{moleculeName}</h2>
                  {atoms.length > 0 && (
                    <p className="text-sm text-elixra-secondary font-mono">
                      {getMolecularFormula(atoms)} • {calculateMolecularWeight(atoms).toFixed(2)} g/mol
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                  {selectedElement && (
                    <motion.button
                      onClick={() => {
                        setPendingDropElement(selectedElement)
                        setPendingDropPosition(null)
                        setShowBondDialog(true)
                      }}
                      className="btn-primary flex items-center gap-2 text-sm px-3 py-1.5"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Plus className="h-4 w-4" />
                      Add {selectedElement.symbol}
                    </motion.button>
                  )}

                  <button
                    onClick={() => handleAnalyze()}
                    disabled={analyzing || atoms.length === 0}
                    className="px-3 py-1.5 sm:px-4 sm:py-2 bg-gradient-to-r from-elixra-bunsen to-elixra-bunsen-dark text-white rounded-lg shadow-lg shadow-elixra-bunsen/20 hover:shadow-elixra-bunsen/40 hover:scale-105 transition-all flex items-center gap-2 text-sm font-medium disabled:opacity-50 disabled:hover:scale-100 disabled:shadow-none whitespace-nowrap"
                  >
                    {analyzing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        AI Analysis
                      </>
                    )}
                  </button>

                  {/* Mobile Quick Validate */}
                  <button
                    onClick={handleValidate}
                    disabled={atoms.length === 0}
                    className="lg:hidden px-3 py-1.5 bg-elixra-charcoal/10 dark:bg-white/10 text-elixra-charcoal dark:text-white rounded-lg hover:bg-elixra-charcoal/20 transition-all flex items-center gap-2 text-sm disabled:opacity-50"
                  >
                    <div className={`w-2 h-2 rounded-full ${validation?.isValid === false ? 'bg-red-500' : 'bg-green-500'}`} />
                    Check
                  </button>
                </div>
              </div>

              {/* 3D Viewer */}
              <div className="h-[50vh] sm:h-[500px] mb-6 relative z-10 rounded-xl overflow-hidden border border-elixra-border-subtle bg-black/5 dark:bg-black/20">
                {isGenerating && (
                  <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm rounded-2xl">
                    <div className="w-12 h-12 border-4 border-elixra-bunsen border-t-transparent rounded-full animate-spin mb-4" />
                    <div className="text-white font-medium">Generating Structure with AI...</div>
                  </div>
                )}

                {/* AI Geometry Insight Overlay */}
                <AnimatePresence>
                  {analysis && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 20 }}
                      className="absolute top-4 left-4 z-40 max-w-[200px] pointer-events-none"
                    >
                      <div className="glass-panel bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-3 shadow-lg">
                        <div className="flex items-center gap-2 mb-1">
                          <Sparkles className="w-3 h-3 text-elixra-bunsen" />
                          <span className="text-xs font-bold text-white uppercase tracking-wider">AI Insight</span>
                        </div>
                        <div className="text-sm font-semibold text-white mb-0.5">
                          {analysis.structure.geometry}
                        </div>
                        <div className="text-xs text-white/70">
                          Angles: {analysis.structure.bondAngles}
                        </div>
                        {analysis.structure.hybridization && Object.keys(analysis.structure.hybridization).length > 0 && (
                          <div className="text-xs text-white/70 mt-1 pt-1 border-t border-white/10">
                            Hybridization: {Object.values(analysis.structure.hybridization)[0]}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <MoleculeDropZone onDrop={handleDropAtom}>
                  <EnhancedMolecule3DViewer
                    atoms={atoms}
                    bonds={bonds}
                    onSelectAtom={handleSelectAtom}
                    onSelectBond={handleSelectBond}
                    selectedAtomId={selectedAtomId}
                    selectedBondId={selectedBondId}
                    onCanvasClick={handleCanvasClick}
                    controlsRef={orbitControlsRef}
                    enablePerformanceOptimizations={atoms.length > 50}
                  />
                </MoleculeDropZone>

                {/* Mobile Viewer Controls Overlay */}
                <div className="absolute bottom-4 right-4 lg:hidden flex flex-col gap-2">
                  <button
                    onClick={() => orbitControlsRef.current?.reset()}
                    className="p-2 bg-white/10 backdrop-blur-md rounded-full text-white border border-white/20 shadow-lg"
                  >
                    <RotateCw className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Selected Atom/Bond Info */}
              {(selectedAtomId || selectedBondId) && (
                <div className="mb-6 p-4 bg-elixra-bunsen/10 border border-elixra-bunsen/20 rounded-2xl relative z-10">
                  {selectedAtomId && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-elixra-charcoal dark:text-white">
                          Selected Atom: {atoms.find(a => a.id === selectedAtomId)?.element}
                        </div>
                        <button
                          onClick={() => removeAtom(selectedAtomId)}
                          className="flex items-center gap-2 px-4 py-2 bg-elixra-error hover:bg-elixra-error-dark text-white text-sm font-medium rounded-lg shadow-sm hover:shadow-md transition-all active:scale-95"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete Atom
                        </button>
                      </div>
                      <div className="text-sm text-elixra-secondary">
                        Position: ({atoms.find(a => a.id === selectedAtomId)?.x.toFixed(1)},
                        {atoms.find(a => a.id === selectedAtomId)?.y.toFixed(1)},
                        {atoms.find(a => a.id === selectedAtomId)?.z.toFixed(1)})
                      </div>
                    </div>
                  )}

                  {selectedBondId && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-elixra-charcoal dark:text-white">
                          Selected Bond: {bonds.find(b => b.id === selectedBondId)?.type}
                        </div>
                        <button
                          onClick={() => removeBond(selectedBondId)}
                          className="flex items-center gap-2 px-4 py-2 bg-elixra-error hover:bg-elixra-error-dark text-white text-sm font-medium rounded-lg shadow-sm hover:shadow-md transition-all active:scale-95"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete Bond
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6 relative z-10">
                <div className="glass-panel bg-white/40 dark:bg-elixra-bunsen/10 border border-elixra-bunsen/20 rounded-xl p-2 sm:p-3 text-center backdrop-blur-sm hover:border-elixra-bunsen/40 transition-all">
                  <div className="text-xl sm:text-2xl font-bold text-elixra-bunsen">{atoms.length}</div>
                  <div className="text-[10px] sm:text-xs text-elixra-secondary uppercase tracking-wide">Atoms</div>
                </div>

                <div className="glass-panel bg-white/40 dark:bg-elixra-success/10 border border-elixra-success/20 rounded-xl p-2 sm:p-3 text-center backdrop-blur-sm hover:border-elixra-success/40 transition-all">
                  <div className="text-xl sm:text-2xl font-bold text-elixra-success">{bonds.length}</div>
                  <div className="text-[10px] sm:text-xs text-elixra-secondary uppercase tracking-wide">Bonds</div>
                </div>

                <div className="glass-panel bg-white/40 dark:bg-elixra-copper/10 border border-elixra-copper/20 rounded-xl p-2 sm:p-3 text-center backdrop-blur-sm hover:border-elixra-copper/40 transition-all">
                  <div className="text-xl sm:text-2xl font-bold text-elixra-copper">
                    {new Set(atoms.map(a => a.element)).size}
                  </div>
                  <div className="text-[10px] sm:text-xs text-elixra-secondary uppercase tracking-wide">Elements</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-white dark:bg-elixra-charcoal border-t border-elixra-copper/10 z-50 px-4 flex items-center justify-around shadow-lg-up pb-safe">
        <button
          onClick={() => setActiveMobileTab('library')}
          className={`flex flex-col items-center justify-center space-y-1 w-20 py-1 rounded-xl transition-all ${activeMobileTab === 'library'
              ? 'text-elixra-bunsen bg-elixra-bunsen/10'
              : 'text-gray-400 hover:text-gray-500'
            }`}
        >
          <Search className="w-6 h-6" />
          <span className="text-[10px] font-medium">Library</span>
        </button>

        <button
          onClick={() => setActiveMobileTab('editor')}
          className={`flex flex-col items-center justify-center space-y-1 w-20 py-1 rounded-xl transition-all ${activeMobileTab === 'editor'
              ? 'text-elixra-bunsen bg-elixra-bunsen/10'
              : 'text-gray-400 hover:text-gray-500'
            }`}
        >
          <AtomIcon className="w-6 h-6" />
          <span className="text-[10px] font-medium">Editor</span>
        </button>

        <button
          onClick={() => {
            // Only show analysis if there is data, or if user wants to see stats
            if (analysis) {
              setShowAnalysis(true)
            } else {
              setShowValidation(true)
            }
          }}
          className={`flex flex-col items-center justify-center space-y-1 w-20 py-1 rounded-xl transition-all relative text-gray-400 hover:text-gray-500`}
        >
          <Sparkles className="w-6 h-6" />
          <span className="text-[10px] font-medium">Insights</span>
          {validation?.isValid === false && (
            <span className="absolute top-1 right-5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-elixra-charcoal animate-pulse"></span>
          )}
        </button>
      </div>

      <SaveConfirmation
        isVisible={saveStatus.isVisible}
        message={saveStatus.message}
        type={saveStatus.type}
        onClose={() => setSaveStatus(prev => ({ ...prev, isVisible: false }))}
      />
    </div>
  )
}