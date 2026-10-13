export interface VerificadorEstadoComercial {
  puedeSeguir(idConversacion: string): Promise<boolean>
}
