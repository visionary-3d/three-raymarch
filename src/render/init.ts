import * as THREE from 'three'
import Stats from 'three/examples/jsm/libs/stats.module.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { EffectComposer, Pass } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import TickManager from './controllers/tick-manager'

import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader'

// wasm
import Rapier from '@dimforge/rapier3d'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls'
import AvatarController from './controllers/character-controller'
import Scene, { SceneLightsManager } from './controllers/scene'
import { _addCapsule } from './controllers/utils/meshes'
import GeneralLoader from './loaders/general-loader'
import InitRapier from './physics/RAPIER'
import { PhysicsObject } from './physics/physics'
import { GRAVITY } from './physics/utils/constants'

const GUI = require('three/examples/jsm/libs/lil-gui.module.min.js').GUI

type WindowSize = { width: number; height: number }
type WindowSizeUpdateFunction = (width: number, height: number) => void

const _ = undefined

let scene: Scene,
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
  renderTickManager: TickManager,
  renderTarget: THREE.WebGLRenderTarget,
  composer: EffectComposer,
  controls: AvatarController,
  transformControls: TransformControls,
  stats: Stats,
  gui: typeof GUI,
  renderWidth: number,
  renderHeight: number,
  renderAspectRatio: number,
  gltfLoader: GLTFLoader,
  textureLoader: THREE.TextureLoader,
  exrLoader: EXRLoader,
  generalLoader: GeneralLoader,
  RAPIER: typeof Rapier,
  physicsWorld: Rapier.World,
  physicsObjects: Array<PhysicsObject>,
  windowSizeUpdateFunctions: Array<WindowSizeUpdateFunction>,
  sceneLightsManager: SceneLightsManager,
  windowSize: WindowSize = { width: 0, height: 0 }


export const initEngine = async () => {
  // wasm
  // WASM = await initializeWasm()

  // physics -> Rapier
  RAPIER = await InitRapier()
  physicsWorld = new RAPIER.World(GRAVITY)
  physicsObjects = [] // initializing physics objects array

  // rendering -> THREE.js

  // * NOTE: this is not a three.js scene, it's been modified
  sceneLightsManager = new SceneLightsManager()
  scene = new Scene(sceneLightsManager)

  renderWidth = window.innerWidth
  renderHeight = window.innerHeight

  renderAspectRatio = renderWidth / renderHeight

  camera = new THREE.PerspectiveCamera(80, renderAspectRatio, 0.5, 1000)
  camera.position.z = 5

  renderer = new THREE.WebGLRenderer({ antialias: true /* logarithmicDepthBuffer: true  */ })
  renderer.setSize(renderWidth, renderHeight)
  renderer.setPixelRatio(window.devicePixelRatio * 1.5)

  renderer.toneMapping = THREE.ACESFilmicToneMapping

  // shadow
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  // renderer.setClearColor(0x000)

  document.body.appendChild(renderer.domElement)

  renderTarget = new THREE.WebGLRenderTarget(renderWidth, renderHeight, {
    samples: 8,
  })
  composer = new EffectComposer(renderer, renderTarget)
  composer.setSize(renderWidth, renderHeight)
  composer.setPixelRatio(renderer.getPixelRatio())

  const renderPass = new RenderPass(scene, camera)
  composer.addPass(renderPass)

  stats = Stats()
  // document.body.appendChild(stats.dom)

  renderTickManager = new TickManager(_, renderer)

  // gui = new GUI()

  // window size
  windowSizeUpdateFunctions = []

  window.addEventListener(
    'resize',
    () => {
      renderWidth = window.innerWidth
      renderHeight = window.innerHeight
      renderAspectRatio = renderWidth / renderHeight

      renderer.setPixelRatio(window.devicePixelRatio)

      camera.aspect = renderAspectRatio
      camera.updateProjectionMatrix()

      renderer.setSize(renderWidth, renderHeight)
      composer.setSize(renderWidth, renderHeight)

      for (let i = 0; i < windowSizeUpdateFunctions.length; i++) {
        const fn = windowSizeUpdateFunctions[i]
        fn(renderWidth, renderHeight)
      }
    },
    false
  )

  // controls
  const capsule = _addCapsule(1.5, 0.5, 30, 30)
  controls = new AvatarController(capsule, camera)

  // transform controls
  transformControls = new TransformControls(camera, renderer.domElement)
  scene.add(transformControls)

  window.addEventListener('keydown', function (event) {
    switch (event.code) {
      case 'KeyQ': // Q
        transformControls.setSpace(transformControls.space === 'local' ? 'world' : 'local')
        break

      // case '': // Shift
      //   transformControls.setTranslationSnap(100)
      //   transformControls.setRotationSnap(THREE.MathUtils.degToRad(15))
      //   transformControls.setScaleSnap(0.25)
      //   break

      case 'KeyG': // G
        transformControls.setMode('translate')
        break

      case 'KeyR': // R
        transformControls.setMode('rotate')
        break

      case 'KeyS': // S
        transformControls.setMode('scale')
        break

      // case 107: // +, =, num+
      //   transformControls.setSize(transformControls.size + 0.1)
      //   break

      // case 189:
      // case 109: // -, _, num-
      //   transformControls.setSize(Math.max(transformControls.size - 0.1, 0.1))
      //   break

      // case 88: // X
      //   transformControls.showX = !transformControls.showX
      //   break

      // case 89: // Y
      //   transformControls.showY = !transformControls.showY
      //   break

      // case 90: // Z
      //   transformControls.showZ = !transformControls.showZ
      //   break

      // case 32: // Spacebar
      //   transformControls.enabled = !transformControls.enabled
      //   break

      // case 27: // Esc
      //   transformControls.reset()
      //   break
    }
  })
  // transformControls.addEventListener('change', render)

  // config
  generalLoader = new GeneralLoader()

  gltfLoader = new GLTFLoader()
  textureLoader = new THREE.TextureLoader()
  exrLoader = new EXRLoader()

  renderTickManager.startLoop()
}

export const useRenderer = () => renderer

export const useRenderSize = () => {
  windowSize.width = renderWidth
  windowSize.height = renderHeight

  return windowSize
}

export const useOnRenderResizeFunction = (fn: WindowSizeUpdateFunction) =>
  windowSizeUpdateFunctions.push(fn)

export const useScene = () => scene

export const useCamera = () => camera

export const useControls = () => controls

export const usePointerLocked = () => controls.characterController.inputController.pointerLocked

export const useTransformControls = () => transformControls

export const useStats = () => stats

export const useRenderTarget = () => renderTarget

export const useComposer = () => composer

export const useGui = () => gui

export const addPass = (pass: Pass) => {
  composer.addPass(pass)
}

export const useTick = (fn: Function) => {
  if (renderTickManager) {
    const _tick = (e: any) => {
      fn(e.data)
    }
    renderTickManager.addEventListener('tick', _tick)
  }
}

export const useSceneLightsManager = () => sceneLightsManager

export const useSceneLightsUpdate = (fn: Function) => sceneLightsManager.addUpdateFunction(fn)

export const useGltfLoader = () => gltfLoader

export const useTextureLoader = () => textureLoader

export const useExrLoader = () => exrLoader

export const useLoader = () => generalLoader

export const usePhysics = () => physicsWorld

export const usePhysicsObjects = () => physicsObjects

// export const useWasm = () => WASM

export { RAPIER }
