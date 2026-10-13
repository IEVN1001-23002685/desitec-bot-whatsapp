export type EntradaEnviarMensaje = {
  idNumeroTelefono: string
  tokenAcceso: string
  idWa: string
  cuerpo: string
}

export type ResultadoEnviarMensaje = {
  idMensajeMeta: string
}

export interface ProveedorMensajes {
  enviar(entrada: EntradaEnviarMensaje): Promise<ResultadoEnviarMensaje>
}
