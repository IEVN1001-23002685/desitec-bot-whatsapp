import { eq } from 'drizzle-orm'
import { eventosWebhook } from '../../../../shared/db/schema/index.js'
import type { BaseDeDatos } from '../../../../shared/db/tipos.js'
import type {
  EntradaRegistrarEventoWebhook,
  RepositorioEventoWebhook,
  ResumenEventoWebhook,
} from '../../domain/ports/repositorio-evento-webhook.js'

export class RepositorioDrizzleEventoWebhook implements RepositorioEventoWebhook {
  constructor(private readonly baseDeDatos: BaseDeDatos) {}

  async intentarRegistrar(
    entrada: EntradaRegistrarEventoWebhook,
  ): Promise<{ insertado: boolean; id: string }> {
    const insertados = await this.baseDeDatos
      .insert(eventosWebhook)
      .values({
        claveEvento: entrada.claveEvento,
        tipoObjeto: entrada.tipoObjeto,
        cargaUtilOriginal: entrada.cargaUtilOriginal,
        estado: 'recibido',
      })
      .onConflictDoNothing({ target: eventosWebhook.claveEvento })
      .returning({ id: eventosWebhook.id })

    const fila = insertados[0]
    if (fila) {
      return { insertado: true, id: fila.id }
    }

    const existente = await this.buscarPorClaveEvento(entrada.claveEvento)
    if (!existente) {
      throw new Error('No se pudo registrar el evento de webhook')
    }
    return { insertado: false, id: existente.id }
  }

  async buscarPorClaveEvento(claveEvento: string): Promise<ResumenEventoWebhook | null> {
    const filas = await this.baseDeDatos
      .select({ id: eventosWebhook.id, estado: eventosWebhook.estado })
      .from(eventosWebhook)
      .where(eq(eventosWebhook.claveEvento, claveEvento))
      .limit(1)
    const fila = filas[0]
    if (!fila) {
      return null
    }
    return { id: fila.id, estado: fila.estado }
  }

  async marcarEstado(
    claveEvento: string,
    estado: ResumenEventoWebhook['estado'],
    error: string | null,
  ): Promise<void> {
    await this.baseDeDatos
      .update(eventosWebhook)
      .set({ estado, error, procesadoEn: new Date() })
      .where(eq(eventosWebhook.claveEvento, claveEvento))
  }
}
