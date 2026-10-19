import { eq } from 'drizzle-orm'
import { leads } from '../../../../shared/db/schema/index.js'
import type { BaseDeDatos, Transaccion } from '../../../../shared/db/tipos.js'
import type { Lead } from '../../domain/entities/lead.js'
import type {
  ActualizacionLead,
  EntradaCrearLead,
  RepositorioLead,
} from '../../domain/ports/repositorio-lead.js'

type FilaLead = typeof leads.$inferSelect

export class RepositorioDrizzleLead implements RepositorioLead {
  constructor(private readonly baseDeDatos: Transaccion | BaseDeDatos) {}

  async buscarPorConversacion(idConversacion: string): Promise<Lead | null> {
    const filas = await this.baseDeDatos
      .select()
      .from(leads)
      .where(eq(leads.idConversacion, idConversacion))
      .limit(1)
    return filas[0] ? mapearLead(filas[0]) : null
  }

  async crear(entrada: EntradaCrearLead): Promise<Lead> {
    const filas = await this.baseDeDatos
      .insert(leads)
      .values({ idConversacion: entrada.idConversacion })
      .returning()
    const fila = filas[0]
    if (!fila) {
      throw new Error('No se pudo crear el lead')
    }
    return mapearLead(fila)
  }

  async actualizar(id: string, cambios: ActualizacionLead): Promise<void> {
    await this.baseDeDatos
      .update(leads)
      .set({
        nombre: cambios.nombre,
        correo: cambios.correo,
        modelos: cambios.modelos,
        cantidad: cambios.cantidad,
        ciudad: cambios.ciudad,
        pasoActual: cambios.pasoActual,
        estado: cambios.estado,
        completadoEn: cambios.completadoEn,
        actualizadoEn: new Date(),
      })
      .where(eq(leads.id, id))
  }
}

function mapearLead(fila: FilaLead): Lead {
  return {
    id: fila.id,
    idConversacion: fila.idConversacion,
    nombre: fila.nombre ?? null,
    correo: fila.correo ?? null,
    modelos: fila.modelos ?? null,
    cantidad: fila.cantidad ?? null,
    ciudad: fila.ciudad ?? null,
    pasoActual: fila.pasoActual,
    estado: fila.estado,
    completadoEn: fila.completadoEn ?? null,
  }
}
