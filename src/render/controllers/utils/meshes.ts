import * as THREE from 'three'
import NOISE_TEXTURE from '../../../images/noises/Melt_01-512x512.png'
import { useGui, useScene } from '../../init'

const material = new THREE.MeshPhysicalMaterial({
  color: 'red',
})

const _addCapsule = (
  height: number,
  radius: number,
  capSegments: number,
  radialSegments: number
) => {
  // const gui = useGui()
  // gui.add(material.uniforms.uFresnelPower, 'value').min(0).max(4)

  const scene = useScene()
  const geometry = new THREE.CapsuleGeometry(radius, height, capSegments, radialSegments)
  const capsule = new THREE.Mesh(geometry, material)
  capsule.castShadow = true

  capsule.position.y += height / 2 + radius

  capsule.position.y += 10
  capsule.position.x += 30

  scene.add(capsule)

  return capsule
}

export { _addCapsule }
