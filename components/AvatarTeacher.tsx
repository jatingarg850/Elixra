'use client'

import { useRef, useEffect, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Environment, useGLTF } from '@react-three/drei'
import * as THREE from 'three'

// Avatar Model Component using GLB
function AvatarModel({ speaking = false, lipSyncIntensity = 0 }: { speaking: boolean, lipSyncIntensity?: number }) {
  const groupRef = useRef<THREE.Group>(null)
  const [morphTargetMeshes, setMorphTargetMeshes] = useState<THREE.Mesh[]>([])
  const [bones, setBones] = useState<{ bone: THREE.Bone | THREE.Object3D, name: string, type: string }[]>([])
  const headBoneRef = useRef<THREE.Bone | THREE.Object3D | null>(null)
  const jawBoneRef = useRef<THREE.Bone | THREE.Object3D | null>(null)
  const eyeBoneRef = useRef<THREE.Bone | THREE.Object3D | null>(null)
  const leftArmRef = useRef<THREE.Bone | THREE.Object3D | null>(null)
  const rightArmRef = useRef<THREE.Bone | THREE.Object3D | null>(null)
  const leftShoulderRef = useRef<THREE.Bone | THREE.Object3D | null>(null)
  const rightShoulderRef = useRef<THREE.Bone | THREE.Object3D | null>(null)

  // Load the GLB model
  const { scene } = useGLTF('/avatar.glb')

  // Clone the scene to avoid modifying the cached version
  const clonedScene = scene.clone()

  // Auto-detect bones and morph targets - targeting Wolf3D model
  useEffect(() => {
    const meshes: THREE.Mesh[] = []
    const detectedBones: { bone: THREE.Bone | THREE.Object3D, name: string, type: string }[] = []

    clonedScene.traverse((child) => {
      // Find morph targets
      if (child instanceof THREE.Mesh && child.morphTargetInfluences) {
        meshes.push(child)
        console.log('✅ Found mesh with morph targets:', child.name, 'Count:', child.morphTargetInfluences.length)
        if (child.morphTargetDictionary) {
          console.log('📋 Morph targets:', Object.keys(child.morphTargetDictionary))
        }
      }

      // Find specific Wolf3D meshes and bones
      const name = child.name

      // Head mesh
      if (name === 'Wolf3D_Head' || name.includes('Head')) {
        headBoneRef.current = child
        console.log('🎯 Found HEAD:', name)
      }

      // Teeth/Jaw for mouth animation
      if (name === 'Wolf3D_Teeth' || name.includes('Teeth') || name.includes('Jaw')) {
        jawBoneRef.current = child
        console.log('🎯 Found JAW/TEETH:', name)
      }

      // Eyes
      if (name.includes('Eye')) {
        eyeBoneRef.current = child
        console.log('🎯 Found EYES:', name)
      }

      // Find bones in armature
      if (child.type === 'Bone') {
        const boneName = child.name.toLowerCase()
        let type = 'body'

        if (boneName.includes('head')) {
          type = 'head'
          if (!headBoneRef.current) headBoneRef.current = child
        } else if (boneName.includes('jaw') || boneName.includes('chin')) {
          type = 'jaw'
          if (!jawBoneRef.current) jawBoneRef.current = child
        } else if (boneName.includes('eye')) {
          type = 'eye'
          if (!eyeBoneRef.current) eyeBoneRef.current = child
        } else if (boneName.includes('leftarm') || boneName.includes('left_arm') || boneName.includes('leftupperarm') ||
          boneName.includes('arm_l') || boneName.includes('arml') || boneName.includes('l_arm')) {
          type = 'leftArm'
          if (!leftArmRef.current) leftArmRef.current = child
          console.log('💪 Found LEFT ARM:', child.name)
        } else if (boneName.includes('rightarm') || boneName.includes('right_arm') || boneName.includes('rightupperarm') ||
          boneName.includes('arm_r') || boneName.includes('armr') || boneName.includes('r_arm')) {
          type = 'rightArm'
          if (!rightArmRef.current) rightArmRef.current = child
          console.log('💪 Found RIGHT ARM:', child.name)
        } else if (boneName.includes('leftshoulder') || boneName.includes('left_shoulder') ||
          boneName.includes('shoulder_l') || boneName.includes('shoulderl') || boneName.includes('l_shoulder')) {
          type = 'leftShoulder'
          if (!leftShoulderRef.current) leftShoulderRef.current = child
          console.log('💪 Found LEFT SHOULDER:', child.name)
        } else if (boneName.includes('rightshoulder') || boneName.includes('right_shoulder') ||
          boneName.includes('shoulder_r') || boneName.includes('shoulderr') || boneName.includes('r_shoulder')) {
          type = 'rightShoulder'
          if (!rightShoulderRef.current) rightShoulderRef.current = child
          console.log('💪 Found RIGHT SHOULDER:', child.name)
        }

        // Log ALL bones to help debug
        console.log('🦴 ALL BONES:', child.name, 'Type:', child.type)

        detectedBones.push({ bone: child, name: child.name, type })
        console.log('🦴 Found bone:', child.name, 'Type:', type)
      }
    })

    setMorphTargetMeshes(meshes)
    setBones(detectedBones)
    console.log(`🎭 Wolf3D Animation ready: ${meshes.length} morph targets, ${detectedBones.length} bones`)
    console.log(`🎯 Targets: Head=${!!headBoneRef.current}, Jaw=${!!jawBoneRef.current}, Eyes=${!!eyeBoneRef.current}`)
    console.log(`💪 ARM BONES: LeftShoulder=${!!leftShoulderRef.current}, RightShoulder=${!!rightShoulderRef.current}`)
    console.log(`💪 ARM BONES: LeftArm=${!!leftArmRef.current}, RightArm=${!!rightArmRef.current}`)

    // If bones not found, try to find them by traversing the entire skeleton
    if (!leftShoulderRef.current || !rightShoulderRef.current || !leftArmRef.current || !rightArmRef.current) {
      console.warn('⚠️ Some arm bones not found! Listing all bones:')
      clonedScene.traverse((child) => {
        if (child.type === 'Bone') {
          console.log('  🦴', child.name)
        }
      })
    }
  }, [clonedScene])

  // Debug speaking state
  useEffect(() => {
    console.log('🎤 Speaking state changed:', speaking)
  }, [speaking])

  // Force rendering
  const { invalidate } = useThree()

  // Log when component mounts
  useEffect(() => {
    console.log('🎭 AvatarModel mounted, groupRef:', !!groupRef.current)
    console.log('🎭 Scene children:', clonedScene.children.length)
    invalidate() // Force a render
  }, [clonedScene, invalidate, morphTargetMeshes])



  // Use requestAnimationFrame instead of useFrame (Next.js compatible)
  // Store speaking state and lip sync intensity in refs to avoid re-renders
  const speakingRef = useRef(speaking)
  const lipSyncIntensityRef = useRef(lipSyncIntensity)

  useEffect(() => {
    speakingRef.current = speaking
  }, [speaking])

  useEffect(() => {
    lipSyncIntensityRef.current = lipSyncIntensity
  }, [lipSyncIntensity])

  useEffect(() => {
    console.log('🎬 Starting requestAnimationFrame animation loop')
    let frameId: number
    let frameCount = 0
    let nextBlinkTime = Date.now() + 2000 + Math.random() * 3000 // Random blink between 2-5 seconds
    let isBlinking = false
    let blinkStartTime = 0

    const animate = () => {
      if (!groupRef.current) {
        frameId = requestAnimationFrame(animate)
        return
      }

      const time = Date.now() * 0.001
      const now = Date.now()
      const isSpeaking = speakingRef.current

      // Log every 60 frames
      if (frameCount % 60 === 0) {
        console.log('🎬 RAF frame #' + frameCount, 'speaking:', isSpeaking)
        console.log('💪 Arm bones status:', {
          leftShoulder: !!leftShoulderRef.current,
          rightShoulder: !!rightShoulderRef.current,
          leftArm: !!leftArmRef.current,
          rightArm: !!rightArmRef.current
        })
        if (leftArmRef.current) {
          console.log('💪 Left arm rotation:', leftArmRef.current.rotation)
        }
      }
      frameCount++

      // BODY ANIMATIONS (always active)
      groupRef.current.rotation.z = Math.sin(time) * 0.15
      groupRef.current.scale.y = 1 + Math.sin(time * 2) * 0.05
      groupRef.current.rotation.y = Math.sin(time * 0.5) * 0.1

      if (isSpeaking) {
        groupRef.current.rotation.x = Math.sin(time * 8) * 0.1
        groupRef.current.scale.x = 1 + Math.sin(time * 10) * 0.03
      } else {
        groupRef.current.rotation.x = 0
        groupRef.current.scale.x = 1
      }

      // HEAD BONE
      if (headBoneRef.current) {
        if (isSpeaking) {
          headBoneRef.current.rotation.z = Math.sin(time * 2) * 0.1
          headBoneRef.current.rotation.x = Math.sin(time * 1.5) * 0.08
        } else {
          headBoneRef.current.rotation.z = Math.sin(time * 0.5) * 0.03
          headBoneRef.current.rotation.x = 0
        }
      }

      // JAW BONE
      if (jawBoneRef.current) {
        if (isSpeaking) {
          jawBoneRef.current.rotation.x = Math.abs(Math.sin(time * 10)) * 0.4
        } else {
          jawBoneRef.current.rotation.x = 0
        }
      }

      // ARM ANIMATIONS - Natural human-like poses
      // LEFT SHOULDER - Primary control for arm position
      if (leftShoulderRef.current) {
        if (isSpeaking) {
          // Animated shoulder movement when speaking
          leftShoulderRef.current.rotation.x = -0.2 + Math.sin(time * 1.5) * 0.1  // Forward/back
          leftShoulderRef.current.rotation.z = 0.5 + Math.sin(time * 2) * 0.15    // Up/down gesture
          leftShoulderRef.current.rotation.y = Math.sin(time * 1.8) * 0.1         // Slight twist
        } else {
          // Relaxed shoulder position (idle)
          leftShoulderRef.current.rotation.x = -0.1  // Slight forward
          leftShoulderRef.current.rotation.z = 0.3   // Rotated down
          leftShoulderRef.current.rotation.y = 0.05  // Slight inward
        }
      }

      // RIGHT SHOULDER - Primary control for arm position
      if (rightShoulderRef.current) {
        if (isSpeaking) {
          // Animated shoulder movement when speaking (opposite phase)
          rightShoulderRef.current.rotation.x = -0.2 + Math.sin(time * 1.5 + Math.PI) * 0.1
          rightShoulderRef.current.rotation.z = -0.5 + Math.sin(time * 2 + Math.PI) * 0.15
          rightShoulderRef.current.rotation.y = Math.sin(time * 1.8 + Math.PI) * 0.1
        } else {
          // Relaxed shoulder position (idle)
          rightShoulderRef.current.rotation.x = -0.1   // Slight forward
          rightShoulderRef.current.rotation.z = -0.3   // Rotated down
          rightShoulderRef.current.rotation.y = -0.05  // Slight inward
        }
      }

      // LEFT ARM (Upper Arm) - Secondary control for natural hang
      if (leftArmRef.current) {
        if (isSpeaking) {
          // Expressive gestures when speaking
          leftArmRef.current.rotation.z = 1.2 + Math.sin(time * 2.5) * 0.3      // Main down rotation + gesture
          leftArmRef.current.rotation.x = 0.4 + Math.sin(time * 2) * 0.2        // Forward/back movement
          leftArmRef.current.rotation.y = Math.sin(time * 1.5) * 0.15           // Twist for natural look
        } else {
          // Natural hanging position (idle) - subtle breathing motion
          leftArmRef.current.rotation.z = 1.0 + Math.sin(time * 0.5) * 0.05    // Hanging down with breathing
          leftArmRef.current.rotation.x = 0.3 + Math.sin(time * 0.8) * 0.03    // Slight forward
          leftArmRef.current.rotation.y = 0.1                                    // Slight inward rotation
        }
      }

      // RIGHT ARM (Upper Arm) - Secondary control for natural hang
      if (rightArmRef.current) {
        if (isSpeaking) {
          // Expressive gestures when speaking (opposite phase)
          rightArmRef.current.rotation.z = -1.2 + Math.sin(time * 2.5 + Math.PI) * 0.3
          rightArmRef.current.rotation.x = 0.4 + Math.sin(time * 2 + Math.PI) * 0.2
          rightArmRef.current.rotation.y = Math.sin(time * 1.5 + Math.PI) * 0.15
        } else {
          // Natural hanging position (idle) - subtle breathing motion
          rightArmRef.current.rotation.z = -1.0 + Math.sin(time * 0.5 + 1) * 0.05  // Hanging down with breathing
          rightArmRef.current.rotation.x = 0.3 + Math.sin(time * 0.8 + 1) * 0.03   // Slight forward
          rightArmRef.current.rotation.y = -0.1                                      // Slight inward rotation
        }
      }

      // NATURAL BLINKING SYSTEM
      // Trigger a new blink at random intervals (3-6 seconds)
      if (!isBlinking && now >= nextBlinkTime) {
        isBlinking = true
        blinkStartTime = now
        console.log('👁️ Blink started')
      }

      // Calculate blink value (smooth open -> close -> open)
      let blinkValue = 0
      if (isBlinking) {
        const blinkDuration = 350 // 350ms total blink duration (much slower)
        const elapsed = now - blinkStartTime

        if (elapsed < blinkDuration) {
          // Smooth blink curve: 0 -> 1 -> 0
          const progress = elapsed / blinkDuration
          blinkValue = Math.sin(progress * Math.PI) // Smooth sine curve
        } else {
          // Blink finished
          isBlinking = false
          blinkValue = 0
          // Schedule next blink (3-6 seconds from now)
          nextBlinkTime = now + 3000 + Math.random() * 3000
          console.log('👁️ Blink finished, next in', (nextBlinkTime - now) / 1000, 'seconds')
        }
      }

      // MORPH TARGETS (lip sync + blinking)
      morphTargetMeshes.forEach((mesh) => {
        if (!mesh.morphTargetInfluences || !mesh.morphTargetDictionary) return

        // Apply blinking to eye meshes
        const eyeBlinkLeftIndex = mesh.morphTargetDictionary['eyeBlinkLeft']
        const eyeBlinkRightIndex = mesh.morphTargetDictionary['eyeBlinkRight']

        if (eyeBlinkLeftIndex !== undefined) {
          mesh.morphTargetInfluences[eyeBlinkLeftIndex] = blinkValue
        }
        if (eyeBlinkRightIndex !== undefined) {
          mesh.morphTargetInfluences[eyeBlinkRightIndex] = blinkValue
        }

        // Realistic lip sync when speaking - uses intensity from speech events
        if (isSpeaking) {
          const currentIntensity = lipSyncIntensityRef.current

          // If we have real-time intensity from speech events, use it
          if (currentIntensity > 0) {
            const jawIndex = mesh.morphTargetDictionary['jawOpen']
            if (jawIndex !== undefined) {
              // Use the intensity directly with smooth interpolation
              const targetValue = currentIntensity * 0.7  // Max 70% jaw opening
              const currentValue = mesh.morphTargetInfluences[jawIndex] || 0
              // Smooth transition to avoid jerky movements
              mesh.morphTargetInfluences[jawIndex] = currentValue + (targetValue - currentValue) * 0.3
            }

            // Add subtle mouth movements for realism
            const mouthOpenIndex = mesh.morphTargetDictionary['mouthOpen']
            if (mouthOpenIndex !== undefined) {
              mesh.morphTargetInfluences[mouthOpenIndex] = currentIntensity * 0.4
            }
          } else {
            // Fallback: use time-based animation if no intensity data
            const jawIndex = mesh.morphTargetDictionary['jawOpen']
            if (jawIndex !== undefined) {
              // Natural speech rhythm with multiple frequencies
              const rhythm = (Math.sin(time * 8) + Math.sin(time * 12.5) + Math.sin(time * 6.2)) / 3
              mesh.morphTargetInfluences[jawIndex] = Math.abs(rhythm) * 0.6
            }
          }
        } else {
          // Reset jaw when not speaking (but keep blink values)
          const jawIndex = mesh.morphTargetDictionary['jawOpen']
          if (jawIndex !== undefined) {
            // Smooth close
            const currentValue = mesh.morphTargetInfluences[jawIndex] || 0
            mesh.morphTargetInfluences[jawIndex] = currentValue * 0.7  // Gradual close
          }

          const mouthOpenIndex = mesh.morphTargetDictionary['mouthOpen']
          if (mouthOpenIndex !== undefined) {
            const currentValue = mesh.morphTargetInfluences[mouthOpenIndex] || 0
            mesh.morphTargetInfluences[mouthOpenIndex] = currentValue * 0.7
          }
        }
      })

      invalidate() // Tell Three.js to re-render
      frameId = requestAnimationFrame(animate)
    }

    frameId = requestAnimationFrame(animate)

    return () => {
      console.log('🛑 Stopping RAF animation loop')
      cancelAnimationFrame(frameId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Empty deps - only run once!

  return (
    <group ref={groupRef} position={[0, -1.2, 0]}>
      <primitive object={clonedScene} scale={4} />
    </group>
  )
}

// Preload the GLB model
useGLTF.preload('/avatar.glb')

// Main Avatar Component with lip sync intensity control
export default function AvatarTeacher({ speaking = false, lipSyncIntensity = 0 }: { speaking: boolean, lipSyncIntensity?: number }) {
  useEffect(() => {
    console.log('🎬 AvatarTeacher mounted, speaking:', speaking)
  }, [speaking])

  useEffect(() => {
    console.log('🎤 Speaking prop changed:', speaking, 'intensity:', lipSyncIntensity)
  }, [speaking, lipSyncIntensity])

  return (
    <div className="w-full h-full relative">
      <Canvas
        camera={{ position: [0, 0.8, 2.5], fov: 50 }}
        style={{ background: 'transparent' }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
        frameloop="always"
      >
        <ambientLight intensity={0.8} />
        <directionalLight position={[5, 5, 5]} intensity={1.2} />
        <pointLight position={[-5, 3, -5]} intensity={0.5} color="#8b5cf6" />
        <spotLight position={[0, 5, 0]} intensity={0.5} angle={0.3} penumbra={1} />

        <AvatarModel speaking={speaking} lipSyncIntensity={lipSyncIntensity} />

        <Environment preset="city" />
        <OrbitControls
          target={[0, 1.2, 0]}
          enableZoom={true}
          enablePan={false}
          minDistance={1.5}
          maxDistance={4}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={Math.PI / 2}
        />
      </Canvas>

      {/* Debug overlay */}
      <div className="absolute top-2 left-2 bg-black/50 text-white text-xs p-2 rounded">
        Speaking: {speaking ? 'YES' : 'NO'}
      </div>
    </div>
  )
}
