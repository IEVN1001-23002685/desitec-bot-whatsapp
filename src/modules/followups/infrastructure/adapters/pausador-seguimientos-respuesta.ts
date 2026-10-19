import type { PausadorSeguimientos } from '../../../whatsapp/application/ports/pausador-seguimientos.js'
import type { RepositorioSeguimientoProgramado } from '../../domain/ports/repositorio-seguimiento-programado.js'

export const MOTIVO_RESPUESTA_CLIENTE = 'respuesta_cliente'

export class PausadorSeguimientosRespuesta implements PausadorSeguimientos {
  constructor(private readonly seguimientos: RepositorioSeguimientoProgramado) {}

  async pausarPorRespuesta(idConversacion: string): Promise<number> {
    return this.seguimientos.cancelarPendientesPorConversacion(
      idConversacion,
      MOTIVO_RESPUESTA_CLIENTE,
    )
  }
}
