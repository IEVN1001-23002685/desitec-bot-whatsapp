import { mensajes } from '../../../../shared/db/schema/index.js'
import type { Transaccion } from '../../../../shared/db/tipos.js'
import type {
  EntradaInsertarMensajeEntrante,
  RepositorioMensaje,
} from '../../domain/ports/repositorio-mensaje.js'

export class RepositorioDrizzleMensaje implements RepositorioMensaje {
  constructor(private readonly baseDeDatos: Transaccion) {}

  async insertarEntrante(
    entrada: EntradaInsertarMensajeEntrante,
  ): Promise<{ insertado: boolean; id: string | null }> {
    const insertados = await this.baseDeDatos
      .insert(mensajes)
      .values({
        idConversacion: entrada.idConversacion,
        idCuentaWhatsApp: entrada.idCuentaWhatsApp,
        direccion: 'entrante',
        idMensajeMeta: entrada.idMensajeMeta,
        tipo: entrada.tipo,
        cuerpo: entrada.cuerpo,
        cargaUtil: entrada.cargaUtil,
        marcaTiempoMeta: entrada.marcaTiempoMeta,
      })
      .onConflictDoNothing({ target: mensajes.idMensajeMeta })
      .returning({ id: mensajes.id })

    const fila = insertados[0]
    return { insertado: fila !== undefined, id: fila ? fila.id : null }
  }
}
