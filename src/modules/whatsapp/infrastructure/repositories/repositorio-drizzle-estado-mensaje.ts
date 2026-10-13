import { eq } from 'drizzle-orm'
import { mensajes } from '../../../../shared/db/schema/index.js'
import type { BaseDeDatos } from '../../../../shared/db/tipos.js'
import type { RepositorioEstadoMensaje } from '../../domain/ports/repositorio-estado-mensaje.js'

export class RepositorioDrizzleEstadoMensaje implements RepositorioEstadoMensaje {
  constructor(private readonly baseDeDatos: BaseDeDatos) {}

  async actualizarEstado(idMensajeMeta: string, estado: string): Promise<boolean> {
    const actualizados = await this.baseDeDatos
      .update(mensajes)
      .set({ estado })
      .where(eq(mensajes.idMensajeMeta, idMensajeMeta))
      .returning({ id: mensajes.id })
    return actualizados.length > 0
  }
}
