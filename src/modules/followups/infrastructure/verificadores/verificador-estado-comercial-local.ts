import type { VerificadorEstadoComercial } from '../../domain/ports/verificador-estado-comercial.js'

export class VerificadorEstadoComercialLocal implements VerificadorEstadoComercial {
  async puedeSeguir(idConversacion: string): Promise<boolean> {
    if (!idConversacion) {
      return false
    }
    return true
  }
}
