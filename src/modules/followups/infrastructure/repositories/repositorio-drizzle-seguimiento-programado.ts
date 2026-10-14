import type { Transaccion } from '../../../../shared/db/tipos.js'
import type { BaseDeDatos } from '../../../../shared/db/tipos.js'
import type { RepositorioSeguimientoProgramado } from '../../domain/ports/repositorio-seguimiento-programado.js'
import type { SeguimientoProgramado } from '../../domain/entities/seguimiento-programado.js'
import { seguimientosProgramados } from '../../../../shared/db/schema/index.js'
import { eq } from 'drizzle-orm'
import type { EstadoSeguimiento } from '../../domain/types/estado-seguimiento.js'

export class RepositorioDrizzleSeguimientoProgramado implements RepositorioSeguimientoProgramado {
  constructor(private readonly baseDeDatos: Transaccion | BaseDeDatos) {}
  async cambiarEstado(id: string, estado: EstadoSeguimiento): Promise<void> {
    await this.baseDeDatos
      .update(seguimientosProgramados)
      .set({
        estado,
        actualizadoEn: new Date(),
      } as any)
      .where(eq(seguimientosProgramados.id, id))
  }
}
