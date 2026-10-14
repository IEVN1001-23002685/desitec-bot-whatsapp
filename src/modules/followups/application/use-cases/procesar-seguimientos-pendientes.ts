import type { RepositorioSeguimientoProgramado } from '../../domain/ports/repositorio-seguimiento-programado.js'
import {
  ErrorSeguimientoNoSeguible,
  type EnviarSeguimientoProgramado,
} from './enviar-seguimiento-programado.js'

export type OpcionesProcesarSeguimientos = {
  limite?: number
  ahora?: Date
}

export type ResultadoProcesarSeguimientos = {
  procesados: number
  enviados: number
  fallidos: number
  cancelados: number
}

export class ProcesarSeguimientosPendientes {
  constructor(
    private readonly seguimientos: RepositorioSeguimientoProgramado,
    private readonly enviarSeguimiento: EnviarSeguimientoProgramado,
  ) {}

  async ejecutar(
    opciones: OpcionesProcesarSeguimientos = {},
  ): Promise<ResultadoProcesarSeguimientos> {
    const limite = opciones.limite ?? 50
    const enviadoEn = opciones.ahora ?? new Date()
    const pendientes = await this.seguimientos.obtenerPendientesParaProcesar(limite)

    let enviados = 0
    let fallidos = 0
    let cancelados = 0

    for (const seguimiento of pendientes) {
      await this.seguimientos.marcarEnProceso(seguimiento.id, true)
      try {
        const { idMensajeMeta } = await this.enviarSeguimiento.ejecutar(seguimiento)
        await this.seguimientos.marcarEnviado(seguimiento.id, idMensajeMeta, enviadoEn)
        enviados++
      } catch (error) {
        if (error instanceof ErrorSeguimientoNoSeguible) {
          await this.seguimientos.marcarCancelado(seguimiento.id, error.message)
          cancelados++
        } else {
          await this.seguimientos.marcarFallido(seguimiento.id, mensajeDeError(error))
          fallidos++
        }
      }
    }

    return { procesados: pendientes.length, enviados, fallidos, cancelados }
  }
}

function mensajeDeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return 'Error desconocido'
}
