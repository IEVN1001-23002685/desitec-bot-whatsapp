import type { Contacto } from '../entities/contacto.js'

export type EntradaCrearContacto = {
  idWa: string
  nombrePerfil: string | null
}

export interface RepositorioContacto {
  buscarPorIdWa(idWa: string): Promise<Contacto | null>
  crear(entrada: EntradaCrearContacto): Promise<Contacto>
}
