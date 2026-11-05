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
  cargaUtil?: unknown
  marcaTiempoMeta?: Date | null
}

export type MensajeReciente = {
  id: string
  idMensajeMeta: string | null
  direccion: 'entrante' | 'saliente'
  tipo: string
  cuerpo: string | null
  cargaUtil: unknown
  creadoEn: Date
}

export interface RepositorioMensaje {
  insertarEntrante(
    entrada: EntradaInsertarMensajeEntrante,
  ): Promise<{ insertado: boolean; id: string | null }>
  insertarSaliente(entrada: EntradaInsertarMensajeSaliente): Promise<{ id: string }>
  insertarSalienteHumano(
    entrada: EntradaInsertarMensajeSaliente,
  ): Promise<{ insertado: boolean; id: string | null }>
  buscarUltimoEntranteEn(idConversacion: string): Promise<Date | null>
  buscarUltimosMensajes(idConversacion: string, limite: number): Promise<MensajeReciente[]>
}
