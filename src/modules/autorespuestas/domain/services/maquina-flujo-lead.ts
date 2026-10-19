import type { PasoLead } from '../types/paso-lead.js'

export type CampoLead =
  | { campo: 'nombre'; valor: string }
  | { campo: 'correo'; valor: string }
  | { campo: 'modelos'; valor: string }
  | { campo: 'cantidad'; valor: number }
  | { campo: 'ciudad'; valor: string }

export type EvaluacionPaso =
  | { valido: true; campo: CampoLead; siguiente: PasoLead | null }
  | { valido: false; claveRespuesta: string }

const PATRON_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function evaluarPaso(paso: PasoLead, texto: string): EvaluacionPaso {
  const limpio = texto.trim()
  switch (paso) {
    case 'nombre':
      return limpio.length > 0
        ? { valido: true, campo: { campo: 'nombre', valor: limpio }, siguiente: 'correo' }
        : { valido: false, claveRespuesta: clavePedirPaso(paso) }
    case 'correo': {
      const correo = limpio.toLowerCase()
      return PATRON_CORREO.test(correo)
        ? { valido: true, campo: { campo: 'correo', valor: correo }, siguiente: 'modelos' }
        : { valido: false, claveRespuesta: 'correo_invalido' }
    }
    case 'modelos':
      return limpio.length > 0
        ? { valido: true, campo: { campo: 'modelos', valor: limpio }, siguiente: 'cantidad' }
        : { valido: false, claveRespuesta: clavePedirPaso(paso) }
    case 'cantidad': {
      const cantidad = Number(limpio)
      return Number.isInteger(cantidad) && cantidad > 0
        ? { valido: true, campo: { campo: 'cantidad', valor: cantidad }, siguiente: 'ciudad' }
        : { valido: false, claveRespuesta: 'cantidad_invalida' }
    }
    case 'ciudad':
      return limpio.length > 0
        ? { valido: true, campo: { campo: 'ciudad', valor: limpio }, siguiente: null }
        : { valido: false, claveRespuesta: clavePedirPaso(paso) }
  }
}

export function clavePedirPaso(paso: PasoLead): string {
  return `pedir_${paso}`
}
