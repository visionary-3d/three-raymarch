import * as THREE from 'three'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass'
import { LightContainer } from '../render/controllers/scene'
import { useSceneLightsManager } from '../render/init'

type Uniforms = {
  [key: string]: THREE.IUniform
}

export const generateLightShaderUniforms = (
  directionalLightsName: string,
  ambientLightsName: string
) => {
  const sceneLightsManager = useSceneLightsManager()

  const uniforms: Uniforms = {}

  uniforms[directionalLightsName] = {
    value: sceneLightsManager.getDirectionalLights().map((light: LightContainer) => {
      return light.struct
    }),
  }
  uniforms.uNumDirectionalLights = {
    value: sceneLightsManager.getNumDirectionalLights(),
  }

  uniforms[ambientLightsName] = {
    value: sceneLightsManager.getAmbientLights().map((light: LightContainer) => {
      return light.struct
    }),
  }
  uniforms.uNumAmbientLights = {
    value: sceneLightsManager.getNumAmbientLights(),
  }

  return uniforms
}

export const generateLightShaderImports = (
  directionalLightsName: string,
  ambientLightsName: string
) => {
  const sceneLightsManager = useSceneLightsManager()

  return /* glsl */ `
        struct DirectionalLight {
            vec3 position;
            vec3 direction;
            vec3 color;
            float intensity;
        };
        struct AmbientLight {
            vec3 color;
            float intensity;
        };


        uniform DirectionalLight ${directionalLightsName}[${sceneLightsManager.getMaxNumLights()}];

        uniform int uNumDirectionalLights;

        uniform AmbientLight ${ambientLightsName}[${sceneLightsManager.getMaxNumLights()}];

        uniform int uNumAmbientLights;
    `
}

export const updateLightsUniforms = (
  shader: ShaderPass,
  directionalLightsName: string,
  ambientLightsName: string
) => {
  const sceneLightsManager = useSceneLightsManager()

  const numDirLights = sceneLightsManager.getNumDirectionalLights()
  for (let i = 0; i < numDirLights; i++) {
    const light = sceneLightsManager.directionalLights[i]
    shader.uniforms[directionalLightsName].value[i] = light.struct
  }

  shader.uniforms.uNumDirectionalLights.value = numDirLights

  const numAmbientLights = sceneLightsManager.getNumAmbientLights()
  for (let i = 0; i < numAmbientLights; i++) {
    const light = sceneLightsManager.ambientLights[i]
    shader.uniforms[ambientLightsName].value[i] = light.struct
  }

  shader.uniforms.uNumAmbientLights.value = numAmbientLights
}
