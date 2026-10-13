import { and, eq } from 'drizzle-orm'
import { conversaciones } from '../../../../shared/db/schema/index.js'
import type { Transaccion } from '../../../../shared/db/tipos.js'
import type { Conversacion } from '../../domain/entities/conversacion.js'
import type {
  EntradaCrearConversacion,
  RepositorioConversacion,
} from '../../domain/ports/repositorio-conversacion.js'

type FilaConversacion = typeof conversaciones.$inferSelect

export class RepositorioDrizzleConversacion implements RepositorioConversacion {
  constructor(private readonly baseDeDatos: Transaccion) {}

  async buscarPorCuentaYContacto(
    idCuentaWhatsApp: string,
    idContacto: string,
  ): Promise<Conversacion | null> {
    const filas = await this.baseDeDatos
      .select()
      .from(conversaciones)
      .where(
        and(
          eq(conversaciones.idCuentaWhatsApp, idCuentaWhatsApp),
          eq(conversaciones.idContacto, idContacto),
        ),
      )
      .limit(1)
    const fila = filas[0]
    return fila ? mapearConversacion(fila) : null
  }

  async crear(entrada: EntradaCrearConversacion): Promise<Conversacion> {
    const insertadas = await this.baseDeDatos
      .insert(conversaciones)
      .values({
        idCuentaWhatsApp: entrada.idCuentaWhatsApp,
        idContacto: entrada.idContacto,
        ultimoMensajeEn: entrada.en,
      })
      .onConflictDoNothing({
        target: [conversaciones.idCuentaWhatsApp, conversaciones.idContacto],
      })
      .returning()

    const creada = insertadas[0]
    if (creada) {
      return mapearConversacion(creada)
    }

    const existente = await this.buscarPorCuentaYContacto(
      entrada.idCuentaWhatsApp,
      entrada.idContacto,
    )
    if (!existente) {
      throw new Error('No se pudo persistir la conversación')
    }
    return existente
  }

  async actualizarUltimoMensaje(idConversacion: string, en: Date): Promise<void> {
    await this.baseDeDatos
      .update(conversaciones)
      .set({ ultimoMensajeEn: en, actualizadoEn: new Date() })
      .where(eq(conversaciones.id, idConversacion))
  }
}

function mapearConversacion(fila: FilaConversacion): Conversacion {
  return {
    id: fila.id,
    idCuentaWhatsApp: fila.idCuentaWhatsApp,
    idContacto: fila.idContacto,
    estado: fila.estado,
    ultimoMensajeEn: fila.ultimoMensajeEn,
  }
}