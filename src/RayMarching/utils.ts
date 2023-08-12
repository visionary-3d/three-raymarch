export const ObjectArray = (object: new (p?: any) => any, num: number, params?: any) => {
  const array = new Array<typeof object>(num)
  for (let i = 0; i < array.length; i++) {
    array[i] = new object(params)
  }

  return array
}

export const ObjectContainerArray = (
  objectContainer: new (obj: any, struct: any) => any,
  obj: new (p?: any) => any,
  struct: any,
  num: number,
  params?: any,
  fn?: Function
) => {
  const array = new Array<typeof objectContainer>(num)
  for (let i = 0; i < array.length; i++) {
    const o = new obj(params);
    fn && fn(o)
    array[i] = new objectContainer(o, new struct(o))
  }

  return array
}
