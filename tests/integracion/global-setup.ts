import { crearBaseDeDatosDePrueba } from './base-datos.js'

export default async function prepararBaseDeDatosDePrueba(): Promise<() => Promise<void>> {
  await crearBaseDeDatosDePrueba()
  return async () => {}
}
