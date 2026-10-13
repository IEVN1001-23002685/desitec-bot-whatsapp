import type { EstadoSeguimiento } from '../types/estado-seguimiento.js'

export type SeguimientoProgramado = {
  id: string
  idConversacion: string
  idReglaSeguimiento: string
  programadoPara: Date
  estado: EstadoSeguimiento
  intentos: number
  idMensajeMeta: string | null
  error: string | null
  motivoCancelacion: string | null
  enviadoEn: Date | null
}
