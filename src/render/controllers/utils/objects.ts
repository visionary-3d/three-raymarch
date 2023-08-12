import * as THREE from 'three';

const vec3_4 = new THREE.Vector3()

const _calculateObjectSize = (object: THREE.Object3D) => {
  const bbox = new THREE.Box3()
  bbox.expandByObject(object)
  const size = bbox.getSize(vec3_4)

  return size
}

export { _calculateObjectSize }
