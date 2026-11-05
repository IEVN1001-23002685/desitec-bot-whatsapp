import type {
  OrigenPausa,
  PausadorSeguimientos,
} from '../../../whatsapp/application/ports/pausador-seguimientos.js'
import type { RepositorioSeguimientoProgramado } from '../../domain/ports/repositorio-seguimiento-programado.js'

export const MOTIVO_RESPUESTA_CLIENTE = 'respuesta_cliente'
export const MOTIVO_RESPUESTA_ASESOR = 'respuesta_asesor'

export class PausadorSeguimientosRespuesta implements PausadorSeguimientos {
  constructor(private readonly seguimientos: RepositorioSeguimientoProgramado) {}

  async pausarPorRespuesta(
    idConversacion: string,
    origen: OrigenPausa = 'cliente',
  ): Promise<number> {
    const motivo = origen === 'asesor' ? MOTIVO_RESPUESTA_ASESOR : MOTIVO_RESPUESTA_CLIENTE
    return this.seguimientos.cancelarPendientesPorConversacion(idConversacion, motivo)
  }
}
