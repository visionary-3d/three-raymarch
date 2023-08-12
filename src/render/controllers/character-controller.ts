import * as THREE from 'three'
import { Object3D } from 'three'
import { RAPIER, usePhysics, useScene } from '../init'
import { useRenderer } from './../init'
import { PhysicsObject, addPhysics } from '../physics/physics'
import Rapier from '@dimforge/rapier3d'
import { GRAVITY } from '../physics/utils/constants'
import { _calculateObjectSize } from './utils/objects'
import { clamp, lerp, easeOutExpo, EaseOutCirc, UpDownCirc } from './utils/math'

const HALF_PI = Math.PI / 2
const FORWARD = new THREE.Vector3(0, 0, -1)
const LEFT = new THREE.Vector3(-1, 0, 0)
const UP = new THREE.Vector3(0, 1, 0)
const RIGHT = new THREE.Vector3(1, 0, 0)
const DOWN = new THREE.Vector3(0, -1, 0)

const quaternion_0 = new THREE.Quaternion()
const quaternion_1 = new THREE.Quaternion()
const vec3_0 = new THREE.Vector3()
const vec3_1 = new THREE.Vector3()
let ray_0: Rapier.Ray

const ball = new THREE.Mesh(
  new THREE.IcosahedronGeometry(0.2, 3),
  new THREE.MeshBasicMaterial({ color: '#ff0a0a' })
)

const MIN_ZOOM_LEVEL = 0.001 // needs to be slightly bigger than zero
const MAX_ZOOM_LEVEL = 50
const UP_DOWN_HEAD_ROTATION_LIMIT = Math.PI / 2
const SCROLL_LEVEL_STEP = 1.5
const SCROLL_ANIMATION_SPEED = 2
const JUMP_DURATION = 0.4
const JUMP_AMPLITUDE = 2
const GROUND_DETECTION_DISTANCE = 0.02

const ONE = () => {
  return 1
}
const FIVE = () => {
  return 5
}
const NEGATIVE_ONE = () => {
  return -1
}
const ZERO = () => {
  return 0
}

enum KEYS {
  a = 'KeyA',
  s = 'KeyS',
  w = 'KeyW',
  d = 'KeyD',
  space = 'Space',
  shiftL = 'ShiftLeft',
  shiftR = 'ShiftRight',
}

const KEYS_LIST = Object.values(KEYS)

type KeyDown = {
  down: boolean
  passedOneUpdateIteration: boolean
}

type KeysDown = {
  [key: string]: KeyDown
}

type NextKeysUp = {
  [key: string]: boolean
}

type MouseState = {
  leftButton: boolean
  rightButton: boolean
  mouseXDelta: number
  mouseYDelta: number
  mouseX: number
  mouseY: number
  mouseWheelDelta: number
}

class InputController {
  target: Document
  currentMouse: MouseState
  currentKeys: KeysDown
  nextKeysUp: NextKeysUp
  pointerLocked: boolean
  lastTimestamp: number

  constructor(target?: Document) {
    this.target = target || document
    this.lastTimestamp = 0
    this.currentMouse = {
      leftButton: false,
      rightButton: false,
      mouseXDelta: 0,
      mouseYDelta: 0,
      mouseX: 0,
      mouseY: 0,
      mouseWheelDelta: 0,
    }
    this.currentKeys = {}
    this.nextKeysUp = {}
    this.pointerLocked = false
    this.init()
  }

  init() {

    const keys = Object.values(KEYS)
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      // create supported keys objects
      this.currentKeys[key] = {down: false, passedOneUpdateIteration: false}
      this.nextKeysUp[key] = false
    }

    this.target.addEventListener('mousedown', (e) => this.onMouseDown(e), false)
    this.target.addEventListener('mousemove', (e) => this.onMouseMove(e), false)
    this.target.addEventListener('mouseup', (e) => this.onMouseUp(e), false)
    this.target.addEventListener('keydown', (e) => this.onKeyDown(e.code), false)
    this.target.addEventListener('keyup', (e) => this.onKeyUp(e.code), false)
    addEventListener('wheel', (e) => this.onMouseWheel(e), false)

    const renderer = useRenderer()

    const addPointerLockEvent = async () => {
      await renderer.domElement.requestPointerLock()
    }
    renderer.domElement.addEventListener('click', addPointerLockEvent)
    renderer.domElement.addEventListener('dblclick', addPointerLockEvent)
    renderer.domElement.addEventListener('mousedown', addPointerLockEvent)

    const setPointerLocked = () => {
      this.pointerLocked = document.pointerLockElement === renderer.domElement
    }
    document.addEventListener('pointerlockchange', setPointerLocked, false)
  }

  onMouseWheel(e: WheelEvent) {
    const changeMouseWheelLevel = () => {
      if (this.pointerLocked) {
        if (e.deltaY < 0) {
          // console.log('scrolling up')
          // zooming in
          this.currentMouse.mouseWheelDelta = Math.max(
            this.currentMouse.mouseWheelDelta - SCROLL_LEVEL_STEP,
            MIN_ZOOM_LEVEL
          )
        } else if (e.deltaY > 0) {
          // console.log('scrolling down')
          this.currentMouse.mouseWheelDelta = Math.min(
            this.currentMouse.mouseWheelDelta + SCROLL_LEVEL_STEP,
            MAX_ZOOM_LEVEL
          )
        }
      }
    }

    changeMouseWheelLevel()
  }

  onMouseMove(e: MouseEvent) {
    if (this.pointerLocked) {
      this.currentMouse.mouseXDelta = e.movementX
      this.currentMouse.mouseYDelta = e.movementY
    }
  }

  onMouseDown(e: MouseEvent) {
    if (this.pointerLocked) {
      this.onMouseMove(e)

      switch (e.button) {
        case 0: {
          this.currentMouse.leftButton = true
          break
        }
        case 2: {
          this.currentMouse.rightButton = true
          break
        }
      }
    }
  }

  onMouseUp(e: MouseEvent) {
    if (this.pointerLocked) {
      this.onMouseMove(e)

      switch (e.button) {
        case 0: {
          this.currentMouse.leftButton = false
          break
        }
        case 2: {
          this.currentMouse.rightButton = false
          break
        }
      }
    }
  }

  onKeyDown(keyCode: string) {
    if (this.pointerLocked && KEYS_LIST.includes(keyCode)) {
      this.currentKeys[keyCode].down = true
      this.currentKeys[keyCode].passedOneUpdateIteration = false
    }
  }

  onKeyUp(keyCode: string) {
    if (this.pointerLocked && KEYS_LIST.includes(keyCode)) {

      // keyCode == KEYS.space && console.log(this.currentKeys[keyCode].down)

      const passed = this.currentKeys[keyCode].passedOneUpdateIteration
      if(passed) {
        this.currentKeys[keyCode].down = false
        this.currentKeys[keyCode].passedOneUpdateIteration = false
      }

      this.nextKeysUp[keyCode] = !passed
    }
  }

  hasKey(keyCode: string | number) {
    if (this.pointerLocked) {
      return this.currentKeys[keyCode].down
    }

    return false
  }

  update() {
    this.currentMouse.mouseXDelta = 0
    this.currentMouse.mouseYDelta = 0

    const currentKeysArray = Object.values(this.currentKeys)
    for (let i = 0; i < currentKeysArray.length; i++) {
      const key = currentKeysArray[i];
      if(key.down) {
        key.passedOneUpdateIteration = true
      }
    }

    const nextKeysUpArrayKeys = Object.keys(this.nextKeysUp)
    const nextKeysUpArray = Object.values(this.nextKeysUp)
    for (let i = 0; i < nextKeysUpArray.length; i++) { 
      const key = nextKeysUpArrayKeys[i];
      const up = nextKeysUpArray[i];
      if(up) {
        this.onKeyUp(key)
      }
    }
  }

  runActionByKey(key: string, action: Function, inAction?: Function) {
    if (this.hasKey(key)) {
      return action()
    } else {
      return inAction && inAction()
    }
  }

  runActionByOneKey(keys: Array<string>, action: Function, inAction?: Function) {
    let check = false
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      check = this.hasKey(key)

      if (check) {
        break
      }
    }

    if (check) {
      return action()
    } else {
      return inAction && inAction()
    }
  }

  runActionByAllKeys(keys: Array<string>, action: Function, inAction?: Function) {
    let check = true
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      check = this.hasKey(key)

      if (!check) {
        break
      }
    }

    if (check) {
      return action()
    } else {
      return inAction && inAction()
    }
  }
}

// const _getAllMeshesInScene = () => {
//   const scene = useScene()
//   const objects: Object3D[] = []
//   scene.traverse(function (object: Object3D) {
//     objects.push(object)
//   })

//   return objects
// }

class HeadBobController {
  headBobTimer: number
  headBobAmount: number
  lastHeadBobDiff: number
  headBobActive: boolean

  constructor() {
    this.headBobTimer = 0
    this.lastHeadBobDiff = 0
    this.headBobAmount = 0
    this.headBobActive = false
  }

  getHeadBob(timeDiff: number, isMoving: boolean) {
    const HEAD_BOB_DURATION = 0.1
    const HEAD_BOB_FREQUENCY = 0.8
    const HEAD_BOB_AMPLITUDE = 0.09

    if (!this.headBobActive) {
      this.headBobActive = isMoving
    }

    if (this.headBobActive) {
      const STEP = Math.PI

      const currentAmount = this.headBobTimer * HEAD_BOB_FREQUENCY * (1 / HEAD_BOB_DURATION)
      const headBobDiff = currentAmount % STEP

      this.headBobTimer += timeDiff
      this.headBobAmount = Math.sin(currentAmount) * HEAD_BOB_AMPLITUDE

      if (headBobDiff < this.lastHeadBobDiff) {
        this.headBobActive = false
      }

      this.lastHeadBobDiff = headBobDiff
    }

    return this.headBobAmount
  }
}

class ZoomController {
  zoom: number
  lastZoomLevel: number
  startZoomAnimation: number
  isAnimating: boolean
  startingZoom: number

  constructor() {
    this.zoom = MIN_ZOOM_LEVEL
    this.startingZoom = 0
    this.lastZoomLevel = 0
    this.startZoomAnimation = 0
    this.isAnimating = false
  }

  update(zoomLevel: number, timestamp: number, timeDiff: number) {
    const time = timestamp * SCROLL_ANIMATION_SPEED
    const zlClamped = clamp(zoomLevel, MIN_ZOOM_LEVEL, MAX_ZOOM_LEVEL)

    const zoomLevelHasChanged = this.lastZoomLevel !== zoomLevel
    if (zoomLevelHasChanged) {
      // restart the animation
      this.startingZoom = this.zoom
      this.startZoomAnimation = time
      this.isAnimating = true
    }

    // animating
    if (this.isAnimating) {
      const progress = time - this.startZoomAnimation
      this.zoom = lerp(this.startingZoom, zlClamped, easeOutExpo(progress))

      if (progress >= 1) {
        // end the animation
        this.isAnimating = false
      }
    }

    this.lastZoomLevel = zoomLevel
  }
}

class HeightController {
  height: number
  lastHeight: number
  movePerFrame: number
  lastGroundHeight: number
  startFallAnimation: number
  fallProgress: number
  jumpProgress: number
  isAnimating: boolean
  grounded: boolean
  startJumpAnimation: number
  isTabOpen: boolean
  animatingJump: boolean

  constructor() {
    this.isTabOpen = false
    this.height = 0
    this.lastHeight = this.height
    this.movePerFrame = 0
    this.lastGroundHeight = this.height
    this.fallProgress = 0
    this.startFallAnimation = 0
    this.animatingJump = false
    this.jumpProgress = 0
    this.startJumpAnimation = 0
    this.isAnimating = false
    this.grounded = false

    this.init()
  }

  init() {
    document.addEventListener('visibilitychange', () => {
      const isVisible = document.visibilityState === 'visible'
      if (isVisible) {
        // * Keeping track of when the tab is active to re-adjust animation state
        this.isTabOpen = isVisible
      }
    })
  }

  update(timestamp: number, timeDiff: number) {
    if (this.isAnimating) {
      if (this.isTabOpen) {
        // * If the user changes the tab and then comes back, fall progress won't be lost
        this.startFallAnimation = timestamp - this.fallProgress
        this.startJumpAnimation = 0
        this.isTabOpen = !this.isTabOpen
      } else {
        this.fallProgress = timestamp - this.startFallAnimation

        const t = this.fallProgress

        // Gravity formula
        this.height = 0.5 * GRAVITY.y * t * t

        this.movePerFrame = this.height - this.lastHeight
      }
    } else {
      // reset the animation
      this.height = 0
      this.lastHeight = 0
      this.movePerFrame = 0
      this.startFallAnimation = timestamp
    }

    this.jumpProgress = timestamp - this.startJumpAnimation

    if (this.grounded && !this.animatingJump) {
      // reset parameters
      this.startJumpAnimation = timestamp
    } else {
      this.movePerFrame += lerp(
        0,
        JUMP_AMPLITUDE,
        UpDownCirc(clamp(this.jumpProgress / JUMP_DURATION, 0, 1))
      )
    }

    if(this.jumpProgress > JUMP_DURATION) {
      // end the animation
      this.animatingJump = false
    }

    this.lastHeight = this.height
    this.isAnimating = !this.grounded
  }

  setGrounded(grounded: boolean) {
    this.grounded = grounded
  }

  setJumpFactor(jumpFactor: number) {
    if(!this.animatingJump) {
      this.animatingJump = jumpFactor > 0
    }
  }
}

class CharacterController extends THREE.Mesh {
  camera: THREE.PerspectiveCamera
  inputController: InputController
  headBobController: HeadBobController
  heightController: HeightController
  movement: THREE.Vector3
  phi: number
  theta: number
  objects: any
  isMoving2D: boolean
  zoomController: ZoomController
  physicsObject: PhysicsObject
  characterController: Rapier.KinematicCharacterController
  avatar: AvatarController

  constructor(avatar: AvatarController, camera: THREE.PerspectiveCamera) {
    super()

    // init position
    this.position.copy(avatar.character.position)
    // movement vector at every frame
    this.movement = new THREE.Vector3()

    this.camera = camera
    this.avatar = avatar

    this.inputController = new InputController()
    this.headBobController = new HeadBobController()
    this.zoomController = new ZoomController()
    this.heightController = new HeightController()

    // physics
    const physics = usePhysics()
    this.physicsObject = this.initPhysics(avatar)

    // The gap the controller will leave between the character and its environment
    const OFFSET = 0.01
    this.characterController = physics.createCharacterController(OFFSET)
    this.characterController.enableSnapToGround(0.5)
    this.characterController.setApplyImpulsesToDynamicBodies(true)

    this.phi = 0
    this.theta = 0

    this.isMoving2D = false
  }

  initPhysics(avatar: AvatarController) {
    // const scene = useScene()
    // // helper ball
    // scene.add(ball)

    // initialize ray
    ray_0 = new RAPIER.Ray(vec3_0, vec3_0)

    // physics object
    const radius = avatar.width / 2
    const halfHeight = avatar.height / 2 - radius
    const physicsObject = addPhysics(this, 'fixed', false, undefined, 'capsule', {
      halfHeight,
      radius,
    })

    if(physicsObject.collider) {
      physicsObject.collider.setMass(70)
    }

    return physicsObject
  }

  detectGround() {
    const physics = usePhysics()
    const avatarHalfHeight = this.avatar.height / 2

    // set collider position
    const colliderPosition = vec3_0.copy(this.position)
    // const rigidBody = this.physicsObject.rigidBody
    // rigidBody.setNextKinematicTranslation(colliderPosition)
    const collider = this.physicsObject.collider
    if (collider) {
      collider.setTranslation(colliderPosition)
    }

    // hitting the ground
    const rayOrigin = vec3_1.copy(this.position)
    // ray origin is at the foot of the avatar
    rayOrigin.y -= avatarHalfHeight

    const ray = ray_0
    ray.origin = rayOrigin
    ray.dir = DOWN

    const groundUnderFootHit = physics.castRay(
      ray,
      1000,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC,
      undefined,
      this.physicsObject.collider,
      this.physicsObject.rigidBody
    )

    if (groundUnderFootHit) {
      const hitPoint = ray.pointAt(groundUnderFootHit.toi) as THREE.Vector3
      const distance = rayOrigin.y - hitPoint.y
      this.heightController.setGrounded(distance <= GROUND_DETECTION_DISTANCE)
    } else {
      this.heightController.setGrounded(false)
    }

    if (this.physicsObject.collider) {
      this.characterController.computeColliderMovement(
        this.physicsObject.collider, // The collider we would like to move.
        this.movement // The movement we would like to apply if there wasn’t any obstacle.
      )

      // Read the result
      const correctedMovement = this.characterController.computedMovement()
      this.position.add(correctedMovement as THREE.Vector3)
    }
  }

  update(timestamp: number, timeDiff: number) {
    this.updateRotation()

    this.updateTranslation(timeDiff)

    this.heightController.update(timestamp, timeDiff)

    this.detectGround()

    this.zoomController.update(
      this.inputController.currentMouse.mouseWheelDelta,
      timestamp,
      timeDiff
    )

    this.updateCamera(timestamp, timeDiff)

    this.inputController.update()
  }

  updateCamera(timestamp: number, timeDiff: number) {
    this.camera.position.copy(this.position)
    // this.camera.position.y += this.avatar.height / 2

    // moving by the camera angle
    const circleRadius = this.zoomController.zoom
    const cameraOffset = vec3_0.set(
      circleRadius * Math.cos(-this.phi),
      circleRadius * Math.cos(this.theta + HALF_PI),
      circleRadius * Math.sin(-this.phi)
    )
    this.camera.position.add(cameraOffset)
    this.camera.lookAt(this.position)

    // head bob
    const isFirstPerson = this.zoomController.zoom <= this.avatar.width
    if (isFirstPerson) {
      this.camera.position.y += this.headBobController.getHeadBob(timeDiff, this.isMoving2D)

      // keep looking at the same position in the object in front
      const physics = usePhysics()

      const rayOrigin = vec3_1.copy(this.camera.position)
      const rayDirection = vec3_0.set(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize()
      const ray = ray_0
      ray.origin = rayOrigin
      ray.dir = rayDirection

      const hit = physics.castRay(ray, 1000, false)

      if (hit) {
        const point = ray.pointAt(hit.toi)
        const hitPoint = vec3_0.set(point.x, point.y, point.z)
        // ball.position.copy(hitPoint)
        this.camera.lookAt(hitPoint)
      }
    }
  }

  updateTranslation(timeDiff: number) {
    const time = timeDiff * 10

    const shiftSpeedUpAction = () =>
      this.inputController.runActionByOneKey([KEYS.shiftL, KEYS.shiftR], FIVE, ONE)

    const forwardVelocity =
      this.inputController.runActionByKey(KEYS.w, shiftSpeedUpAction, ZERO) -
      this.inputController.runActionByKey(KEYS.s, shiftSpeedUpAction, ZERO)

    const sideVelocity =
      this.inputController.runActionByKey(KEYS.a, shiftSpeedUpAction, ZERO) -
      this.inputController.runActionByKey(KEYS.d, shiftSpeedUpAction, ZERO)

    // const qx = this.camera.quaternion
    const qx = quaternion_1
    qx.setFromAxisAngle(UP, this.phi + HALF_PI)

    // Reset movement vector
    this.movement.set(0, 0, 0)

    const forwardMovement = vec3_0.copy(FORWARD)
    forwardMovement.applyQuaternion(qx)
    forwardMovement.multiplyScalar(forwardVelocity * time)

    const leftMovement = vec3_1.copy(LEFT)
    leftMovement.applyQuaternion(qx)
    leftMovement.multiplyScalar(sideVelocity * time)

    this.movement.add(forwardMovement)
    this.movement.add(leftMovement)

    // height
    const elevationFactor = this.inputController.runActionByKey(
      KEYS.space,
      shiftSpeedUpAction,
      ZERO
    )

    if (this.heightController.grounded) {
      this.heightController.setJumpFactor(elevationFactor)
    }

    this.movement.y = this.heightController.movePerFrame

    this.isMoving2D = forwardVelocity != 0 || sideVelocity != 0
  }

  updateRotation() {
    const xh = this.inputController.currentMouse.mouseXDelta / window.innerWidth
    const yh = this.inputController.currentMouse.mouseYDelta / window.innerHeight

    const PHI_SPEED = 2.5
    const THETA_SPEED = 2.5
    this.phi += -xh * PHI_SPEED
    this.theta = clamp(this.theta + -yh * THETA_SPEED, -UP_DOWN_HEAD_ROTATION_LIMIT, UP_DOWN_HEAD_ROTATION_LIMIT)

    const qx = quaternion_0
    qx.setFromAxisAngle(UP, this.phi)
    const qz = quaternion_1
    qz.setFromAxisAngle(RIGHT, this.theta)

    const q = qx.multiply(qz)

    this.quaternion.copy(q)
  }
}

class AvatarController extends Object3D {
  character: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>
  characterController: CharacterController
  height: number
  width: number

  constructor(avatar: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>, camera: THREE.PerspectiveCamera) {
    super()

    this.character = avatar

    const size = _calculateObjectSize(avatar)
    this.width = size.x
    this.height = size.y
    this.characterController = new CharacterController(this, camera)
  }

  update(timestamp: number, timeDiff: number) {
    this.characterController.update(timestamp, timeDiff)
    this.character.position.copy(this.characterController.position)

    // @ts-ignore
    // this.character.material.update(timestamp, this.character.position)

    // console.log('final report: ', this.characterController.position.y)
    // this.character.position.y += this.height / 2
    // this.avatar.quaternion.copy(this.cameraController.quaternion)
  }
}

export default AvatarController
