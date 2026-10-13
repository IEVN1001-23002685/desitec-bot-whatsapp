export type MensajeNormalizado = {
  idMensajeMeta: string
  idWa: string
  tipo: string
  cuerpo: string | null
  cargaUtil: unknown
  marcaTiempoMeta: Date | null
  soportado: boolean
}
