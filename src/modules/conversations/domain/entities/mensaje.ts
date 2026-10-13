export type DireccionMensaje = 'entrante' | 'saliente'

export type Mensaje = {
  id: string
  idConversacion: string
  idCuentaWhatsApp: string
  direccion: DireccionMensaje
  idMensajeMeta: string | null
  tipo: string
  cuerpo: string | null
  estado: string | null
}