const InitRapier = async () => {
  // ! this way of importing the rapier module has not been documented anywhere
  // ! and it seems like a bug
  const mod = await import('@dimforge/rapier3d')
  const RAPIER = await mod.default

  return RAPIER
}

export default InitRapier

