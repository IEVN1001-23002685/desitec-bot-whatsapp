import type { BaseDeDatos } from '../../../../shared/db/tipos.js'
import type { RepositorioPlantilla } from '../../domain/ports/repositorio-plantilla.js'
import type { RepositorioReglaSeguimiento } from '../../domain/ports/repositorio-regla-seguimiento.js'
import type { RepositorioSeguimientoProgramado } from '../../domain/ports/repositorio-seguimiento-programado.js'
import { RepositorioDrizzlePlantilla } from '../repositories/repositorio-drizzle-plantilla.js'
import { RepositorioDrizzleReglaSeguimiento } from '../repositories/repositorio-drizzle-regla-seguimiento.js'
import { RepositorioDrizzleSeguimientoProgramado } from '../repositories/repositorio-drizzle-seguimiento-programado.js'

export type ContextoFollowups = {
  plantillas: RepositorioPlantilla
  reglas: RepositorioReglaSeguimiento
  seguimientos: RepositorioSeguimientoProgramado
}

export class TransaccionFollowups {
  constructor(private readonly baseDeDatos: BaseDeDatos) {}

  async ejecutar<T>(operacion: (contexto: ContextoFollowups) => Promise<T>): Promise<T> {
    return this.baseDeDatos.transaction(async (transaccion) => {
      const contexto: ContextoFollowups = {
        plantillas: new RepositorioDrizzlePlantilla(transaccion),
        reglas: new RepositorioDrizzleReglaSeguimiento(transaccion),
        seguimientos: new RepositorioDrizzleSeguimientoProgramado(transaccion),
      }
      return operacion(contexto)
    })
  }
}
