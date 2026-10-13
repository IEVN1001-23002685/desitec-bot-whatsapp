import { eq } from 'drizzle-orm'
import { cuentasWhatsApp } from '../../../../shared/db/schema/index.js'
import type { BaseDeDatos } from '../../../../shared/db/tipos.js'
import type { CuentaWhatsApp } from '../../domain/entities/cuenta-whatsapp.js'
import type { RepositorioCuentaWhatsApp } from '../../domain/ports/repositorio-cuenta-whatsapp.js'

type FilaCuenta = typeof cuentasWhatsApp.$inferSelect

export class RepositorioDrizzleCuentaWhatsApp implements RepositorioCuentaWhatsApp {
  constructor(private readonly baseDeDatos: BaseDeDatos) {}

  async buscarPorIdNumeroTelefono(idNumeroTelefono: string): Promise<CuentaWhatsApp | null> {
    const filas = await this.baseDeDatos
      .select()
      .from(cuentasWhatsApp)
      .where(eq(cuentasWhatsApp.idNumeroTelefono, idNumeroTelefono))
      .limit(1)
    const fila = filas[0]
    if (!fila || !fila.estaActiva) {
      return null
    }
    return mapearCuenta(fila)
  }

  async listarActivas(): Promise<CuentaWhatsApp[]> {
    const filas = await this.baseDeDatos
      .select()
      .from(cuentasWhatsApp)
      .where(eq(cuentasWhatsApp.estaActiva, true))
    return filas.map(mapearCuenta)
  }
}

function mapearCuenta(fila: FilaCuenta): CuentaWhatsApp {
  return {
    id: fila.id,
    codigo: fila.codigo,
    nombreComercial: fila.nombreComercial,
    idNumeroTelefono: fila.idNumeroTelefono,
    telefonoVisible: fila.telefonoVisible,
    estaActiva: fila.estaActiva,
  }
}