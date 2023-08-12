import * as THREE from 'three'
import { Vector3 } from 'three'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass'
import {
  useCamera,
  useControls,
  useLoader,
  useOnRenderResizeFunction,
  usePointerLocked,
  useRenderSize,
  useRenderer,
  useScene,
  useSceneLightsUpdate,
  useTick,
} from '../render/init'
import { PHYSICS_COLLISION_TYPE, PhysicsObject, addPhysics } from '../render/physics/physics'
import {
  generateLightShaderImports,
  generateLightShaderUniforms,
  updateLightsUniforms,
} from './LightShader'

import ENV_MAP from './monk.exr'
import { ObjectContainerArray } from './utils'

class SphereObject3D extends THREE.Object3D {
  radius: number
  physicsObject: PhysicsObject | undefined
  color: THREE.Color

  constructor({ radius, color }: { radius: number; color: THREE.Color }) {
    super()

    this.radius = radius
    this.color = color
  }
}

class SphereStruct {
  position: THREE.Vector3
  quaternion: THREE.Quaternion
  color: THREE.Color
  radius: number

  constructor(object: SphereObject3D) {
    this.position = object.position
    this.quaternion = object.quaternion
    this.color = object.color
    this.radius = object.radius
  }

  copy(object: SphereObject3D) {
    this.position = object.position
    this.radius = object.radius
    this.quaternion = object.quaternion
  }
}

export class ObjectContainer {
  object: any
  struct: any
  constructor(object: any, struct: any) {
    this.object = object
    this.struct = struct

    this.update()
  }

  update() {
    this.struct.copy(this.object)
  }
}

// * constants

const DIR_LIGHTS_UNIFORM_NAME = 'uDirectionalLights'
const AMBIENT_LIGHTS_UNIFORM_NAME = 'uAmbientLights'

const vec3_0 = new Vector3()
const vec3_1 = new Vector3()

const _initDepthRenderTarget = (width: number, height: number) => {
  const depthRenderTarget = new THREE.WebGLRenderTarget(width, height)
  depthRenderTarget.texture.format = THREE.RGBAFormat
  depthRenderTarget.texture.minFilter = THREE.NearestFilter
  depthRenderTarget.texture.magFilter = THREE.NearestFilter
  depthRenderTarget.texture.generateMipmaps = false
  depthRenderTarget.stencilBuffer = false
  depthRenderTarget.depthBuffer = true
  depthRenderTarget.depthTexture = new THREE.DepthTexture(width, height)
  depthRenderTarget.depthTexture.type = THREE.UnsignedShortType

  return depthRenderTarget
}

// vibrant cartoony colors
const RANDOM_COLOR_LIST = [
  // new THREE.Color(0.2, 0.0025, 0.0035),
  // new THREE.Color(0.02, 0.2, 0.005),

  // new THREE.Color(0.01, 0.001, 0.2),
  // new THREE.Color(0.001, 0.01, 0.2),
  // new THREE.Color(0.01, 0.2, 0.001),
  // new THREE.Color(0.001, 0.2, 0.01),
  // new THREE.Color(0.2, 0.01, 0.001),
  // new THREE.Color(0.2, 0.2, 0.001),
  // new THREE.Color(0.001, 0.2, 0.2),

  // new THREE.Color(0, 0, 1),

  new THREE.Color(0.01, 0.001, 0.1),
  new THREE.Color(0.001, 0.01, 0.1),
  new THREE.Color(0.01, 0.1, 0.001),
  new THREE.Color(0.001, 0.1, 0.01),
  new THREE.Color(0.1, 0.01, 0.001),
  new THREE.Color(0.1, 0.1, 0.001),
  new THREE.Color(0.001, 0.1, 0.1),
]

const _generateRandomColor = () => {
  return RANDOM_COLOR_LIST[Math.floor(Math.random() * RANDOM_COLOR_LIST.length)]
}

type Shader = {
  uniforms: {
    [uniform: string]: THREE.IUniform<any>
  }
  vertexShader: string
  fragmentShader: string
}

class RayMarchShader extends THREE.ShaderMaterial {
  shader: Shader
  uniforms: { [uniform: string]: THREE.IUniform<any> }
  vertexShader: string
  fragmentShader: string
  shaderPass: ShaderPass
  depthRenderTarget: THREE.WebGLRenderTarget
  stickyDepthRenderTarget: THREE.WebGLRenderTarget
  spheres: ObjectContainer[]
  spheresCount: number
  cubeCamera: THREE.CubeCamera
  cubeRenderTarget: THREE.WebGLCubeRenderTarget

  constructor() {
    super()

    const MAX_SPHERE_COUNT = 24
    const SPHERE_RADIUS = 6
    this.spheresCount = 0
    this.spheres = ObjectContainerArray(
      ObjectContainer,
      SphereObject3D,
      SphereStruct,
      MAX_SPHERE_COUNT,
      { radius: SPHERE_RADIUS, color: new THREE.Color() },
      (object: SphereObject3D) => {
        object.color = _generateRandomColor()
      }
    ) as unknown as ObjectContainer[]

    const camera = useCamera()

    const nearPlaneHeight = 2 * Math.tan((camera.fov * Math.PI) / 180 / 2) * camera.near // height
    const nearPlaneWidth = nearPlaneHeight * camera.aspect // width

    const farPlaneHeight = 2 * Math.tan((camera.fov * Math.PI) / 180 / 2) * camera.far // height
    const farPlaneWidth = farPlaneHeight * camera.aspect // width

    const { width, height } = useRenderSize()

    const onRenderResize = (windowWidth: number, windowHeight: number) => {
      if (this.shaderPass) {
        this.shaderPass.uniforms.uResolution.value.set(windowWidth, windowHeight)
        this.shaderPass.uniforms.uCameraAspectRatio.value = camera.aspect

        const nearPlaneWidth = nearPlaneHeight * camera.aspect // width
        this.shaderPass.uniforms.uCameraNearSize.value.set(nearPlaneWidth, nearPlaneHeight)
      }
    }
    useOnRenderResizeFunction(onRenderResize)

    this.depthRenderTarget = _initDepthRenderTarget(width, height)
    this.stickyDepthRenderTarget = _initDepthRenderTarget(width, height)

    const renderer = useRenderer()
    const scene = useScene()

    const loadEnvMap = async () => {
      const loader = useLoader()
      const envMap = await loader.load(ENV_MAP)
      if (envMap && envMap instanceof THREE.DataTexture) {
        envMap.mapping = THREE.EquirectangularReflectionMapping
        envMap.encoding = THREE.sRGBEncoding

        // scene.background = envMap
        // scene.environment = envMap
      }

      return envMap
    }

    loadEnvMap().then((envMap) => {
      this.shaderPass.uniforms.uEnvMap.value = envMap
    })
    this.cubeRenderTarget = new THREE.WebGLCubeRenderTarget(1024)
    this.cubeRenderTarget.texture.type = THREE.FloatType
    this.cubeCamera = new THREE.CubeCamera(0.01, 1000, this.cubeRenderTarget)

    useTick(() => {})

    this.uniforms = {
      // * postprocessing
      uDiffuseTexture: { value: null },

      // * depth buffer
      uDepthTexture: { value: this.depthRenderTarget.depthTexture },
      uStickyDepthTexture: { value: this.stickyDepthRenderTarget.depthTexture },

      // * camera info
      uCameraPosition: { value: new Vector3(0, 0, 0) },
      uCameraQuaternion: { value: new THREE.Quaternion() },
      uCameraDirection: { value: new THREE.Vector3() },
      uCameraNear: { value: camera.near },
      uCameraFar: { value: camera.far },
      uCameraNearSize: { value: new THREE.Vector2(nearPlaneWidth, nearPlaneHeight) },
      uCameraFarSize: { value: new THREE.Vector2(farPlaneWidth, farPlaneHeight) },
      uCameraAspectRatio: { value: camera.aspect },

      // * render info
      uResolution: { value: new THREE.Vector2(width, height) },
      uTime: { value: 0 },

      // * ray marching
      // uRayMarchHitThreshold: { value: 0.05 },
      uRayMarchHitThreshold: { value: 0.0001 },
      uMaxMarchDistance: { value: 100 },
      uExternalDistanceCutDiff: { value: 0.02 },
      uSmoothUnion: { value: 3 },
      uContactEdgeOffset: { value: 0.7 },
      uContactEdgeMin: { value: 0.8 },
      uContactEdgeMax: { value: 0.95 },

      // * sphere
      uSpheres: {
        value: this.spheres.map((s) => {
          return s.struct
        }),
      },
      uSpheresCount: {
        value: this.spheresCount,
      },

      // * envmap
      uEnvMap: { value: null },

      // * lights
      ...generateLightShaderUniforms(DIR_LIGHTS_UNIFORM_NAME, AMBIENT_LIGHTS_UNIFORM_NAME),
    }

    this.vertexShader = /* glsl */ `

		varying vec2 vUv;
		varying vec3 vPosition;

		void main() {

      vec4 modelViewPosition = modelViewMatrix * vec4(position, 1.0);
			gl_Position = projectionMatrix * modelViewPosition;
			// gl_Position = vec4(position, 1);

			vUv = uv;
      vPosition = position;

		}`

    this.fragmentShader = /* glsl */ `
    #include <packing>
    precision highp sampler3D;

    // * lights
    ${generateLightShaderImports(DIR_LIGHTS_UNIFORM_NAME, AMBIENT_LIGHTS_UNIFORM_NAME)}

    struct LightsInfo {
      vec3 lightColor;
      float lightIntensity;
    };

    // * postprocessing
		uniform sampler2D uDiffuseTexture;

    // * depth buffer
		uniform sampler2D uDepthTexture;
		uniform sampler2D uStickyDepthTexture;


    // * camera info
		uniform vec3 uCameraPosition;
		uniform vec4 uCameraQuaternion;
		uniform vec3 uCameraDirection;
		uniform vec2 uCameraNearSize;
		uniform float uCameraNear;
		uniform float uCameraFar;
		uniform float uCameraAspectRatio;

    // * render info
		uniform vec2 uResolution;
		uniform float uTime;

    // * ray marching
    uniform float uRayMarchHitThreshold;
    uniform float uMaxMarchDistance;
    uniform float uExternalDistanceCutDiff;
    uniform float uSmoothUnion;
    uniform float uContactEdgeOffset;
    uniform float uContactEdgeMin;
    uniform float uContactEdgeMax;

    struct Sphere {
      vec3 position;
      vec4 quaternion;
      vec3 color;
      float radius;
    };

    // * sphere
    uniform Sphere uSpheres[${MAX_SPHERE_COUNT}];
    uniform int uSpheresCount;

    // * envmap
		uniform sampler2D uEnvMap;

    // * three.js
    // uniform mat4 viewMatrix;
    // uniform mat4 modelViewMatrix;
    uniform mat4 projectionMatrix;

    // * varyings
		varying vec2 vUv;
		varying vec3 vPosition;

    // * easing functions
    float easeInExpo(float x) {
      return 1.0 - pow(2.0, -10.0 * x);
    }

    // * tone mapping
    vec3 filmicToneMapping(vec3 color) {
      color = max(vec3(0.), color - vec3(0.004));
      color = (color * (6.2 * color + .5)) / (color * (6.2 * color + 1.7) + 0.06);
      return color;
    }

    vec3 encodeSRGB(vec3 linearRGB) {
        vec3 a = 12.92 * linearRGB;
        vec3 b = 1.055 * pow(linearRGB, vec3(1.0 / 2.4)) - 0.055;
        vec3 c = step(vec3(0.0031308), linearRGB);
        return mix(a, b, c);
    }


    // * perlin

    /* discontinuous pseudorandom uniformly distributed in [-0.5, +0.5]^3 */
    vec3 random3(vec3 c) {
      float j = 4096.0*sin(dot(c,vec3(17.0, 59.4, 15.0)));
      vec3 r;
      r.z = fract(512.0*j);
      j *= .125;
      r.x = fract(512.0*j);
      j *= .125;
      r.y = fract(512.0*j);
      return r-0.5;
    }

    /* skew constants for 3d simplex functions */
    const float F3 =  0.3333333;
    const float G3 =  0.1666667;

    /* 3d simplex noise */
    float simplex3d(vec3 p) {
      /* 1. find current tetrahedron T and it's four vertices */
      /* s, s+i1, s+i2, s+1.0 - absolute skewed (integer) coordinates of T vertices */
      /* x, x1, x2, x3 - unskewed coordinates of p relative to each of T vertices*/
      
      /* calculate s and x */
      vec3 s = floor(p + dot(p, vec3(F3)));
      vec3 x = p - s + dot(s, vec3(G3));
      
      /* calculate i1 and i2 */
      vec3 e = step(vec3(0.0), x - x.yzx);
      vec3 i1 = e*(1.0 - e.zxy);
      vec3 i2 = 1.0 - e.zxy*(1.0 - e);
        
      /* x1, x2, x3 */
      vec3 x1 = x - i1 + G3;
      vec3 x2 = x - i2 + 2.0*G3;
      vec3 x3 = x - 1.0 + 3.0*G3;
      
      /* 2. find four surflets and store them in d */
      vec4 w, d;
      
      /* calculate surflet weights */
      w.x = dot(x, x);
      w.y = dot(x1, x1);
      w.z = dot(x2, x2);
      w.w = dot(x3, x3);
      
      /* w fades from 0.6 at the center of the surflet to 0.0 at the margin */
      w = max(0.6 - w, 0.0);
      
      /* calculate surflet components */
      d.x = dot(random3(s), x);
      d.y = dot(random3(s + i1), x1);
      d.z = dot(random3(s + i2), x2);
      d.w = dot(random3(s + 1.0), x3);
      
      /* multiply d by w^4 */
      w *= w;
      w *= w;
      d *= w;
      
      /* 3. return the sum of the four surflets */
      return dot(d, vec4(52.0));
    }

    float fit(float unscaled, float originalMin, float originalMax, float minAllowed, float maxAllowed) {
      return (maxAllowed - minAllowed) * (unscaled - originalMin) / (originalMax - originalMin) + minAllowed;
    }

    // * Taken From Three.js
    vec3 applyQuaternion(vec3 v, vec4 q) {

			// calculate quat * vector
      vec4 qv = vec4(
        q.w * v.x + q.y * v.z - q.z * v.y,
        q.w * v.y + q.z * v.x - q.x * v.z,
        q.w * v.z + q.x * v.y - q.y * v.x,
        -q.x * v.x - q.y * v.y - q.z * v.z
      );

			// calculate result * inverse quat
      return vec3(
        qv.x  * q.w + qv.w * -q.x + qv.y * -q.z - qv.z * -q.y,
        qv.y * q.w + qv.w * -q.y + qv.z * -q.x - qv.x  * -q.z,
        qv.z * q.w + qv.w * -q.z + qv.x  * -q.y - qv.y * -q.x
      );

    }

    #if defined(USE_LOGDEPTHBUF) && defined(USE_LOGDEPTHBUF_EXT)

      float linearizeDepth(float depth){

          float a = uCameraFar / (uCameraFar - uCameraNear);
          float b = uCameraFar * uCameraNear / (uCameraNear - uCameraFar);
          return a + b / depth;

      }

      float reconstructDepth(sampler2D depthSampler, const in vec2 uv){

          float depth = texture(depthSampler, uv).x;
          return pow(2.0, depth * log2(uCameraFar + 1.0)) - 1.0;

      }

    #endif // defined(USE_LOGDEPTHBUF) && defined(USE_LOGDEPTHBUF_EXT)

    float readViewZ(sampler2D depthSampler, vec2 coord) {

      #if defined(USE_LOGDEPTHBUF) && defined(USE_LOGDEPTHBUF_EXT)

        float fragCoordZ = linearizeDepth(reconstructDepth(depthSampler, coord));

      #else // defined(USE_LOGDEPTHBUF) && defined(USE_LOGDEPTHBUF_EXT)

        float fragCoordZ = texture(depthSampler, coord).x;

      #endif // defined(USE_LOGDEPTHBUF) && defined(USE_LOGDEPTHBUF_EXT)

      return perspectiveDepthToViewZ(fragCoordZ, uCameraNear, uCameraFar);

    }

    float getDepth(sampler2D depthTexture, vec2 coords) {

      return -readViewZ(depthTexture, coords);

    }

    float getPixelDepth(sampler2D depthTexture, vec2 coords, vec3 pixelViewDirection) {

      float sceneDepth = getDepth(depthTexture, vUv);
      float cameraDot = dot(pixelViewDirection, uCameraDirection);

      return sceneDepth / cameraDot;
      // return sceneDepth;

    }

    // * https://www.clicktorelease.com/blog/creating-spherical-environment-mapping-shader/
    vec4 sampleEnvMap(vec3 rayDirection, vec3 normal) {
      vec3 r = reflect(rayDirection, normal);
      float m = 2.0 * sqrt(
        pow(r.x, 2.0) +
        pow(r.y, 2.0) +
        pow(r.z + 1.0, 2.0)
      );
      vec2 reflectionUv = r.xy / m + 0.5;
      // vec4 envColor = textureCube(uEnvMap, vec3(r.x, r.yz));
      return texture(uEnvMap, reflectionUv);
    }

    vec3 getCameraToPixelVector(vec2 coords) {

      vec2 sizeMultiplier = (coords - 0.5);
      vec2 nearPlaneOffset = sizeMultiplier * uCameraNearSize;

      vec3 cameraToPixel = vec3(nearPlaneOffset, -uCameraNear);

      // * vector direction correction based on camera rotation
      vec3 cameraToPixelRotated = applyQuaternion(cameraToPixel, uCameraQuaternion);

      // * direction of the vector
      vec3 pixelViewDirection = normalize(cameraToPixelRotated);

      // * length of the vector
      float depth = getPixelDepth(uDepthTexture, vUv, pixelViewDirection);

      return pixelViewDirection * depth;

    }


    vec3 getPixelPosition(vec2 uv, float depth) {

      vec2 sizeMultiplier = uv - 0.5;
      vec2 nearPlaneOffset = sizeMultiplier * uCameraNearSize;

      vec3 cameraToPixel = vec3(nearPlaneOffset, -uCameraNear);

      // * vector direction correction based on camera rotation
      vec3 cameraToPixelRotated = applyQuaternion(cameraToPixel, uCameraQuaternion);

      // * direction of the vector
      vec3 pixelViewDirection = normalize(cameraToPixelRotated);

      return uCameraPosition + pixelViewDirection * depth;

    }

    vec4 getPixelPositionViewSpace(vec2 coords, float depth) {

      vec3 pixelPosition = getPixelPosition(coords, depth);
      return vec4(viewMatrix * vec4(pixelPosition, 1));

    }

    vec4 getPixelPositionViewSpace(vec2 coords) {

      vec3 cameraToPixel = getCameraToPixelVector(coords);

      vec3 pixelPosition = getPixelPosition(coords, length(cameraToPixel));
      return vec4(viewMatrix * vec4(pixelPosition, 1));

    }

    struct Blend {
      float distance;
      float material;
    };

    // * https://iquilezles.org/articles/smin/
    Blend smin( float a, float b, float k ) {

        float h =  max( k-abs(a-b), 0.0 )/k;
        float m = h*h*0.5;
        float s = m*k*(1.0/2.0);
        vec2 result = mix(vec2(b-s,1.0-m), vec2(a-s,m), vec2(a<b));
        return Blend(result.x, result.y);

    }

    struct Surface {
        vec3 diffuse;
        vec3 specular;
        float shininess;
        float distance;
    };

    Surface smin(Surface a, Surface b, float smoothness) {

      Blend blend = smin(b.distance, a.distance, smoothness);

      return Surface(mix(b.diffuse, a.diffuse, blend.material),
                     mix(b.specular, a.specular, blend.material),
                     mix(b.shininess, a.shininess, blend.material),
                     blend.distance);

    }

    Surface smin(Surface a, Surface b, Blend blend) {

      return Surface(mix(b.diffuse, a.diffuse, blend.material),
                     mix(b.specular, a.specular, blend.material),
                     mix(b.shininess, a.shininess, blend.material),
                     blend.distance);

    }


    float sphere(vec3 p, float s) {

      return length(p)-s;

    }

    float lowerSphere(vec3 p, float s) {

      vec3 newPosition = p;
      newPosition.y += s / 2.0;

      return sphere(newPosition, s);

    }

    float box( vec3 p, vec3 b ) {

      vec3 q = abs(p) - b;
      return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0);

    }

    float intersect(float shape1, float shape2) {

      return max(shape1, shape2);

    }

    float subtract(float base, float subtraction) {

      return intersect(base, -subtraction);

    }

    Surface getSpheresSurface(vec3 position) {

      float noise = simplex3d(position / (float(${SPHERE_RADIUS})));

      const vec3 spec = vec3(1.0);
      const float shininess = 100.0;

      Surface finalSurf = Surface(vec3(1), spec, shininess, uMaxMarchDistance);

      for (int i = 0; i < uSpheresCount; i++) {

        // Sphere s = uSpheres[0];
        Sphere s = uSpheres[i];

        vec3 normal = normalize(position - s.position);

        // wobbly looking objects
        vec3 pos = position + noise * normal;

        Surface surf = Surface(s.color, spec, shininess, sphere(pos - s.position, s.radius));

        finalSurf = smin(surf, finalSurf, uSmoothUnion * 2.0);

      }

      return finalSurf;

    }

    float getBoxDistance(vec3 pos) {

      vec3 p = pos;
      p.x += 3.0;
      p.y += 46.0;

      return box(p, vec3(4));

    }

    Surface getBoxSurface(vec3 position) {

        float distance = getBoxDistance(position);

        const vec3 color = vec3(1.0, 0., 0.);
        const vec3 spec = vec3(1);
        const float shininess = 10.0;

        return Surface(color, spec, shininess, distance);

    }

    Surface getSphereSingleSurface(vec3 position) {

        // float noise = simplex3d(position / 5.0 + sin(uTime));

        vec3 o = vec3(3.0 + sin(uTime * 2.0) * 5.0, -46.0, 0);
        vec3 p = position - o;

        vec3 normal = normalize(p);

        // wobbly looking objects
        // vec3 pos = p + noise * normal;
        vec3 pos = p;

        float distance = sphere(pos, 2.0);

        const vec3 color = vec3(0.1, 1, 0);
        const vec3 spec = vec3(1);
        const float shininess = 10.0;

        return Surface(color, spec, shininess, distance);

    }

    Surface getVirtualSurface(vec3 position) {

        Surface spheresSurface = getSpheresSurface(position);
        Surface sphereSurface = getSphereSingleSurface(position);
        Surface boxSurface = getBoxSurface(position);

        return smin(smin(sphereSurface, boxSurface, uSmoothUnion * 2.0), spheresSurface, uSmoothUnion * 2.0);

    }

    Surface getRealSurface(vec3 position, vec3 pixelPosition, vec3 pixelColor, float shininess) {

        float distance = distance(position, pixelPosition);

        return Surface(pixelColor, vec3(1), shininess, distance);

    }

    // * [final surface, virtual surface, real surface, mix surface]
    Surface[4] getSurface(vec3 position, vec3 pixelPosition, vec3 pixelColor) {

        float cutOffset = max(uExternalDistanceCutDiff, uRayMarchHitThreshold + 0.01);

        // * virtual scene
        Surface virtual = getVirtualSurface(position);

        // * three.js scene
        Surface real = getRealSurface(position, pixelPosition, virtual.diffuse, virtual.shininess);
        // Surface real = getRealSurface(position, pixelPosition, pixelColor, virtual.shininess);

        // float smoothness = uSmoothUnion + sin(uTime / 3.0) / 3.0;
        float smoothness = uSmoothUnion;

        Blend blend = smin(real.distance, virtual.distance, smoothness);
        Surface mix = smin(virtual, real, blend);

        // // * cut three.js scene from final result
        float finalDistance = subtract(mix.distance , real.distance - cutOffset);
        // float finalDistance = mix.distance;

        Surface finalSurface = mix;
        finalSurface.distance = finalDistance;

        Surface[4] surfaceList = Surface[](
          finalSurface,
          virtual,
          real,
          mix
        );

        return surfaceList;

    }

    #define SDF(position) getSurface(position, stickyPixelPosition, pixelColor)

    #define NORMAL_CALC_OFFSET vec2(0.001, 0)

    #define SDF_NORMAL(func, position) normalize(vec3(\
        func(position - NORMAL_CALC_OFFSET.xyy)[0].distance - func(position + NORMAL_CALC_OFFSET.xyy)[0].distance, \
        func(position - NORMAL_CALC_OFFSET.yxy)[0].distance - func(position + NORMAL_CALC_OFFSET.yxy)[0].distance, \
        func(position - NORMAL_CALC_OFFSET.yyx)[0].distance - func(position + NORMAL_CALC_OFFSET.yyx)[0].distance \
      ) \
    ) \

    vec3 getDirectionalLightsColor(Surface surf, vec3 point, vec3 pixelPosition, vec3 normal) {

      vec3 lightColor = vec3(0);

      for (int i = 0; i < uNumDirectionalLights; i++) {
        DirectionalLight dirLight = ${DIR_LIGHTS_UNIFORM_NAME}[i];

        vec3 lightPosition = dirLight.position; 
        vec3 color = dirLight.color;
        float intensity = dirLight.intensity;
        
        vec3 toLight = normalize(lightPosition - point); 

        float normalDotToLight = dot(toLight, normal);
        lightColor += color * intensity * clamp(normalDotToLight , 0., 1.); 

        float specularIntensity = pow(max(normalDotToLight , 0.0), surf.shininess);

        lightColor += color * specularIntensity; 
      }

      return lightColor;

    }



    vec3 getAmbientLightsColor() {

      vec3 lightColor = vec3(0);

      for (int i = 0; i < uNumAmbientLights; i++) {

        AmbientLight ambientLight = ${AMBIENT_LIGHTS_UNIFORM_NAME}[i];

        vec3 color = ambientLight.color;
        float intensity = ambientLight.intensity;

        lightColor += color * intensity; 

      }

      return lightColor;

    }

    vec4 getLightColor(Surface[4] sdf, vec3 point, vec3 pixelPosition, vec3 normal) {

      Surface surface = sdf[0];
      float dist = surface.distance;

      vec3 lightColor = vec3(0);

      // * directional lights
      vec3 directionalLightsColor = getDirectionalLightsColor(surface, point, pixelPosition, normal);

      // * ambient lights
      vec3 ambientLightsColor = getAmbientLightsColor();

      lightColor = directionalLightsColor + ambientLightsColor;


      vec3 baseColor = surface.diffuse;
      vec3 rayDirection = normalize(pixelPosition - uCameraPosition);

      // * env map
      vec4 envColor = sampleEnvMap(rayDirection, normal);

      // * fresnel
      float fresnel = clamp(dot(normal, rayDirection), 0., 1.);
      float fresnelBrightnessMask = clamp(pow(1.0 - fresnel, 4.0), 0.0, 1.0);

      // * alpha
      float realDistance = sdf[2].distance;
      float contactEdgeMask = fit(abs(dist - realDistance - uContactEdgeOffset), uContactEdgeMin, uContactEdgeMax, 0.0, 1.0);
      float contactEdgeMaskClamped = clamp(contactEdgeMask, 0., 1.);
      float alpha = clamp(easeInExpo(contactEdgeMaskClamped) - pow(fresnel, 2.0) / 2.0, 0., 1.);
      
      // * light color
      vec3 light = lightColor + fresnelBrightnessMask;

      // * mixing reflection in
      vec3 reflection = vec3(pow(1. - fresnel, 3.));
      vec3 outgoingLight = mix(baseColor, baseColor * envColor.rgb, reflection) * light;

      return vec4(outgoingLight, alpha);

    }

    vec3 getPixelNormal(sampler2D depth, vec2 uv, vec3 pixelViewDirection) {

        float c0 = getDepth(depth, uv + vec2(0,0) / uResolution);
        float l2 = getDepth(depth, uv - vec2(2,0) / uResolution);
        float l1 = getDepth(depth, uv - vec2(1,0) / uResolution);
        float r1 = getDepth(depth, uv + vec2(1,0) / uResolution);
        float r2 = getDepth(depth, uv + vec2(2,0) / uResolution);
        float b2 = getDepth(depth, uv - vec2(0,2) / uResolution);
        float b1 = getDepth(depth, uv - vec2(0,1) / uResolution);
        float t1 = getDepth(depth, uv + vec2(0,1) / uResolution);
        float t2 = getDepth(depth, uv + vec2(0,2) / uResolution);
        
        float dl = abs(l1*l2/(2.0*l2-l1)-c0);
        float dr = abs(r1*r2/(2.0*r2-r1)-c0);
        float db = abs(b1*b2/(2.0*b2-b1)-c0);
        float dt = abs(t1*t2/(2.0*t2-t1)-c0);
        
        vec3 ce = getPixelPosition(uv, c0);

        vec3 dpdx = (dl<dr) ?  ce - getPixelPosition(uv - vec2(1, 0) / uResolution, l1) : 
                              -ce + getPixelPosition(uv + vec2(1, 0) / uResolution, r1) ;
        vec3 dpdy = (db<dt) ?  ce - getPixelPosition(uv - vec2(0, 1) / uResolution, b1) : 
                              -ce + getPixelPosition(uv + vec2(0, 1) / uResolution, t1) ;

        return normalize(cross(dpdx,dpdy));

    }

    vec3 getPixelNormalViewSpace(sampler2D depth, vec2 coords, vec3 pixelViewDirection) {

      vec3 pixelNormal = getPixelNormal(depth, coords, pixelViewDirection);
      return vec4(viewMatrix * vec4(pixelNormal, 1)).xyz;

    }

    vec4 rayMarch(vec2 uv, vec3 pixelColor) {

      vec4 color = vec4(0);

      // * vector going from the camera to the pixel that is drawn
      vec3 pixelViewVector = getCameraToPixelVector(uv);

      // * ray march setup
      vec3 rayOrigin = uCameraPosition;
      vec3 rayDirection = normalize(pixelViewVector);

      // * depth buffer
      float depth = length(pixelViewVector);

      // * depth of sticky objects
      float stickyDepth = getPixelDepth(uStickyDepthTexture, vUv, rayDirection);

      // * pixel position of sticky objects
      vec3 stickyPixelPosition = uCameraPosition + rayDirection * stickyDepth;












      float traveled = SDF(rayOrigin)[0].distance;

      // const float EPS_MULTIPLIER = 1.;
      const float EPS_MULTIPLIER = 1.125;
      float eps = uRayMarchHitThreshold;

      const float OVERSHOOT_RELAXED = 1.125;
      // const float OVERSHOOT_RELAXED = 1.;
      float overshoot = 1.;
      float move = 0.0;

      while (traveled > eps && traveled < uMaxMarchDistance && traveled < depth) {

        // * march forward
	      vec3 position = rayOrigin + rayDirection * traveled;

        Surface[4] sdf = SDF(position);
        float dist = sdf[0].distance;


        if(sign(dist) < 0.0) {

          // * we passed through something

          float moveBack = move - move / overshoot;
          traveled -= moveBack;

          position = rayOrigin + rayDirection * traveled;

          sdf = SDF(position);
          dist = sdf[0].distance;

          overshoot = 1.0; // * disable overshoot now

        } else {

          overshoot = OVERSHOOT_RELAXED;

        }

        if (dist < eps) {

          // * we hit something

          vec3 normal = SDF_NORMAL(SDF, position);
          vec4 lightColor = getLightColor(sdf, position, stickyPixelPosition, normal);

          return lightColor;

        }  

        move = dist * overshoot;
        traveled += move;
        eps *= EPS_MULTIPLIER; // Potential for further research here...

      }

      return color;

    }

		void main() {

      // * render image
			vec4 diffuseColor = texture(uDiffuseTexture, vUv);
      vec4 rayMarchColor = rayMarch(vUv, diffuseColor.rgb);

      // * apply tone mapping
      rayMarchColor.rgb = filmicToneMapping(rayMarchColor.rgb);

      // * gamma correction
      const float GAMMA = 2.2;
      vec3 color = pow(rayMarchColor.rgb, vec3(1.0 / GAMMA));
			rayMarchColor.rgb = color;

      // * sRGB conversion
      rayMarchColor.rgb = encodeSRGB(rayMarchColor.rgb);

			gl_FragColor = vec4(mix(diffuseColor.rgb, rayMarchColor.rgb, vec3(rayMarchColor.a)), 1);

		}`

    this.shader = {
      uniforms: this.uniforms,
      vertexShader: this.vertexShader,
      fragmentShader: this.fragmentShader,
    }

    // * postprocess pass
    this.shaderPass = new ShaderPass(this.shader, 'uDiffuseTexture')

    this.init()
  }

  init() {
    // * lights update
    useSceneLightsUpdate(() =>
      updateLightsUniforms(this.shaderPass, DIR_LIGHTS_UNIFORM_NAME, AMBIENT_LIGHTS_UNIFORM_NAME)
    )

    // * physics
    const scene = useScene()
    for (let i = 0; i < this.spheresCount; i++) {
      const sphereObject = this.spheres[i].object
      sphereObject.position.y += i / 100
      sphereObject.position.x += i / 100
      sphereObject.position.z += i / 100
    }

    return this.shaderPass
  }

  addSpherePhysics(sphere: SphereObject3D) {
    const camera = useCamera()
    const controls = useControls()
    sphere.position.copy(controls.character.position)
    sphere.position.y += sphere.radius / 2

    const direction = camera.getWorldDirection(vec3_0)
    sphere.position.addScaledVector(direction, sphere.radius)

    const po = (sphere.physicsObject = addPhysics(
      sphere,
      'dynamic',
      true,
      undefined,
      'ball',
      { radius: sphere.radius / 4 },
      PHYSICS_COLLISION_TYPE.ALL_COLLISIONS
    ))

    if (po.collider) {
      po.collider.setMass(5)
      po.collider.setRestitution(1)
      // console.log(po.collider.translation())
    }
  }

  shootSphere() {
    const pointerLocked = usePointerLocked()

    if (pointerLocked && this.spheresCount < this.spheres.length) {
      const camera = useCamera()

      const sphere = this.spheres[this.spheresCount]
      const object = sphere.object

      this.addSpherePhysics(object)

      const direction = camera.getWorldDirection(vec3_0)

      const rigidBody = object.physicsObject?.rigidBody
      if (rigidBody) {
        rigidBody.applyImpulse(direction.multiplyScalar(object.radius * 20 * object.radius), true)
      }

      this.spheresCount++
    }
  }

  update(
    timestamp: number,
    exclusionMaterialArray?: Array<THREE.Material>,
    exclusionReflectionArray?: Array<THREE.Material>
  ) {
    if (this.shaderPass) {
      const camera = useCamera()
      const scene = useScene()
      const renderer = useRenderer()

      this.shaderPass.uniforms.uCameraPosition.value.copy(camera.position)
      this.shaderPass.uniforms.uCameraQuaternion.value.copy(camera.quaternion)

      for (let i = 0; i < this.spheres.length; i++) {
        const sphere = this.spheres[i]
        sphere.update()
      }

      for (let i = 0; i < this.spheresCount; i++) {
        const sphere = this.spheres[i]
        const object = sphere.object
      }

      this.shaderPass.uniforms.uCameraDirection.value.copy(camera.getWorldDirection(vec3_0))
      this.shaderPass.uniforms.uTime.value = timestamp / 1000

      this.shaderPass.uniforms.uSpheresCount.value = this.spheresCount

      // // * remove objects from the depth buffer temporarily
      // if (exclusionReflectionArray) {
      //   for (let i = 0; i < exclusionReflectionArray.length; i++) {
      //     const material = exclusionReflectionArray[i]
      //     material.opacity = 0
      //   }
      // }

      // this.cubeCamera.update(renderer, scene)
      // this.shaderPass.uniforms.uEnvMap.value = this.cubeRenderTarget.texture

      // // * add objects back to the depth buffer
      // if (exclusionReflectionArray) {
      //   for (let i = 0; i < exclusionReflectionArray.length; i++) {
      //     const material = exclusionReflectionArray[i]
      //     material.opacity = 0.7
      //   }
      // }

      renderer.setRenderTarget(this.depthRenderTarget)
      renderer.render(scene, camera)

      // * remove objects from the depth buffer temporarily
      if (exclusionMaterialArray) {
        for (let i = 0; i < exclusionMaterialArray.length; i++) {
          const material = exclusionMaterialArray[i]
          material.depthWrite = false
        }
      }

      renderer.setRenderTarget(this.stickyDepthRenderTarget)
      renderer.render(scene, camera)

      // * add objects back to the depth buffer
      if (exclusionMaterialArray) {
        for (let i = 0; i < exclusionMaterialArray.length; i++) {
          const material = exclusionMaterialArray[i]
          material.depthWrite = true
        }
      }
    }
  }
}

export { RayMarchShader }
