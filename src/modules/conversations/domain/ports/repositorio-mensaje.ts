export type EntradaInsertarMensajeEntrante = {
  idConversacion: string
  idCuentaWhatsApp: string
  idMensajeMeta: string
  tipo: string
  cuerpo: string | null
  cargaUtil: unknown
  marcaTiempoMeta: Date | null
}

export interface RepositorioMensaje {
  insertarEntrante(
    entrada: EntradaInsertarMensajeEntrante,
  ): Promise<{ insertado: boolean; id: string | null }>
}
