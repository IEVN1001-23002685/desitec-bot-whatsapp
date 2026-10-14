export type DestinoSeguimiento = {
  idConversacion: string
  idCuentaWhatsApp: string
  idNumeroTelefono: string
  tokenAcceso: string | null
  idWa: string
}

export interface RepositorioDestinoSeguimiento {
  obtenerDestino(idConversacion: string): Promise<DestinoSeguimiento | null>
}
