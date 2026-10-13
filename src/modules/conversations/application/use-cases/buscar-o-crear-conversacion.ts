import type { Conversacion } from '../../domain/entities/conversacion.js'
import type { RepositorioConversacion } from '../../domain/ports/repositorio-conversacion.js'

export type EntradaBuscarOCrearConversacion = {
  idCuentaWhatsApp: string
  idContacto: string
  en: Date
}

export class BuscarOCrearConversacion {
  constructor(private readonly conversaciones: RepositorioConversacion) {}

  async ejecutar(entrada: EntradaBuscarOCrearConversacion): Promise<Conversacion> {
    const existente = await this.conversaciones.buscarPorCuentaYContacto(
      entrada.idCuentaWhatsApp,
      entrada.idContacto,
    )
    if (existente) {
      return existente
    }
    return this.conversaciones.crear(entrada)
  }
}
