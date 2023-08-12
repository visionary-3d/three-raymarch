import * as THREE from 'three'
import { useTick } from '../init'

const MAX_NUM_LIGHTS = 10

const vec3_0 = new THREE.Vector3()

class AmbientLightStruct {
  color: THREE.Color
  intensity: number

  constructor(light: THREE.AmbientLight) {
    this.color = light.color
    this.intensity = light.intensity
  }

  copy(light: THREE.AmbientLight) {
    this.color = light.color
    this.intensity = light.intensity
  }
}

class DirectionalLightStruct {
  position: THREE.Vector3
  color: THREE.Color
  intensity: number
  direction: THREE.Vector3

  constructor(light: THREE.DirectionalLight) {
    this.position = light.position
    // TODO: set the direction based on objects position
    this.direction = light.getWorldDirection(vec3_0).clone()
    this.color = light.color
    this.intensity = light.intensity
  }

  copy(light: THREE.DirectionalLight) {
    this.position = light.position
    // TODO: set the direction based on objects position
    this.direction = light.getWorldDirection(vec3_0).clone()
    this.color = light.color
    this.intensity = light.intensity
  }
}

export class LightContainer {
  light: THREE.Light
  struct: any
  constructor(light: THREE.Light, struct: any) {
    this.light = light
    this.struct = struct
  }

  update() {
    this.struct.copy(this.light)
  }
}


class IndexContainer {
  index: number

  constructor(index: number) {
    this.index = index
  }
}

let directionalLightsIndex = new IndexContainer(0)
let ambientLightsIndex = new IndexContainer(0)

const _exceededMaxNumLightsError = (numLights: number) => {
  if (numLights > MAX_NUM_LIGHTS) {
    throw Error(
      'Scene Lights Manager: You have exceeded the max number of lights of one type in your scene.'
    )
  }
}

class Scene extends THREE.Scene {
  sceneLightsManager: SceneLightsManager

  constructor(sceneLights: SceneLightsManager) {
    super()

    this.sceneLightsManager = sceneLights
  }

  add(...objects: any[]) {
    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i]

      if (obj.isLight) {
        this.sceneLightsManager.add(obj)
      }
    }

    return super.add(...objects)
  }
}

export class SceneLightsManager {
  directionalLights: LightContainer[]
  ambientLights: LightContainer[]
  spotLights: LightContainer[]
  ambientLightProbes: LightContainer[]
  hemisphereLights: LightContainer[]
  hemisphereLightProbes: LightContainer[]
  lightProbes: LightContainer[]
  rectAreaLights: LightContainer[]
  updateFunctions: Array<Function>

  constructor() {
    this.updateFunctions = []

    this.directionalLights = new Array<LightContainer>(MAX_NUM_LIGHTS)
    this.initLightsArray(this.directionalLights, THREE.DirectionalLight, DirectionalLightStruct)

    this.ambientLights = new Array<LightContainer>(MAX_NUM_LIGHTS)
    this.initLightsArray(this.ambientLights, THREE.AmbientLight, AmbientLightStruct)

    this.spotLights = new Array<LightContainer>(MAX_NUM_LIGHTS)
    this.initLightsArray(this.spotLights, THREE.SpotLight, DirectionalLightStruct)

    this.ambientLightProbes = new Array<LightContainer>(MAX_NUM_LIGHTS)
    this.initLightsArray(this.ambientLightProbes, THREE.AmbientLightProbe, DirectionalLightStruct)

    this.hemisphereLights = new Array<LightContainer>(MAX_NUM_LIGHTS)
    this.initLightsArray(this.hemisphereLights, THREE.HemisphereLight, DirectionalLightStruct)

    this.hemisphereLightProbes = new Array<LightContainer>(MAX_NUM_LIGHTS)
    this.initLightsArray(this.hemisphereLightProbes, THREE.HemisphereLightProbe, DirectionalLightStruct)

    this.lightProbes = new Array<LightContainer>(MAX_NUM_LIGHTS)
    this.initLightsArray(this.lightProbes, THREE.LightProbe, DirectionalLightStruct)

    this.rectAreaLights = new Array<LightContainer>(MAX_NUM_LIGHTS)
    this.initLightsArray(this.rectAreaLights, THREE.RectAreaLight, DirectionalLightStruct)

    useTick(() => {
      this.update()
    })
  }

  initLightsArray(array: Array<LightContainer>, constructor: new () => THREE.Light, struct: any) {
    for (let i = 0; i < array.length; i++) {

      const light = new constructor()
      const str = new struct(light)
      array[i] = new LightContainer(light, str)
    }
  }

  pushLight(array: Array<LightContainer>, light: THREE.Light, indexContainer: IndexContainer) {
    const container = array[indexContainer.index]
    container.light = light
    container.struct.copy(light)

    indexContainer.index++

    _exceededMaxNumLightsError(indexContainer.index)
  }

  add(light: any) {
    if (light.isDirectionalLight) {
      this.pushLight(this.directionalLights, light, directionalLightsIndex)
      return this
    }
    if (light.isAmbientLight) {
      this.pushLight(this.ambientLights, light, ambientLightsIndex)
      return this
    }
    // if (light.isAmbientLightProbe) {
    //   this.pushLight(this.ambientLightProbes, light, directionalLightsIndex)
    //   return this
    // }
    // if (light.isSpotLight) {
    //   this.pushLight(this.spotLights, light, directionalLightsIndex)
    //   return this
    // }
    // if (light.isRectAreaLight) {
    //   this.pushLight(this.rectAreaLights, light, directionalLightsIndex)
    //   return this
    // }
    // if (light.isHemisphereLight) {
    //   this.pushLight(this.hemisphereLights, light, directionalLightsIndex)
    //   return this
    // }
    // if (light.isHemisphereLightProbe) {
    //   this.pushLight(this.hemisphereLightProbes, light, directionalLightsIndex)
    //   return this
    // }
    // if (light.isLightProbe) {
    //   this.pushLight(this.lightProbes, light, directionalLightsIndex)
    //   return this
    // }

    console.error(
      `Scene Lights: The argument passed in to the add function is not supported. (probably is not a light)`
    )
  }

  getDirectionalLights() {
    return this.directionalLights
  }

  getAmbientLights() {
    return this.ambientLights
  }

  getNumDirectionalLights() {
    return directionalLightsIndex.index
  }

  getNumAmbientLights() {
    return ambientLightsIndex.index
  }

  getMaxNumLights() {
    return MAX_NUM_LIGHTS
  }

  addUpdateFunction(fn: Function) {
    this.updateFunctions.push(fn)
  }

  update() {
    for (let i = 0; i < this.directionalLights.length; i++) {
      const light = this.directionalLights[i];
      light.update()
    }

    for (let i = 0; i < this.updateFunctions.length; i++) {
      const updateFunction = this.updateFunctions[i]
      updateFunction()
    }
  }
}

export default Scene
