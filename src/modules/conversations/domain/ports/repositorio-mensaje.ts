export type EntradaInsertarMensajeEntrante = {
  idConversacion: string
  idCuentaWhatsApp: string
  idMensajeMeta: string
  tipo: string
  cuerpo: string | null
  cargaUtil: unknown
  marcaTiempoMeta: Date | null
}

export type EntradaInsertarMensajeSaliente = {
  idConversacion: string
  idCuentaWhatsApp: string
  idMensajeMeta: string
  tipo: string
  cuerpo: string | null
  estado: string
}

export interface RepositorioMensaje {
  insertarEntrante(
    entrada: EntradaInsertarMensajeEntrante,
  ): Promise<{ insertado: boolean; id: string | null }>
  insertarSaliente(entrada: EntradaInsertarMensajeSaliente): Promise<{ id: string }>
  buscarUltimoEntranteEn(idConversacion: string): Promise<Date | null>
}
