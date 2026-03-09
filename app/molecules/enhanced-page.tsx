'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Atom as AtomIcon, Plus, Trash2, RotateCw, Sparkles, Search, Filter, Undo2, Redo2, Mic, MicOff } from 'lucide-react'
import ModernNavbar from '@/components/ModernNavbar'
import dynamic from 'next/dynamic'
import MoleculeDropZone from '@/components/MoleculeDropZone'
import { PerspectiveGrid, StaticGrid } from '@/components/GridBackground'
import { SpatialHash, BondCalculationWorker, PerformanceMonitor } from '@/lib/spatialHash'
import { PERIODIC_TABLE, PeriodicElement } from '@/lib/periodicTable'
import { Element } from '@/types/molecule'
import { validateMolecule, ChemicalValidator, ValidationResult } from '@/lib/chemicalValidation'
import { MOLECULAR_TEMPLATES, MolecularTemplate, searchTemplates } from '@/lib/molecularTemplates'
import { EnhancedAIAnalyzer, EnhancedAnalysis } from '@/lib/enhancedAIAnalysis'
import { UndoRedoManager, ACTION_TYPES, createActionDescription } from '@/lib/undoRedo'
import VoiceCommandSystem from '@/components/VoiceCommandSystem'
import PeriodicTable from '@/components/PeriodicTable'
import AtomBondDialog from '@/components/AtomBondDialog'

const EnhancedMolecule3DViewer = dynamic(() => import('@/components/EnhancedMolecule3DViewer'), {
  ssr: false,
  loading: () => (
    <div className="h-[500px] w-full bg-elixra-charcoal/10 dark:bg-white/10 animate-pulse rounded-lg flex items-center justify-center text-elixra-secondary">
      Loading 3D Viewer...
    </div>
  )
})

import { Atom, Bond } from '@/types/molecule'
import {
  calculateBonds,
  getMolecularFormula,
  calculateMolecularWeight,
  updateBondsOnMove,
  canFormBond,
} from '@/lib/bondingLogic'

export default function EnhancedMoleculesPage() {
  const [atoms, setAtoms] = useState<Atom[]>([])
  const [bonds, setBonds] = useState<Bond[]>([])
  const [selectedElement, setSelectedElement] = useState<PeriodicElement | null>(null)
  const [moleculeName, setMoleculeName] = useState('Custom Molecule')
  const [analysis, setAnalysis] = useState<EnhancedAnalysis | null>(null)
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [selectedAtomId, setSelectedAtomId] = useState<string | null>(null)
  const [selectedBondId, setSelectedBondId] = useState<string | null>(null)
  const [showBondDialog, setShowBondDialog] = useState(false)
  const [pendingDropElement, setPendingDropElement] = useState<Element | null>(null)
  const [pendingDropPosition, setPendingDropPosition] = useState<{ x: number; y: number; z: number } | null>(null)
  
  // Performance optimization
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

  const handleDropAtom = (element: Element, position?: { x: number; y: number; z: number }) => {
    setPendingDropElement(element)
    setPendingDropPosition(position || null)
    setShowBondDialog(true)
  }

  const loadTemplate = (template: MolecularTemplate) => {
    const newState = {
      atoms: template.atoms.map(atom => ({ ...atom })),
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

    let finalPosition: { x: number; y: number; z: number } | null = null
    
    // Determine the reference atom for positioning
    const referenceAtomId = bondsToCreate && bondsToCreate.length > 0 ? bondsToCreate[0].atomId : null
    
    // Always find a position that's 3+ units away from ALL atoms
    let attempts = 0
    const maxAttempts = 100
    
    while (!finalPosition && attempts < maxAttempts) {
      let candidatePos: { x: number; y: number; z: number }
      
      if (referenceAtomId) {
        const referenceAtom = atoms.find(a => a.id === referenceAtomId)
        if (!referenceAtom) break
        
        const angle1 = Math.random() * Math.PI * 2
        const angle2 = Math.random() * Math.PI * 2
        candidatePos = {
          x: referenceAtom.x + 3.5 * Math.cos(angle1) * Math.sin(angle2),
          y: referenceAtom.y + 3.5 * Math.sin(angle1) * Math.sin(angle2),
          z: referenceAtom.z + 3.5 * Math.cos(angle2)
        }
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

  const handleAnalyze = async () => {
    if (atoms.length === 0) return

    setAnalyzing(true)
    try {
      const formula = getMolecularFormula(atoms)
      const analysis = await aiAnalyzerRef.current.analyzeMolecule(atoms, bonds)
      setAnalysis(analysis)
      setShowAnalysis(true)
    } catch (error) {
      console.error('Analysis failed:', error)
    } finally {
      setAnalyzing(false)
    }
  }

  const handleValidate = () => {
    const validation = validateMolecule(atoms, bonds)
    setValidation(validation)
    setShowValidation(true)
  }

  const autoCompleteWithHydrogen = () => {
    const validator = new ChemicalValidator(atoms, bonds)
    const { newAtoms, newBonds } = validator.autoCompleteWithHydrogen()
    
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

  const handleVoiceCommand = (command: any) => {
    switch (command.action) {
      case 'ADD_ELEMENT':
        if (command.data?.element) {
          const element = PERIODIC_TABLE.find(e => e.symbol === command.data.element)
          if (element) {
            addAtom(element)
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
    }
  }

  const orbitControlsRef = useRef<any>(null)

  return (
    <div className="min-h-screen bg-elixra-cream dark:bg-elixra-charcoal relative overflow-hidden transition-colors duration-300">
      <PerspectiveGrid />

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
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowPeriodicTable(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass-panel bg-white/90 dark:bg-elixra-charcoal/90 backdrop-blur-xl border border-elixra-border-subtle rounded-2xl p-6 max-w-6xl max-h-[90vh] overflow-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <PeriodicTable
                onElementSelect={(element) => {
                  setSelectedElement(element)
                  setShowPeriodicTable(false)
                }}
                selectedElement={selectedElement?.symbol || null}
                className="max-w-4xl"
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
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowTemplates(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass-panel bg-white/90 dark:bg-elixra-charcoal/90 backdrop-blur-xl border border-elixra-border-subtle rounded-2xl p-6 max-w-4xl max-h-[90vh] overflow-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-elixra-charcoal dark:text-white">
                    Molecular Templates
                  </h2>
                  <button
                    onClick={() => setShowTemplates(false)}
                    className="p-2 rounded-lg glass-panel bg-white/40 dark:bg-white/10 border border-elixra-border-subtle hover:border-elixra-bunsen/30 transition-all"
                  >
                    ✕
                  </button>
                </div>
                
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-elixra-secondary" />
                  <input
                    type="text"
                    placeholder="Search templates..."
                    value={templateSearch}
                    onChange={(e) => setTemplateSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 glass-panel bg-white/60 dark:bg-white/10 border border-elixra-border-subtle rounded-xl focus:border-elixra-bunsen focus:ring-1 focus:ring-elixra-bunsen/50 transition-all"
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
                  {searchTemplates(templateSearch).map(template => (
                    <button
                      key={template.id}
                      onClick={() => {
                        loadTemplate(template)
                        setShowTemplates(false)
                      }}
                      className="glass-panel bg-white/40 dark:bg-white/10 backdrop-blur-xl border border-elixra-border-subtle rounded-xl p-4 hover:border-elixra-bunsen/30 transition-all text-left"
                    >
                      <div className="font-semibold text-elixra-charcoal dark:text-white">
                        {template.name}
                      </div>
                      <div className="text-sm text-elixra-secondary">
                        {template.formula} • {template.molecularWeight.toFixed(1)} g/mol
                      </div>
                      <div className="text-xs text-elixra-secondary/70 mt-1">
                        {template.description}
                      </div>
                      {template.hotkey && (
                        <div className="text-xs text-elixra-bunsen mt-2">
                          Press {template.hotkey.toUpperCase()} to insert
                        </div>
                      )}
                    </button>
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
            className="fixed right-4 top-20 w-96 glass-panel bg-white/90 dark:bg-elixra-charcoal/90 backdrop-blur-xl border border-elixra-border-subtle rounded-2xl p-6 max-h-[80vh] overflow-y-auto z-40"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-elixra-charcoal dark:text-white">
                AI Analysis
              </h3>
              <button
                onClick={() => setShowAnalysis(false)}
                className="p-2 rounded-lg glass-panel bg-white/40 dark:bg-white/10 border border-elixra-border-subtle hover:border-elixra-bunsen/30 transition-all"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <div className="font-semibold text-elixra-charcoal dark:text-white">
                  {analysis.commonName}
                </div>
                <div className="text-sm text-elixra-secondary">
                  {analysis.iupacName}
                </div>
                {analysis.casNumber && (
                  <div className="text-xs text-elixra-secondary/70">
                    CAS: {analysis.casNumber}
                  </div>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="glass-panel bg-white/40 dark:bg-white/10 rounded-lg p-3">
                  <div className="text-elixra-secondary">Formula</div>
                  <div className="font-medium">{analysis.formula}</div>
                </div>
                <div className="glass-panel bg-white/40 dark:bg-white/10 rounded-lg p-3">
                  <div className="text-elixra-secondary">Weight</div>
                  <div className="font-medium">{analysis.molecularWeight.toFixed(2)} g/mol</div>
                </div>
                <div className="glass-panel bg-white/40 dark:bg-white/10 rounded-lg p-3">
                  <div className="text-elixra-secondary">State</div>
                  <div className="font-medium capitalize">{analysis.properties.physicalState}</div>
                </div>
                <div className="glass-panel bg-white/40 dark:bg-white/10 rounded-lg p-3">
                  <div className="text-elixra-secondary">Polarity</div>
                  <div className="font-medium capitalize">{analysis.properties.polarity}</div>
                </div>
              </div>
              
              {analysis.structure.functionalGroups.length > 0 && (
                <div>
                  <div className="text-elixra-secondary text-sm mb-2">Functional Groups</div>
                  <div className="flex flex-wrap gap-2">
                    {analysis.structure.functionalGroups.map(group => (
                      <span key={group} className="px-2 py-1 bg-elixra-bunsen/20 text-elixra-bunsen-dark dark:text-elixra-bunsen-light rounded text-xs">
                        {group}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              
              <div>
                <div className="text-elixra-secondary text-sm mb-2">Applications</div>
                <div className="space-y-1 text-xs">
                  {analysis.applications.everyday.map(app => (
                    <div key={app} className="text-elixra-charcoal dark:text-gray-200">
                      • {app}
                    </div>
                  ))}
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
            className="fixed left-4 top-20 w-96 glass-panel bg-white/90 dark:bg-elixra-charcoal/90 backdrop-blur-xl border border-elixra-border-subtle rounded-2xl p-6 max-h-[80vh] overflow-y-auto z-40"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-elixra-charcoal dark:text-white">
                Chemical Validation
              </h3>
              <button
                onClick={() => setShowValidation(false)}
                className="p-2 rounded-lg glass-panel bg-white/40 dark:bg-white/10 border border-elixra-border-subtle hover:border-elixra-bunsen/30 transition-all"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              <div className={`p-4 rounded-lg border ${
                validation.isValid 
                  ? 'bg-elixra-success/20 border-elixra-success/30' 
                  : 'bg-elixra-error/20 border-elixra-error/30'
              }`}>
                <div className="font-semibold">
                  {validation.isValid ? '✓ Structure Valid' : '⚠ Structure Issues'}
                </div>
                <div className="text-sm text-elixra-secondary mt-1">
                  {validation.warnings.length} warnings • {validation.suggestions.length} suggestions
                </div>
              </div>
              
              {validation.warnings.length > 0 && (
                <div>
                  <div className="text-elixra-secondary text-sm mb-2">Warnings</div>
                  <div className="space-y-2">
                    {validation.warnings.map((warning, index) => (
                      <div key={index} className={`p-3 rounded-lg border text-sm ${
                        warning.severity === 'high' 
                          ? 'bg-elixra-error/20 border-elixra-error/30' 
                          : warning.severity === 'medium'
                          ? 'bg-elixra-copper/20 border-elixra-copper/30'
                          : 'bg-elixra-bunsen/20 border-elixra-bunsen/30'
                      }`}>
                        <div className="font-medium">{warning.message}</div>
                        <div className="text-xs text-elixra-secondary/70 mt-1">
                          Atom: {warning.atomSymbol}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {validation.suggestions.length > 0 && (
                <div>
                  <div className="text-elixra-secondary text-sm mb-2">Suggestions</div>
                  <div className="space-y-2">
                    {validation.suggestions.map((suggestion, index) => (
                      <div key={index} className="p-3 rounded-lg border bg-elixra-bunsen/20 border-elixra-bunsen/30 text-sm">
                        <div className="font-medium">{suggestion.action}</div>
                        <div className="text-xs text-elixra-secondary/70 mt-1">
                          {suggestion.reason}
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <button
                    onClick={autoCompleteWithHydrogen}
                    className="w-full mt-3 btn-secondary text-sm"
                  >
                    Auto-complete with Hydrogen
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ModernNavbar />

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-12 mt-4">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Sidebar */}
          <div className="lg:col-span-1 space-y-4">
            {/* Quick Actions */}
            <div className="glass-panel bg-white/40 dark:bg-white/5 backdrop-blur-2xl border border-elixra-border-subtle rounded-3xl p-4">
              <h3 className="text-sm font-semibold text-elixra-charcoal dark:text-white mb-3">
                Quick Actions
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setShowPeriodicTable(true)}
                  className="p-2 glass-panel bg-white/60 dark:bg-white/10 rounded-lg border border-elixra-border-subtle hover:border-elixra-bunsen/30 transition-all text-xs"
                  title="Periodic Table (Ctrl+E)"
                >
                  <div className="text-elixra-bunsen">⚛</div>
                  <div className="text-elixra-secondary">Elements</div>
                </button>
                <button
                  onClick={() => setShowTemplates(true)}
                  className="p-2 glass-panel bg-white/60 dark:bg-white/10 rounded-lg border border-elixra-border-subtle hover:border-elixra-bunsen/30 transition-all text-xs"
                  title="Templates (Ctrl+T)"
                >
                  <div className="text-elixra-copper">📋</div>
                  <div className="text-elixra-secondary">Templates</div>
                </button>
                <button
                  onClick={handleUndo}
                  disabled={!undoRedoManagerRef.current.canUndo()}
                  className="p-2 glass-panel bg-white/60 dark:bg-white/10 rounded-lg border border-elixra-border-subtle hover:border-elixra-bunsen/30 transition-all text-xs disabled:opacity-50"
                  title="Undo (Ctrl+Z)"
                >
                  <Undo2 className="h-4 w-4 mx-auto" />
                  <div className="text-elixra-secondary">Undo</div>
                </button>
                <button
                  onClick={handleRedo}
                  disabled={!undoRedoManagerRef.current.canRedo()}
                  className="p-2 glass-panel bg-white/60 dark:bg-white/10 rounded-lg border border-elixra-border-subtle hover:border-elixra-bunsen/30 transition-all text-xs disabled:opacity-50"
                  title="Redo (Ctrl+Y)"
                >
                  <Redo2 className="h-4 w-4 mx-auto" />
                  <div className="text-elixra-secondary">Redo</div>
                </button>
              </div>
            </div>

            {/* Performance Monitor */}
            <div className="glass-panel bg-white/40 dark:bg-white/5 backdrop-blur-2xl border border-elixra-border-subtle rounded-3xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-semibold text-elixra-charcoal dark:text-white">
                  Performance
                </div>
                <div className={`text-xs px-2 py-1 rounded ${
                  qualityLevel === 'high' ? 'bg-elixra-success/20 text-elixra-success' :
                  qualityLevel === 'medium' ? 'bg-elixra-copper/20 text-elixra-copper' :
                  'bg-elixra-error/20 text-elixra-error'
                }`}>
                  {qualityLevel.toUpperCase()}
                </div>
              </div>
              <div className="text-xs text-elixra-secondary">
                FPS: {fps} • Atoms: {atoms.length} • Bonds: {bonds.length}
              </div>
            </div>

            {/* Voice Commands */}
            <VoiceCommandSystem
              onCommand={handleVoiceCommand}
              isListening={isVoiceListening}
              onToggleListening={() => setIsVoiceListening(!isVoiceListening)}
              className="glass-panel bg-white/40 dark:bg-white/5 backdrop-blur-2xl border border-elixra-border-subtle rounded-3xl p-4"
            />

            {/* Element Quick Access */}
            <div className="glass-panel bg-white/40 dark:bg-white/5 backdrop-blur-2xl border border-elixra-border-subtle rounded-3xl p-4">
              <h3 className="text-sm font-semibold text-elixra-charcoal dark:text-white mb-3">
                Quick Elements
              </h3>
              <div className="grid grid-cols-4 gap-2">
                {PERIODIC_TABLE.slice(0, 16).map(element => (
                  <button
                    key={element.symbol}
                    draggable={true}
                    onDragStart={(e) => {
                      // @ts-ignore
                      window.__draggedElement = element
                      // @ts-ignore
                      if (e.dataTransfer) {
                        e.dataTransfer.effectAllowed = 'copy'
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
                        setPendingDropElement(element)
                        setPendingDropPosition(null)
                        setShowBondDialog(true)
                      }
                      
                      // @ts-ignore
                      window.__draggedElement = null
                    }}
                    onClick={() => setSelectedElement(element)}
                    className={`
                      p-2 rounded-lg border transition-all text-xs
                      ${selectedElement?.symbol === element.symbol
                        ? 'border-elixra-bunsen bg-elixra-bunsen/20'
                        : 'border-white/20 hover:border-white/40'
                      }
                    `}
                    style={{
                      backgroundColor: `${element.color}20`,
                      borderColor: selectedElement?.symbol === element.symbol ? '#2E6B6B' : `${element.color}40`,
                      touchAction: 'none'
                    }}
                  >
                    <div className="font-bold">{element.symbol}</div>
                    <div className="text-[8px] text-elixra-secondary">{element.atomicNumber}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            <div className="glass-panel bg-white/40 dark:bg-white/5 backdrop-blur-2xl border border-elixra-border-subtle rounded-3xl p-6 hover:border-elixra-bunsen/30 transition-all duration-300 relative overflow-hidden group">
              <StaticGrid className="opacity-30" />
              
              {/* Header */}
              <div className="flex items-start justify-between mb-6 relative z-10">
                <div>
                  <h2 className="text-lg font-bold text-elixra-charcoal dark:text-white whitespace-nowrap mb-1">{moleculeName}</h2>
                  {atoms.length > 0 && (
                    <p className="text-sm text-elixra-secondary font-mono">
                      {getMolecularFormula(atoms)} • {calculateMolecularWeight(atoms).toFixed(2)} g/mol
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {selectedElement && (
                    <button
                      onClick={() => {
                        setPendingDropElement(selectedElement)
                        setPendingDropPosition(null)
                        setShowBondDialog(true)
                      }}
                      className="btn-primary flex items-center gap-2 text-sm"
                    >
                      <Plus className="h-4 w-4" />
                      Add {selectedElement.symbol}
                    </button>
                  )}
                  
                  <button
                    onClick={handleAnalyze}
                    disabled={analyzing || atoms.length === 0}
                    className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50 whitespace-nowrap"
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
                  
                  <button
                    onClick={handleValidate}
                    disabled={atoms.length === 0}
                    className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50"
                  >
                    <div className="w-4 h-4 rounded-full bg-elixra-success" />
                    Validate
                  </button>
                  
                  <button
                    onClick={clearAll}
                    className="p-2 bg-elixra-error/10 hover:bg-elixra-error/20 text-elixra-error border border-elixra-error/20 hover:border-elixra-error/40 rounded-xl transition-all"
                    title="Clear All"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* 3D Viewer */}
              <div style={{ height: '500px' }} className="mb-6 relative z-10">
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
              </div>

              {/* Selected Atom/Bond Info */}
              {(selectedAtomId || selectedBondId) && (
                <div className="mb-6 p-4 bg-elixra-bunsen/10 border border-elixra-bunsen/20 rounded-2xl relative z-10">
                  {selectedAtomId && (
                    <div className="space-y-2">
                      <div className="font-semibold text-elixra-charcoal dark:text-white">
                        Selected Atom: {atoms.find(a => a.id === selectedAtomId)?.element}
                      </div>
                      <div className="text-sm text-elixra-secondary">
                        Position: ({atoms.find(a => a.id === selectedAtomId)?.x.toFixed(1)}, 
                        {atoms.find(a => a.id === selectedAtomId)?.y.toFixed(1)}, 
                        {atoms.find(a => a.id === selectedAtomId)?.z.toFixed(1)})
                      </div>
                      <button
                        onClick={() => removeAtom(selectedAtomId)}
                        className="flex items-center gap-2 px-4 py-2 mt-2 bg-elixra-error hover:bg-elixra-error-dark text-white text-sm font-medium rounded-lg shadow-sm hover:shadow-md transition-all active:scale-95 w-full justify-center"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete Atom
                      </button>
                    </div>
                  )}
                  
                  {selectedBondId && (
                    <div className="space-y-2">
                      <div className="font-semibold text-elixra-charcoal dark:text-white">
                        Selected Bond: {bonds.find(b => b.id === selectedBondId)?.type}
                      </div>
                      <button
                        onClick={() => removeBond(selectedBondId)}
                        className="flex items-center gap-2 px-4 py-2 mt-2 bg-elixra-error hover:bg-elixra-error-dark text-white text-sm font-medium rounded-lg shadow-sm hover:shadow-md transition-all active:scale-95 w-full justify-center"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete Bond
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 mb-6 relative z-10">
                <div className="glass-panel bg-white/40 dark:bg-elixra-bunsen/10 border border-elixra-bunsen/20 rounded-xl p-3 text-center backdrop-blur-sm hover:border-elixra-bunsen/40 transition-all">
                  <div className="text-2xl font-bold text-elixra-bunsen">{atoms.length}</div>
                  <div className="text-xs text-elixra-secondary uppercase tracking-wide">Atoms</div>
                </div>

                <div className="glass-panel bg-white/40 dark:bg-elixra-success/10 border border-elixra-success/20 rounded-xl p-3 text-center backdrop-blur-sm hover:border-elixra-success/40 transition-all">
                  <div className="text-2xl font-bold text-elixra-success">{bonds.length}</div>
                  <div className="text-xs text-elixra-secondary uppercase tracking-wide">Bonds</div>
                </div>

                <div className="glass-panel bg-white/40 dark:bg-elixra-copper/10 border border-elixra-copper/20 rounded-xl p-3 text-center backdrop-blur-sm hover:border-elixra-copper/40 transition-all">
                  <div className="text-2xl font-bold text-elixra-copper">
                    {new Set(atoms.map(a => a.element)).size}
                  </div>
                  <div className="text-xs text-elixra-secondary uppercase tracking-wide">Elements</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}