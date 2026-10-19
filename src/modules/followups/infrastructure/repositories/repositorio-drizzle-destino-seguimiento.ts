import { eq } from 'drizzle-orm'
import { contactos, conversaciones, cuentasWhatsApp } from '../../../../shared/db/schema/index.js'
import type { BaseDeDatos, Transaccion } from '../../../../shared/db/tipos.js'
import type {
  DestinoSeguimiento,
  RepositorioDestinoSeguimiento,
} from '../../domain/ports/repositorio-destino-seguimiento.js'

export class RepositorioDrizzleDestinoSeguimiento implements RepositorioDestinoSeguimiento {
  constructor(private readonly baseDeDatos: Transaccion | BaseDeDatos) {}

  async obtenerDestino(idConversacion: string): Promise<DestinoSeguimiento | null> {
    const filas = await this.baseDeDatos
      .select({
        idConversacion: conversaciones.id,
        idCuentaWhatsApp: cuentasWhatsApp.id,
        idNumeroTelefono: cuentasWhatsApp.idNumeroTelefono,
        tokenAcceso: cuentasWhatsApp.tokenAcceso,
        idWa: contactos.idWa,
        nombreContacto: contactos.nombrePerfil,
        nombreCuenta: cuentasWhatsApp.nombreComercial,
        telefonoVisible: cuentasWhatsApp.telefonoVisible,
      })
      .from(conversaciones)
      .innerJoin(cuentasWhatsApp, eq(conversaciones.idCuentaWhatsApp, cuentasWhatsApp.id))
      .innerJoin(contactos, eq(conversaciones.idContacto, contactos.id))
      .where(eq(conversaciones.id, idConversacion))
      .limit(1)

    const fila = filas[0]
    if (!fila) {
      return null
    }
    return { ...fila, tokenAcceso: fila.tokenAcceso ?? null }
  }
}
