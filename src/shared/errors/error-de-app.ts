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

export class ErrorNoAutorizado extends ErrorDeAplicacion {
  constructor() {
    super('No autorizado', 401, 'UNAUTHORIZED')
    this.name = 'ErrorNoAutorizado'
  }
}

export class ErrorCuentaNoEncontrada extends ErrorDeAplicacion {
  constructor() {
    super('Cuenta de WhatsApp no encontrada', 404, 'ACCOUNT_NOT_FOUND')
    this.name = 'ErrorCuentaNoEncontrada'
  }
}

export class ErrorCuentaSinToken extends ErrorDeAplicacion {
  constructor() {
    super('La cuenta no tiene token de acceso configurado', 503, 'ACCOUNT_NO_TOKEN')
    this.name = 'ErrorCuentaSinToken'
  }
}

export class ErrorFueraDeVentanaAtencion extends ErrorDeAplicacion {
  constructor() {
    super('Fuera de la ventana de atencion de 24 horas', 409, 'WINDOW_CLOSED')
    this.name = 'ErrorFueraDeVentanaAtencion'
  }
}

export class ErrorDeEnvioMensaje extends ErrorDeAplicacion {
  constructor(mensaje: string) {
    super(mensaje, 502, 'MESSAGE_SEND_FAILED')
    this.name = 'ErrorDeEnvioMensaje'
  }
}
