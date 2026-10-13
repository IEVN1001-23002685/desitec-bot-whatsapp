import { and, desc, eq } from 'drizzle-orm'
import { mensajes } from '../../../../shared/db/schema/index.js'
import type { Transaccion } from '../../../../shared/db/tipos.js'
import type {
  EntradaInsertarMensajeEntrante,
  EntradaInsertarMensajeSaliente,
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

  async insertarSaliente(entrada: EntradaInsertarMensajeSaliente): Promise<{ id: string }> {
    const insertados = await this.baseDeDatos
      .insert(mensajes)
      .values({
        idConversacion: entrada.idConversacion,
        idCuentaWhatsApp: entrada.idCuentaWhatsApp,
        direccion: 'saliente',
        idMensajeMeta: entrada.idMensajeMeta,
        tipo: entrada.tipo,
        cuerpo: entrada.cuerpo,
        estado: entrada.estado,
      })
      .returning({ id: mensajes.id })

    const fila = insertados[0]
    if (!fila) {
      throw new Error('No se pudo registrar el mensaje saliente')
    }
    return { id: fila.id }
  }

  async buscarUltimoEntranteEn(idConversacion: string): Promise<Date | null> {
    const filas = await this.baseDeDatos
      .select({ marcaTiempoMeta: mensajes.marcaTiempoMeta, creadoEn: mensajes.creadoEn })
      .from(mensajes)
      .where(and(eq(mensajes.idConversacion, idConversacion), eq(mensajes.direccion, 'entrante')))
      .orderBy(desc(mensajes.creadoEn))
      .limit(1)

    const fila = filas[0]
    if (!fila) {
      return null
    }
    return fila.marcaTiempoMeta ?? fila.creadoEn
  }
}
