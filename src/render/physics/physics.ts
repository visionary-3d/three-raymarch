import Rapier from '@dimforge/rapier3d'
import * as THREE from 'three'
import { RAPIER, usePhysics, usePhysicsObjects } from '../init'

// ! Collision Types Comparison:
// * ALL_COLLISIONS > DEFAULT_COLLISIONS > MOST_COLLISIONS_1 = MOST_COLLISIONS_2 > FEW_COLLISIONS_1 = FEW_COLLISIONS_2
// * NO_SELF_COLLISIONS > NO_SELF_MOST_COLLISIONS > NO_SELF_FEW_COLLISIONS  > NO_COLLISIONS

// * NO_SELF_COLLISION types and NO_COLLISIONS are speciall cases that allow ALL_COLLISIONS to collide with them

export enum PHYSICS_COLLISION_TYPE {
  ALL_COLLISIONS = 1, // -> can collide with every single collider (aka GOD MODE)
  DEFAULT_COLLISIONS, // -> can collide with ALL_COLLISIONS, DEFAULT_COLLISIONS, MOST_COLLISIONS_1, MOST_COLLISIONS_2
  NO_COLLISIONS, // -> can't collide with anything except ALL_COLLISIONS and itself
  NO_SELF_COLLISIONS, // -> no self collision, but collides with everything else
  NO_SELF_MOST_COLLISIONS, // -> no self collision, can collide with everything except NO_SELF_COLLISIONS, FEW_COLLISIONS_1, FEW_COLLISIONS_2, NO_COLLISIONS
  NO_SELF_FEW_COLLISIONS, // -> no self collision, can only collide with ALL_COLLISIONS
  MOST_COLLISIONS_1, // -> colliding with pretty much everything except MOST_COLLISIONS_2, FEW_COLLISIONS_1, FEW_COLLISIONS_2, NO_COLLISIONS
  MOST_COLLISIONS_2, // -> colliding with pretty much everything except MOST_COLLISIONS_1, FEW_COLLISIONS_1, FEW_COLLISIONS_2, NO_COLLISIONS
  FEW_COLLISIONS_1, // -> only collides with itself and ALL_COLLISIONS
  FEW_COLLISIONS_2, // -> only collides with itself and ALL_COLLISIONS
}

enum PHYSICS_COLLISION_GROUPS {
  // Start from 1 because we're going to convert this to a binary value
  GROUP1 = 1,
  GROUP2,
  GROUP3,
  GROUP4,
  GROUP5,
  GROUP6,
  GROUP7,
  GROUP8,
}

const setCharAt = (str: string, index: number, chr: string) => {
  if (index > str.length - 1) return str
  return str.substring(0, index) + chr + str.substring(index + 1)
}
const setGroupInBinary = (binaryString: string, num: number, value: boolean) => {
  const ONE = '1'
  const ZERO = '0'
  return setCharAt(binaryString, 16 - num, value ? ONE : ZERO)
}

const getBitmaskHex = (groupsArray?: Array<number>) => {
  let collisionGroup = '0000000000000000' // 16 bits

  // enable bits
  if (groupsArray) {
    for (let i = 0; i < groupsArray.length; i++) {
      collisionGroup = setGroupInBinary(collisionGroup, groupsArray[i], true)
    }
  }

  // converting binary to hex
  return parseInt(collisionGroup, 2).toString(16).padStart(4, '0').toUpperCase()
}

export const getCollisionGroupsHex = (
  membershipArray?: Array<number>,
  filterArray?: Array<number>
) => {
  const groupMembership = getBitmaskHex(membershipArray)
  const groupFilter = getBitmaskHex(filterArray)

  return parseInt(groupMembership + groupFilter, 16)
}

export type PhysicsObject = {
  mesh: THREE.Object3D
  collider?: Rapier.Collider
  rigidBody: Rapier.RigidBody
  fn?: Function
  autoAnimate: boolean
}

export const addPhysics = (
  mesh: THREE.Object3D,
  type: string,
  autoAnimate: boolean = true,
  postPhysicsFn?: Function,
  colliderType?: string,
  colliderSettings?: any, // ! fix "any"
  collisionGroupType?: number,
  solverGroupType?: number
) => {
  const physics = usePhysics()
  const physicsObjects = usePhysicsObjects()

  const rigidBodyDesc = (RAPIER.RigidBodyDesc as any)[type]()
  rigidBodyDesc.setTranslation(mesh.position.x, mesh.position.y, mesh.position.z)
  const rigidBody = physics.createRigidBody(rigidBodyDesc)

  let colliderDesc

  switch (colliderType) {
    case 'cuboid':
      {
        const { width, height, depth } = colliderSettings
        colliderDesc = RAPIER.ColliderDesc.cuboid(width, height, depth)
      }
      break

    case 'ball':
      {
        const { radius } = colliderSettings
        colliderDesc = RAPIER.ColliderDesc.ball(radius)
      }
      break

    case 'capsule':
      {
        const { halfHeight, radius } = colliderSettings
        colliderDesc = RAPIER.ColliderDesc.capsule(halfHeight, radius)
      }
      break

    default:
      {
        if (mesh instanceof THREE.Mesh) {
          const vertexCount = mesh.geometry.attributes.position.count
          if (vertexCount) {
            let index: Uint32Array

            if (mesh.geometry.index) {
              index = new Uint32Array(mesh.geometry.index.count)
              index.forEach((_, id) => {
                index[id] = mesh.geometry.index.array[id]
              })
            } else {
              index = new Uint32Array(vertexCount)
              index.forEach((_, id) => {
                index[id] = id
              })
            }

            colliderDesc = RAPIER.ColliderDesc.trimesh(
              mesh.geometry.attributes.position.array as Float32Array,
              index
            )
          }
        } else {
          console.error('addPhysics: no collider data has been provided.')
        }
      }
      break
  }

  let collider

  if (colliderDesc) {
    const getCollisionGroups = (type?: number) => {
      let collisionMemberships: Array<number>
      let collisionFilters: Array<number>

      switch (type) {
        case PHYSICS_COLLISION_TYPE.ALL_COLLISIONS: {
          const CA = Object.values(PHYSICS_COLLISION_TYPE)
          collisionMemberships = CA as Array<number>
          collisionMemberships.splice(0, CA.length / 2)
          collisionFilters = collisionMemberships
          break
        }

        case PHYSICS_COLLISION_TYPE.DEFAULT_COLLISIONS: {
          collisionMemberships = [PHYSICS_COLLISION_GROUPS.GROUP1, PHYSICS_COLLISION_GROUPS.GROUP2]
          collisionFilters = [PHYSICS_COLLISION_GROUPS.GROUP1, PHYSICS_COLLISION_GROUPS.GROUP2]
          break
        }

        case PHYSICS_COLLISION_TYPE.NO_COLLISIONS: {
          const CA = Object.values(PHYSICS_COLLISION_TYPE)
          collisionMemberships = CA as Array<number>
          collisionMemberships.splice(0, CA.length / 2)
          collisionFilters = [PHYSICS_COLLISION_GROUPS.GROUP8]
          break
        }

        case PHYSICS_COLLISION_TYPE.NO_SELF_COLLISIONS: {
          collisionMemberships = [PHYSICS_COLLISION_GROUPS.GROUP5]
          collisionFilters = [
            PHYSICS_COLLISION_GROUPS.GROUP1,
            PHYSICS_COLLISION_GROUPS.GROUP2,
            PHYSICS_COLLISION_GROUPS.GROUP3,
            PHYSICS_COLLISION_GROUPS.GROUP4,
          ]
          break
        }

        case PHYSICS_COLLISION_TYPE.NO_SELF_MOST_COLLISIONS: {
          collisionMemberships = [PHYSICS_COLLISION_GROUPS.GROUP6]
          collisionFilters = [
            PHYSICS_COLLISION_GROUPS.GROUP1,
            PHYSICS_COLLISION_GROUPS.GROUP2,
            PHYSICS_COLLISION_GROUPS.GROUP5,
          ]
          break
        }

        case PHYSICS_COLLISION_TYPE.NO_SELF_FEW_COLLISIONS: {
          collisionMemberships = [PHYSICS_COLLISION_GROUPS.GROUP6]
          collisionFilters = [PHYSICS_COLLISION_GROUPS.GROUP7]
          break
        }

        case PHYSICS_COLLISION_TYPE.FEW_COLLISIONS_1: {
          collisionMemberships = [PHYSICS_COLLISION_GROUPS.GROUP3]
          collisionFilters = [PHYSICS_COLLISION_GROUPS.GROUP3]
          break
        }

        case PHYSICS_COLLISION_TYPE.FEW_COLLISIONS_2: {
          collisionMemberships = [PHYSICS_COLLISION_GROUPS.GROUP4]
          collisionFilters = [PHYSICS_COLLISION_GROUPS.GROUP4]
          break
        }

        case PHYSICS_COLLISION_TYPE.MOST_COLLISIONS_1: {
          collisionMemberships = [
            PHYSICS_COLLISION_GROUPS.GROUP1,
            PHYSICS_COLLISION_GROUPS.GROUP5,
            PHYSICS_COLLISION_GROUPS.GROUP6,
          ]
          collisionFilters = [
            PHYSICS_COLLISION_GROUPS.GROUP1,
            PHYSICS_COLLISION_GROUPS.GROUP5,
            PHYSICS_COLLISION_GROUPS.GROUP6,
          ]
          break
        }

        case PHYSICS_COLLISION_TYPE.MOST_COLLISIONS_2: {
          collisionMemberships = [
            PHYSICS_COLLISION_GROUPS.GROUP2,
            PHYSICS_COLLISION_GROUPS.GROUP5,
            PHYSICS_COLLISION_GROUPS.GROUP6,
          ]
          collisionFilters = [
            PHYSICS_COLLISION_GROUPS.GROUP2,
            PHYSICS_COLLISION_GROUPS.GROUP5,
            PHYSICS_COLLISION_GROUPS.GROUP6,
          ]
          break
        }

        default: {
          collisionMemberships = [
            PHYSICS_COLLISION_GROUPS.GROUP1,
            PHYSICS_COLLISION_GROUPS.GROUP2,
            PHYSICS_COLLISION_GROUPS.GROUP5,
            PHYSICS_COLLISION_GROUPS.GROUP6,
          ]
          collisionFilters = [
            PHYSICS_COLLISION_GROUPS.GROUP1,
            PHYSICS_COLLISION_GROUPS.GROUP2,
            PHYSICS_COLLISION_GROUPS.GROUP5,
            PHYSICS_COLLISION_GROUPS.GROUP6,
          ]
          break
        }
      }

      return { collisionMemberships, collisionFilters }
    }
    const { collisionMemberships, collisionFilters } = getCollisionGroups(collisionGroupType)
    const { collisionMemberships: solverMemberships, collisionFilters: solverFilters } =
      getCollisionGroups(solverGroupType)

    const collisionGroups = getCollisionGroupsHex(collisionMemberships, collisionFilters)
    colliderDesc.setCollisionGroups(collisionGroups)

    const solverGroups = getCollisionGroupsHex(solverMemberships, solverFilters)
    colliderDesc.setSolverGroups(solverGroups)

    collider = physics.createCollider(colliderDesc, rigidBody)
  } else {
    console.error('Collider Mesh Error: triangle mesh creation failed.')
  }

  const physicsObject: PhysicsObject = {
    mesh,
    collider: collider ? collider : undefined,
    rigidBody,
    fn: postPhysicsFn,
    autoAnimate,
  }

  physicsObjects.push(physicsObject)

  return physicsObject
}
