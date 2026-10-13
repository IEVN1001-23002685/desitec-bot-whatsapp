export type EstadoConversacion = 'abierta' | 'cerrada'

export type Conversacion = {
  id: string
  idCuentaWhatsApp: string
  idContacto: string
  estado: EstadoConversacion
  ultimoMensajeEn: Date | null
}
