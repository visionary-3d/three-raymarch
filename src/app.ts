import * as THREE from 'three'
import { addPass, useRenderSize, useScene, useTick } from './render/init'

// import postprocessing passes
import { SavePass } from 'three/examples/jsm/postprocessing/SavePass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { BlendShader } from 'three/examples/jsm/shaders/BlendShader.js'
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js'

import { addPhysics, PHYSICS_COLLISION_TYPE } from './render/physics/physics'

import { TickData } from './render/controllers/tick-manager'

import { RayMarchShader } from './RayMarching/MarchShader'
import { addDirectionalShadow } from './render/utils/utils'

const MOTION_BLUR_AMOUNT = 0.2

const startApp = async () => {
  // three
  const scene = useScene()
  const { width, height } = useRenderSize()

  const _addBoxMesh = (size: THREE.Vector3, pos: THREE.Vector3) => {
    const boxWidth = size.x
    const boxHeight = size.y
    const boxDepth = size.z
    const geometry = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth, 70, 70, 70)
    const material = new THREE.MeshPhysicalMaterial({
      color: '#444',
      metalness: 0,
      roughness: 1,
    })
    const box = new THREE.Mesh(geometry, material)
    box.castShadow = true
    box.receiveShadow = true

    box.position.copy(pos)

    const po = addPhysics(
      box,
      'fixed',
      true,
      undefined,
      'cuboid',
      {
        width: boxWidth / 2,
        height: boxHeight / 2,
        depth: boxDepth / 2,
      },
      PHYSICS_COLLISION_TYPE.ALL_COLLISIONS,
      undefined
    )

    if (po.collider) {
      po.collider.setFriction(10)
      po.collider.setDensity(2000)
      po.collider.setMass(1000)
    }

    scene.add(box)
  }

  const groundPos = new THREE.Vector3()
  const BOX_SIZE = 100
  const TINY_SIZE = 1

  _addBoxMesh(new THREE.Vector3(BOX_SIZE, TINY_SIZE, BOX_SIZE), groundPos.set(0, -BOX_SIZE / 2, 0))
  _addBoxMesh(new THREE.Vector3(BOX_SIZE, TINY_SIZE, BOX_SIZE), groundPos.set(0, +BOX_SIZE / 2, 0))
  _addBoxMesh(new THREE.Vector3(TINY_SIZE, BOX_SIZE, BOX_SIZE), groundPos.set(BOX_SIZE / 2, 0, 0))
  _addBoxMesh(new THREE.Vector3(TINY_SIZE, BOX_SIZE, BOX_SIZE), groundPos.set(-BOX_SIZE / 2, 0, 0))
  _addBoxMesh(new THREE.Vector3(BOX_SIZE, BOX_SIZE, TINY_SIZE), groundPos.set(0, 0, -BOX_SIZE / 2))
  _addBoxMesh(new THREE.Vector3(BOX_SIZE, BOX_SIZE, TINY_SIZE), groundPos.set(0, 0, +BOX_SIZE / 2))

  const ambientLight = new THREE.AmbientLight('#ffffff', 0.4)

  const dirLight = new THREE.DirectionalLight('#ffffff', 1.5)
  dirLight.position.y += 10
  dirLight.position.x += 10

  addDirectionalShadow(dirLight /* , sphere */)

  const dirLight2 = new THREE.DirectionalLight('#ffffff', 2.5)
  dirLight2.position.y += 100

  addDirectionalShadow(dirLight2 /* , sphere */)

  scene.add(ambientLight, dirLight, dirLight2 /*dirLight3, dirLight4 */)

  // postprocessing
  const renderTargetParameters = {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    stencilBuffer: false,
  }

  // save pass
  const savePass = new SavePass(new THREE.WebGLRenderTarget(width, height, renderTargetParameters))

  // blend pass
  const blendPass = new ShaderPass(BlendShader, 'tDiffuse1')
  blendPass.uniforms['tDiffuse2'].value = savePass.renderTarget.texture
  blendPass.uniforms['mixRatio'].value = MOTION_BLUR_AMOUNT

  // output pass
  const outputPass = new ShaderPass(CopyShader)
  outputPass.renderToScreen = true

  const rayMarchShader = new RayMarchShader()

  // adding passes to composer
  addPass(blendPass)
  addPass(savePass)
  // addPass(outputPass)
  addPass(rayMarchShader.shaderPass)
  // addPass(new UnrealBloomPass(new THREE.Vector2(width, height), 1, 0, 0.85))

  let numClick = 0
  // event listener for click
  document.addEventListener('click', () => {
    if (numClick > 0) {
      rayMarchShader.shootSphere()
    }

    numClick++
  })

  useTick(({ timestamp, timeDiff, fps }: TickData) => {
    rayMarchShader.update(timestamp)
  })
}

export default startApp
