import type { Contacto } from '../../domain/entities/contacto.js'
import type { RepositorioContacto } from '../../domain/ports/repositorio-contacto.js'

export type EntradaBuscarOCrearContacto = {
  idWa: string
  nombrePerfil: string | null
}

export class BuscarOCrearContacto {
  constructor(private readonly contactos: RepositorioContacto) {}

  async ejecutar(entrada: EntradaBuscarOCrearContacto): Promise<Contacto> {
    const existente = await this.contactos.buscarPorIdWa(entrada.idWa)
    if (existente) {
      return existente
    }
    return this.contactos.crear(entrada)
  }
}
