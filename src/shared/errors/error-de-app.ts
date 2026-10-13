export class ErrorDeAplicacion extends Error {
  constructor(
    readonly mensaje: string,
    readonly codigoEstado: number,
    readonly codigo: string,
  ) {
    super(mensaje)
    this.name = 'ErrorDeAplicacion'
  }
}

export class ErrorDeValidacion extends ErrorDeAplicacion {
  constructor(mensaje: string) {
    super(mensaje, 400, 'VALIDATION_ERROR')
    this.name = 'ErrorDeValidacion'
  }
}

export class ErrorDeFirma extends ErrorDeAplicacion {
  constructor() {
    super('Firma de webhook inválida', 401, 'INVALID_SIGNATURE')
    this.name = 'ErrorDeFirma'
  }
}

export class ErrorDeVerificacionWebhook extends ErrorDeAplicacion {
  constructor(mensaje: string) {
    super(mensaje, 403, 'WEBHOOK_VERIFICATION_FAILED')
    this.name = 'ErrorDeVerificacionWebhook'
  }
}