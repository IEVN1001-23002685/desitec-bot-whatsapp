import type { RepositorioContacto } from '../../../contacts/domain/ports/repositorio-contacto.js'
import type { RepositorioConversacion } from '../../../conversations/domain/ports/repositorio-conversacion.js'
import type { RepositorioMensaje } from '../../../conversations/domain/ports/repositorio-mensaje.js'

export type ContextoMensajeEntrante = {
  contactos: RepositorioContacto
  conversaciones: RepositorioConversacion
  mensajes: RepositorioMensaje
}

export interface TransaccionMensajeEntrante {
  ejecutar<T>(trabajo: (contexto: ContextoMensajeEntrante) => Promise<T>): Promise<T>
}
