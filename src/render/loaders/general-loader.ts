import { useExrLoader, useGltfLoader, useTextureLoader } from '../init'
import * as THREE from 'three';

type LoaderProgress = ProgressEvent<EventTarget>

const _loadGltf = async (path: string) => {
  const gltfLoader = useGltfLoader()
  const gltf = await gltfLoader.loadAsync(
    // URL of the gltf you want to load
    path,

    // called while loading is progressing
    (progress: LoaderProgress) =>
      console.log(
        `Loading gltf file from ${path} ...`,
        100.0 * (progress.loaded / progress.total),
        '%'
      )
  )

  return gltf
}
const _loadVrm = async (path: string) => {
  const gltfLoader = useGltfLoader()
  const vrm = await gltfLoader.loadAsync(
    // URL of the VRM you want to load
    path,

    // called while loading is progressing
    (progress: LoaderProgress) =>
      console.log(
        `Loading vrm file from ${path} ...`,
        100.0 * (progress.loaded / progress.total),
        '%'
      )
  )

  return vrm
}

const _loadExr = async (path: string) => {
  const exrLoader = useExrLoader()
  const map = await exrLoader.loadAsync(
    path,

    // called while loading is progressing
    (progress: LoaderProgress) =>
      console.log(`Loading image from ${path} ...`, 100.0 * (progress.loaded / progress.total), '%')
  )

  return map
}

const _loadTexture = async (path: string) => {
  const textureLoader = useTextureLoader()
  const texture = await textureLoader.loadAsync(
    path,

    // called while loading is progressing
    (progress: LoaderProgress) =>
      console.log(`Loading image from ${path} ...`, 100.0 * (progress.loaded / progress.total), '%')
  )

  texture.wrapS = texture.wrapT = THREE.RepeatWrapping

  return texture
}

class GeneralLoader {
  constructor() {}

  async load(path: string) {
    const fileType = path.split('.').pop()

    let file = null

    switch (fileType) {
      case 'gltf': {
        file = await _loadGltf(path)
        return file?.scene
      }

      case 'glb': {
        file = await _loadGltf(path)
        return file?.scene
      }

      case 'vrm': {
        file = await _loadVrm(path)
        return file?.scene
      }

      case 'png': {
        file = await _loadTexture(path)
        return file
      }

      case 'exr': {
        file = await _loadExr(path)
        return file
      }

      default: {
        console.error(`GeneralLoader: File type ${fileType} is not supported.`)
        return file
      }
    }
  }
}

export default GeneralLoader
