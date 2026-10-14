export type EntradaEnviarMensajeTexto = {
  tipo: 'text'
  idNumeroTelefono: string
  tokenAcceso: string
  idWa: string
  cuerpo: string
}

export type ParametroPlantilla = {
  tipo: 'text'
  texto: string
}

export type EntradaEnviarMensajePlantilla = {
  tipo: 'template'
  idNumeroTelefono: string
  tokenAcceso: string
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
