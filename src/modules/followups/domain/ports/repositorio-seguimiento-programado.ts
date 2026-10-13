import type { SeguimientoProgramado } from '../entities/seguimiento-programado.js'
import type { EstadoSeguimiento } from '../types/estado-seguimiento.js'

export type EntradaProgramarSeguimiento = {
  idConversacion: string
  idReglaSeguimiento: string
  programadoPara: Date
}

export interface RepositorioSeguimientoProgramado {
  programar(entrada: EntradaProgramarSeguimiento): Promise<SeguimientoProgramado>
  obtenerPendientesParaProcesar(limite: number): Promise<SeguimientoProgramado[]>
  marcarEnProceso(id: string, enProceso: boolean): Promise<void>
  marcarEnviado(id: string, idMensajeMeta: string, enviadoEn: Date): Promise<void>
  marcarFallido(id: string, error: string): Promise<void>
  marcarCancelado(id: string, motivo: string): Promise<void>
  cancelarPendientesPorConversacion(idConversacion: string, motivo: string): Promise<number>
  obtenerPorId(id: string): Promise<SeguimientoProgramado | null>
  cambiarEstado(id: string, estado: EstadoSeguimiento): Promise<void>
}
