export type EntradaProcesarAutorespuesta = {
  idConversacion: string
  codigoCuenta: string
  idWa: string
  texto: string | null
}

export interface ProcesadorAutorespuesta {
  procesar(entrada: EntradaProcesarAutorespuesta): Promise<void>
}
