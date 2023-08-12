import * as THREE from 'three'
import {
  useComposer,
  useControls,
  usePhysics,
  usePhysicsObjects,
  useRenderer,
  useStats,
} from '../init'

// animation params
type Frame = XRFrame | null

export type TickData = {
  timestamp: number
  timeDiff: number
  fps: number
  frame: Frame
}

const localTickData: TickData = {
  timestamp: 0,
  timeDiff: 0,
  fps: 0,
  frame: null,
}

const localFrameOpts = {
  data: localTickData,
}

const frameEvent = new MessageEvent('tick', localFrameOpts)

class TickManager extends EventTarget {
  timestamp: number
  timeDiff: number
  frame: Frame
  lastTimestamp: number
  fps: number

  constructor({ timestamp, timeDiff, frame } = localTickData, renderer: THREE.WebGLRenderer) {
    super()

    this.timestamp = timestamp
    this.timeDiff = timeDiff
    this.frame = frame
    this.lastTimestamp = 0
    this.fps = 0

    // * recording
    // Initialize and pass in canvas.
    // CanvasCapture.init(
    //   renderer.domElement,
    //   { showRecDot: true } // Options are optional, more info below.
    // )

    // // Bind key presses to begin/end recordings.
    // CanvasCapture.bindKeyToVideoRecord('v', {
    //   format: 'webm', // Options are optional, more info below.
    //   name: 'recording',
    //   quality: 1,
    // })
  }

  startLoop() {
    const composer = useComposer()
    const renderer = useRenderer()
    // const scene = useScene()
    // const camera = useCamera()
    const physics = usePhysics()
    const physicsObjects = usePhysicsObjects()
    const controls = useControls()
    const stats = useStats()

    if (!renderer) {
      throw new Error('Updating Frame Failed : Uninitialized Renderer')
    }

    const stepPhysics = () => {
      // physics
      physics.step()

      setTimeout(stepPhysics, 8)
    }

    stepPhysics()

    const animate = (timestamp: number, frame: Frame) => {
      const now = performance.now()
      this.timestamp = timestamp ?? now
      this.timeDiff = timestamp - this.lastTimestamp

      const timeDiffCapped = Math.min(Math.max(this.timeDiff, 0), 100)

      for (let i = 0; i < physicsObjects.length; i++) {
        const po = physicsObjects[i]
        const autoAnimate = po.autoAnimate

        if (autoAnimate) {
          const mesh = po.mesh
          const collider = po.collider
          if (collider) {
            mesh.position.copy(collider.translation() as THREE.Vector3)
            mesh.quaternion.copy(collider.rotation() as THREE.Quaternion)
          }
        }

        const fn = po.fn
        fn && fn()
      }

      // performance tracker start
      this.fps = 1000 / this.timeDiff
      this.lastTimestamp = this.timestamp

      controls.update(timestamp / 1000, timeDiffCapped / 1000)

      composer.render()
      // renderer.render(scene, camera);

      this.tick(timestamp, timeDiffCapped, this.fps, frame)

      // * recording
      // CanvasCapture.checkHotkeys()

      // // You need to call recordFrame() only if you are recording
      // // a video, gif, or frames.
      // if (CanvasCapture.isRecording()) CanvasCapture.recordFrame()

      stats.update()

      // performance tracker end
    }

    renderer.setAnimationLoop(animate)
  }

  tick(timestamp: number, timeDiff: number, fps: number, frame: Frame) {
    localTickData.timestamp = timestamp
    localTickData.frame = frame
    localTickData.timeDiff = timeDiff
    localTickData.fps = fps
    this.dispatchEvent(frameEvent)
  }
}

export default TickManager
