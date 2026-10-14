import type { Transaccion } from '../../../../shared/db/tipos.js'
import type { BaseDeDatos } from '../../../../shared/db/tipos.js'
import type { RepositorioReglaSeguimiento } from '../../domain/ports/repositorio-regla-seguimiento.js'
import type { ReglaSeguimiento } from '../../domain/entities/regla-seguimiento.js'
import { reglasSeguimiento } from '../../../../shared/db/schema/index.js'
import { eq, and } from 'drizzle-orm'

type FilaRegla = typeof reglasSeguimiento.$inferSelect

export class RepositorioDrizzleReglaSeguimiento implements RepositorioReglaSeguimiento {
  constructor(private readonly baseDeDatos: Transaccion | BaseDeDatos) {}

  async buscarActivaPorId(id: string): Promise<ReglaSeguimiento | null> {
    const filas = await this.baseDeDatos
      .select()
      .from(reglasSeguimiento)
      .where(and(eq(reglasSeguimiento.id, id), eq(reglasSeguimiento.activa, true)))
      .limit(1)
    return filas[0] ? mapearRegla(filas[0]) : null
  }

  async buscarActivaPorCodigo(codigo: string): Promise<ReglaSeguimiento | null> {
    const filas = await this.baseDeDatos
      .select()
      .from(reglasSeguimiento)
      .where(and(eq(reglasSeguimiento.codigo, codigo), eq(reglasSeguimiento.activa, true)))
      .limit(1)
    return filas[0] ? mapearRegla(filas[0]) : null
  }
}

function mapearRegla(fila: FilaRegla): ReglaSeguimiento {
  return {
    id: fila.id,
    codigo: fila.codigo,
    descripcion: undefined,
    plantillaId: fila.idPlantilla ?? undefined,
    segundosEspera: fila.demoraHoras * 3600,
    activa: fila.activa,
  }
}
