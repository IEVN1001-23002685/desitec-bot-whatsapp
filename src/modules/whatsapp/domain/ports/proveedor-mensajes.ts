import type { ProveedorMensajeria } from '../types/proveedor-mensajeria.js'

export type EntradaEnviarMensajeTexto = {
  tipo: 'text'
  proveedor: ProveedorMensajeria
  idNumeroTelefono: string
  credencial: string
  idWa: string
  cuerpo: string
}

export type ParametroPlantilla = {
  tipo: 'text'
  texto: string
}

export type EntradaEnviarMensajePlantilla = {
  tipo: 'template'
  proveedor: ProveedorMensajeria
  idNumeroTelefono: string
  credencial: string
  idWa: string
  nombrePlantilla: string
  idiomaPlantilla: string
  parametros?: ParametroPlantilla[]
}

export type EntradaEnviarMensaje = EntradaEnviarMensajeTexto | EntradaEnviarMensajePlantilla

export type ResultadoEnviarMensaje = {
  idMensajeMeta: string
}

export interface ProveedorMensajes {
  enviar(entrada: EntradaEnviarMensaje): Promise<ResultadoEnviarMensaje>
}
