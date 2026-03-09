'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Mic, MicOff, Plus, Volume2, VolumeX, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { parseNaturalLanguageCommand } from '@/lib/commandParser'

// Type declarations for Web Speech API
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
    webkitAudioContext: any;
  }
}

interface VoiceCommand {
  command: string
  action: string
  confidence: number
  timestamp: Date
  data?: any
}

interface VoiceCommandSystemProps {
  onCommand: (command: VoiceCommand) => void
  isListening: boolean
  onToggleListening: () => void
  className?: string
}

// Command patterns with fuzzy matching
const COMMAND_PATTERNS = [
  {
    patterns: ['add carbon atom', 'place carbon', 'insert carbon', 'carbon atom'],
    action: 'ADD_ELEMENT',
    element: 'C'
  },
  {
    patterns: ['add hydrogen atom', 'place hydrogen', 'insert hydrogen', 'hydrogen atom'],
    action: 'ADD_ELEMENT',
    element: 'H'
  },
  {
    patterns: ['add oxygen atom', 'place oxygen', 'insert oxygen', 'oxygen atom'],
    action: 'ADD_ELEMENT',
    element: 'O'
  },
  {
    patterns: ['add nitrogen atom', 'place nitrogen', 'insert nitrogen', 'nitrogen atom'],
    action: 'ADD_ELEMENT',
    element: 'N'
  },
  {
    patterns: ['build benzene ring', 'make benzene', 'create benzene', 'benzene'],
    action: 'LOAD_TEMPLATE',
    template: 'benzene-ring'
  },
  {
    patterns: ['build water molecule', 'make water', 'create water', 'water'],
    action: 'LOAD_TEMPLATE',
    template: 'water'
  },
  {
    patterns: ['build methane', 'make methane', 'create methane', 'methane'],
    action: 'LOAD_TEMPLATE',
    template: 'methane'
  },
  {
    patterns: ['build glucose', 'make glucose', 'create glucose', 'glucose'],
    action: 'LOAD_TEMPLATE',
    template: 'glucose'
  },
  {
    patterns: ['clear scene', 'clear all', 'remove all', 'delete everything'],
    action: 'CLEAR_SCENE'
  },
  {
    patterns: ['undo last action', 'undo', 'go back'],
    action: 'UNDO'
  },
  {
    patterns: ['redo', 'redo action', 'go forward'],
    action: 'REDO'
  },
  {
    patterns: ['analyze molecule', 'analyze this', 'analyze structure'],
    action: 'ANALYZE'
  },
  {
    patterns: ['add bond', 'create bond', 'make bond'],
    action: 'ADD_BOND'
  },
  {
    patterns: ['remove bond', 'delete bond'],
    action: 'REMOVE_BOND'
  },
  {
    patterns: ['change to single bond', 'single bond'],
    action: 'CHANGE_BOND_TYPE',
    bondType: 'single'
  },
  {
    patterns: ['change to double bond', 'double bond'],
    action: 'CHANGE_BOND_TYPE',
    bondType: 'double'
  },
  {
    patterns: ['change to triple bond', 'triple bond'],
    action: 'CHANGE_BOND_TYPE',
    bondType: 'triple'
  },
  {
    patterns: ['rotate view', 'rotate molecule', 'spin'],
    action: 'ROTATE_VIEW'
  },
  {
    patterns: ['reset view', 'reset camera', 'center view'],
    action: 'RESET_VIEW'
  },
  {
    patterns: ['zoom in', 'closer'],
    action: 'ZOOM_IN'
  },
  {
    patterns: ['zoom out', 'further'],
    action: 'ZOOM_OUT'
  },
  {
    patterns: ['stop listening', 'stop', 'pause'],
    action: 'STOP_LISTENING'
  }
]

// Fuzzy string matching function
function fuzzyMatch(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim()
  const s2 = str2.toLowerCase().trim()

  // Exact match
  if (s1 === s2) return 1.0

  // Contains match
  if (s1.includes(s2) || s2.includes(s1)) return 0.8

  // Word overlap
  const words1 = s1.split(/\s+/)
  const words2 = s2.split(/\s+/)
  const overlap = words1.filter(word => words2.some(w2 => w2.includes(word) || word.includes(w2))).length
  const totalWords = Math.max(words1.length, words2.length)

  return overlap / totalWords
}

// Command recognition function
function recognizeCommand(transcript: string): { action: string; confidence: number; data?: any; pattern: string } | null {
  // 1. Try complex natural language parsing
  const complexCmd = parseNaturalLanguageCommand(transcript)
  if (complexCmd) {
    return {
      action: 'ADD_COMPLEX',
      confidence: 1.0,
      data: complexCmd,
      pattern: transcript
    }
  }

  let bestMatch = null
  let bestConfidence = 0.0

  for (const pattern of COMMAND_PATTERNS) {
    for (const patternText of pattern.patterns) {
      const confidence = fuzzyMatch(transcript, patternText)
      if (confidence > bestConfidence) {
        bestConfidence = confidence
        bestMatch = {
          action: pattern.action,
          confidence,
          data: { element: pattern.element, template: pattern.template, bondType: pattern.bondType },
          pattern: patternText
        }
      }
    }
  }

  // 3. Check for "Add [Element]" generic
  const addRegex = /^(?:add|place|insert)\s+([a-z]+)(?:\s+atom)?$/i
  const addMatch = transcript.match(addRegex)
  if (addMatch) {
    return {
      action: 'ADD_ELEMENT',
      confidence: 0.85,
      data: { element: addMatch[1] },
      pattern: transcript
    }
  }

  // 4. Fallback: Generic Generation Command
  // "Build caffeine", "Create aspirin", "Show me Vitamin C"
  if (bestConfidence < 0.8) { // If pattern match isn't very strong
    const genRegex = /^(?:build|make|create|show|generate|display)\s+(?:me\s+|structure\s+of\s+|structure\s+for\s+)?(.+)$/i
    const match = transcript.match(genRegex)
    if (match) {
      const query = match[1].trim()
      // Filter out simple noise like "molecule" if it's at the end
      const cleanQuery = query.replace(/\s+molecule$/i, '')

      if (cleanQuery.length > 2) {
        // Prefer this over a weak pattern match
        return {
          action: 'GENERATE_MOLECULE',
          confidence: 0.9,
          data: { query: cleanQuery },
          pattern: transcript
        }
      }
    }
  }

  return bestMatch
}

function speak(text: string) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    window.speechSynthesis.speak(utterance)
  }
}

// Logging Helper
const logVoiceEvent = async (type: string, message: string, level?: number, confidence?: number) => {
  try {
    await fetch('/api/voice-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, message, timestamp: Date.now(), level, confidence })
    })
  } catch (e) {
    // Silent fail
  }
}

export default function VoiceCommandSystem({
  onCommand,
  isListening,
  onToggleListening,
  className
}: VoiceCommandSystemProps) {
  const [inputValue, setInputValue] = useState('')
  const [isSupported, setIsSupported] = useState(false)
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const [hasInteracted, setHasInteracted] = useState(false)

  const [suggestion, setSuggestion] = useState<{ text: string, type: 'error' | 'suggestion', action?: () => void } | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const recognitionRef = useRef<typeof window.SpeechRecognition | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)

  const PLACEHOLDERS = [
    "Build benzene ring",
    "Add carbon atom",
    "Analyze this molecule",
    "Undo last action",
    "Clear scene"
  ]

  // Placeholder animation
  useEffect(() => {
    if (hasInteracted) return
    const interval = setInterval(() => {
      setPlaceholderIndex(prev => (prev + 1) % PLACEHOLDERS.length)
    }, 3000)
    return () => clearInterval(interval)
  }, [hasInteracted, PLACEHOLDERS.length])

  // Initialize speech recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      const recognition = new SpeechRecognition()

      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'en-US'
      recognition.maxAlternatives = 1

      recognition.onresult = (event: any) => {
        const last = event.results.length - 1
        const transcript = event.results[last][0].transcript
        const isFinal = event.results[last].isFinal
        const confidence = event.results[last][0].confidence

        setInputValue(transcript)
        setHasInteracted(true)

        logVoiceEvent('TRANSCRIPT', transcript, undefined, confidence)

        if (isFinal) {
          handleSubmit(transcript)
        }
      }

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error)
        logVoiceEvent('ERROR', event.error)
      }

      recognition.onend = () => {
        if (isListening) {
          setTimeout(() => {
            try {
              recognition.start()
            } catch (e) { }
          }, 100)
        }
      }

      recognitionRef.current = recognition
      setIsSupported(true)
    } else {
      setIsSupported(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isListening])

  // Audio Level Monitoring
  useEffect(() => {
    if (!isListening) return

    let analyser: AnalyserNode
    let microphone: MediaStreamAudioSourceNode
    let javascriptNode: ScriptProcessorNode
    let stream: MediaStream

    const initAudio = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const AudioContext = window.AudioContext || window.webkitAudioContext
        const audioContext = new AudioContext()
        audioContextRef.current = audioContext

        analyser = audioContext.createAnalyser()
        microphone = audioContext.createMediaStreamSource(stream)
        javascriptNode = audioContext.createScriptProcessor(2048, 1, 1)

        analyser.smoothingTimeConstant = 0.8
        analyser.fftSize = 1024

        microphone.connect(analyser)
        analyser.connect(javascriptNode)
        javascriptNode.connect(audioContext.destination)

        javascriptNode.onaudioprocess = () => {
          const array = new Uint8Array(analyser.frequencyBinCount)
          analyser.getByteFrequencyData(array)
          let values = 0
          for (let i = 0; i < array.length; i++) {
            values += array[i]
          }
          const average = values / array.length

          // Log significant levels occasionally
          if (average > 10 && Math.random() < 0.05) {
            logVoiceEvent('AUDIO_LEVEL', 'Active', average / 255)
          }
        }
      } catch (e) {
        console.error('Audio init failed', e)
      }
    }

    initAudio()
    logVoiceEvent('STATUS', 'Listening Started')

    return () => {
      if (stream) stream.getTracks().forEach(track => track.stop())
      if (audioContextRef.current) audioContextRef.current.close()
      logVoiceEvent('STATUS', 'Listening Stopped')
    }
  }, [isListening])

  // Handle listening state changes
  useEffect(() => {
    if (!recognitionRef.current || !isSupported) return

    if (isListening) {
      try {
        recognitionRef.current.start()
      } catch (error) { }
    } else {
      try {
        recognitionRef.current.stop()
      } catch (error) { }
    }
  }, [isListening, isSupported])

  const handleSubmit = async (textOverride?: string) => {
    const textToProcess = textOverride || inputValue
    if (!textToProcess.trim()) return

    setHasInteracted(true)
    setSuggestion(null)

    const parts = textToProcess.split(/\s+(?:and|then|after\s+that)\s+/i)
    let executedCount = 0
    let lastCommand = null

    for (const part of parts) {
      const cleanPart = part.trim()
      if (!cleanPart) continue

      const command = recognizeCommand(cleanPart)

      if (command && command.confidence > 0.6) {
        const voiceCommand: VoiceCommand = {
          command: cleanPart,
          action: command.action,
          confidence: command.confidence,
          timestamp: new Date(),
          data: command.data
        }
        onCommand(voiceCommand)
        executedCount++
        lastCommand = command

        // Delay to allow state updates (crucial for "Clear and Add")
        if (parts.length > 1) {
          await new Promise(r => setTimeout(r, 800))
        }
      } else if (/\b(?:bond|bonding)\b/i.test(cleanPart)) {
        // Block "bond" keyword if not a valid command
        setFeedback("Bonding operations must be done via the UI")
        setTimeout(() => setFeedback(null), 3000)
      } else if (parts.length === 1) {
        // Only show error if it's a single command and failed
        setFeedback(`Unknown command`)
        setTimeout(() => setFeedback(null), 3000)
      }
    }

    if (executedCount > 0 && lastCommand) {
      const command = lastCommand
      const successMsg = `Executed: ${command.pattern}`

      if (textOverride) {
        let speakText = "Command executed"
        if (command.action === 'ADD_COMPLEX') {
          speakText = `Added ${command.data.count} ${command.data.subjectElement} to ${command.data.targetElement}`
        } else if (command.data?.element) {
          speakText = `Added ${command.data.element}`
        }
        speak(speakText)
      } else {
        setFeedback(successMsg)
        setTimeout(() => setFeedback(null), 3000)
      }
    }

    if (!textOverride) setInputValue('')
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value)
    setHasInteracted(true)
    setSuggestion(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit()
  }

  if (!isSupported) {
    return (
      <div className={`glass-panel bg-white/40 dark:bg-white/10 backdrop-blur-xl border border-elixra-border-subtle rounded-full p-2 flex items-center justify-center ${className}`}>
        <VolumeX className="h-5 w-5 text-elixra-secondary mr-2" />
        <span className="text-xs text-elixra-secondary">Voice not supported</span>
      </div>
    )
  }

  return (
    <div className={`relative ${className}`}>
      {/* Success Feedback Toast */}
      <AnimatePresence>
        {feedback && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-elixra-success text-white text-xs font-bold rounded-full shadow-lg whitespace-nowrap pointer-events-none z-[110]"
          >
            {feedback}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Control Bar */}
      <div className="glass-panel bg-white/40 dark:bg-white/5 backdrop-blur-2xl border border-elixra-border-subtle rounded-full p-1 flex items-center gap-2 !rounded-full !p-1 shadow-lg hover:shadow-xl transition-shadow duration-300">
        <motion.button
          onClick={onToggleListening}
          className={`p-2 rounded-full transition-all duration-300 flex-shrink-0 ${isListening
              ? 'bg-elixra-bunsen text-white shadow-lg shadow-elixra-bunsen/20 animate-pulse'
              : 'bg-transparent text-elixra-secondary hover:text-elixra-charcoal dark:hover:text-white'
            }`}
          whileTap={{ scale: 0.9 }}
          title={isListening ? "Stop listening" : "Start voice commands"}
        >
          {isListening ? <Mic size={18} /> : <MicOff size={18} />}
        </motion.button>

        <div className="flex-1 relative h-8 min-w-0">
          <input
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            className="w-full h-full bg-transparent border-none outline-none text-sm text-elixra-charcoal dark:text-white placeholder-transparent font-medium px-2"
          />
          <AnimatePresence mode="wait">
            {!inputValue && !hasInteracted && (
              <motion.div
                key={placeholderIndex}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute inset-0 flex items-center pointer-events-none text-elixra-secondary/50 text-sm italic px-2 truncate"
              >
                {PLACEHOLDERS[placeholderIndex]}
              </motion.div>
            )}
            {!inputValue && hasInteracted && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 flex items-center pointer-events-none text-elixra-secondary/30 text-sm italic px-2 truncate"
              >
                Type a command...
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <motion.button
          onClick={() => handleSubmit()}
          className="p-2 rounded-full bg-elixra-bunsen/10 text-elixra-bunsen hover:bg-elixra-bunsen hover:text-white transition-all flex-shrink-0"
          whileTap={{ scale: 0.9 }}
          title="Submit command"
        >
          <Plus size={18} />
        </motion.button>
      </div>
    </div>
  )
}
