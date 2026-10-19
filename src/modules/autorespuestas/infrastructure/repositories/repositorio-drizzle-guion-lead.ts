import { and, eq } from 'drizzle-orm'
import { guionFlujoLead } from '../../../../shared/db/schema/index.js'
import type { BaseDeDatos, Transaccion } from '../../../../shared/db/tipos.js'
import type { EntradaGuion } from '../../domain/entities/entrada-guion.js'
import type { RepositorioGuionLead } from '../../domain/ports/repositorio-guion-lead.js'

export class RepositorioDrizzleGuionLead implements RepositorioGuionLead {
  constructor(private readonly baseDeDatos: Transaccion | BaseDeDatos) {}

  async buscarActivaPorClave(clave: string): Promise<EntradaGuion | null> {
    const filas = await this.baseDeDatos
      .select()
      .from(guionFlujoLead)
      .where(and(eq(guionFlujoLead.clave, clave), eq(guionFlujoLead.activo, true)))
      .limit(1)
    const fila = filas[0]
    if (!fila) {
      return null
    }
    return {
      id: fila.id,
      clave: fila.clave,
      orden: fila.orden,
      texto: fila.texto,
      activa: fila.activo,
    }
  }
}
