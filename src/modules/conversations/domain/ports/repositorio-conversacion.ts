import type { Conversacion } from '../entities/conversacion.js'

export type EntradaCrearConversacion = {
  idCuentaWhatsApp: string
  idContacto: string
  en: Date
}

export interface RepositorioConversacion {
  buscarPorCuentaYContacto(
    idCuentaWhatsApp: string,
    idContacto: string,
  ): Promise<Conversacion | null>
  crear(entrada: EntradaCrearConversacion): Promise<Conversacion>
  actualizarUltimoMensaje(idConversacion: string, en: Date): Promise<void>
}
