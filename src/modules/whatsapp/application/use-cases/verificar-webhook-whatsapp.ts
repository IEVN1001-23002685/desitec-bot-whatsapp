import { ErrorDeVerificacionWebhook } from '../../../../shared/errors/error-de-app.js'
import { comparacionSegura } from '../../../../shared/security/firma.js'

export type ConsultaVerificarWebhook = {
  modo: string | undefined
  token: string | undefined
  desafio: string | undefined
}

export class VerificarWebhookWhatsApp {
  constructor(private readonly tokenVerificacion: string) {}

  ejecutar(consulta: ConsultaVerificarWebhook): string {
    if (consulta.modo !== 'subscribe' || !consulta.token || !consulta.desafio) {
      throw new ErrorDeVerificacionWebhook('Faltan parámetros de verificación del webhook')
    }

    if (!comparacionSegura(consulta.token, this.tokenVerificacion)) {
      throw new ErrorDeVerificacionWebhook('Token de verificación inválido')
    }

    return consulta.desafio
  }
}
