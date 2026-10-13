import { plantillasWhatsApp } from '../../../../shared/db/schema/index.js'
import type { BaseDeDatos, Transaccion } from '../../../../shared/db/tipos.js'
import type { RepositorioPlantilla } from '../../domain/ports/repositorio-plantilla.js'
import type { PlantillaWhatsApp } from '../../domain/entities/plantilla-whatsapp.js'
import { eq, and } from 'drizzle-orm'

type FilaPlantilla = typeof plantillasWhatsApp.$inferSelect

export class RepositorioDrizzlePlantilla implements RepositorioPlantilla {
  constructor(private readonly baseDeDatos: Transaccion | BaseDeDatos) {}

  async buscarActivaPorCodigo(codigo: string): Promise<PlantillaWhatsApp | null> {
    const filas = await this.baseDeDatos
      .select()
      .from(plantillasWhatsApp)
      .where(and(eq(plantillasWhatsApp.codigo, codigo), eq(plantillasWhatsApp.activa, true)))
      .limit(1)
    return filas[0] ? mapearPlantilla(filas[0]) : null
  }

  async listarActivas(): Promise<PlantillaWhatsApp[]> {
    const filas = await this.baseDeDatos
      .select()
      .from(plantillasWhatsApp)
      .where(eq(plantillasWhatsApp.activa, true))
    return filas.map(mapearPlantilla)
  }
}

function mapearPlantilla(fila: FilaPlantilla): PlantillaWhatsApp {
  return {
    id: fila.id,
    codigo: fila.codigo,
    nombreMeta: fila.nombreMeta,
    idioma: fila.idioma,
    categoria: fila.categoria,
    componentes: fila.componentes,
    activa: fila.activa,
  }
}
