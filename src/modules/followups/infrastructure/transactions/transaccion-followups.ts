import type { Transaccion } from '../../../../shared/db/tipos.js'
import type { BaseDeDatos } from '../../../../shared/db/tipos.js'
import { crearBaseDeDatos } from '../../../../shared/db/cliente-bd.js'
import { cargarVariablesEntorno } from '../../../../shared/config/variables-entorno.js'
import type { RepositorioPlantilla } from '../../domain/ports/repositorio-plantilla.js'
const { baseDeDatos: db } = crearBaseDeDatos(cargarVariablesEntorno().DATABASE_URL)
import type { RepositorioReglaSeguimiento } from '../../domain/ports/repositorio-regla-seguimiento.js'
import type { RepositorioSeguimientoProgramado } from '../../domain/ports/repositorio-seguimiento-programado.js'
import { RepositorioDrizzlePlantilla } from '../repositories/repositorio-drizzle-plantilla.js'
import { RepositorioDrizzleReglaSeguimiento } from '../repositories/repositorio-drizzle-regla-seguimiento.js'
import { RepositorioDrizzleSeguimientoProgramado } from '../repositories/repositorio-drizzle-seguimiento-programado.js'

export class TransaccionFollowups {
  constructor(
    private readonly baseDeDatos: Transaccion | BaseDeDatos = db,
    public readonly plantillas: RepositorioPlantilla = new RepositorioDrizzlePlantilla(
      this.baseDeDatos,
    ),
    public readonly reglas: RepositorioReglaSeguimiento = new RepositorioDrizzleReglaSeguimiento(
      this.baseDeDatos,
    ),
    public readonly seguimientos: RepositorioSeguimientoProgramado = new RepositorioDrizzleSeguimientoProgramado(
      this.baseDeDatos,
    ),
  ) {}

  async ejecutar<T>(operacion: (tx: TransaccionFollowups) => Promise<T>): Promise<T> {
    if (this.esTransaccion(this.baseDeDatos)) {
      return operacion(this)
    }

    return this.baseDeDatos.transaction(async (tx) => {
      const txFollowups = new TransaccionFollowups(tx)
      return operacion(txFollowups)
    })
  }

  private esTransaccion(valor: unknown): valor is Transaccion {
    const tx = valor as Transaccion
    return typeof tx.transaction === 'function' && tx.transaction === this.baseDeDatos.transaction
  }
}
