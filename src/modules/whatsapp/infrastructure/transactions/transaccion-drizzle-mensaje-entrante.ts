import { RepositorioDrizzleContacto } from '../../../contacts/infrastructure/repositories/repositorio-drizzle-contacto.js'
import { RepositorioDrizzleConversacion } from '../../../conversations/infrastructure/repositories/repositorio-drizzle-conversacion.js'
import { RepositorioDrizzleMensaje } from '../../../conversations/infrastructure/repositories/repositorio-drizzle-mensaje.js'
import type { BaseDeDatos, Transaccion } from '../../../../shared/db/tipos.js'
import type {
  ContextoMensajeEntrante,
  TransaccionMensajeEntrante,
} from '../../application/ports/transaccion-mensaje-entrante.js'

export class TransaccionDrizzleMensajeEntrante implements TransaccionMensajeEntrante {
  constructor(private readonly baseDeDatos: BaseDeDatos) {}

  async ejecutar<T>(trabajo: (contexto: ContextoMensajeEntrante) => Promise<T>): Promise<T> {
    return this.baseDeDatos.transaction(async (transaccion: Transaccion) => {
      const contexto: ContextoMensajeEntrante = {
        contactos: new RepositorioDrizzleContacto(transaccion),
        conversaciones: new RepositorioDrizzleConversacion(transaccion),
        mensajes: new RepositorioDrizzleMensaje(transaccion),
      }
      return trabajo(contexto)
    })
  }
}