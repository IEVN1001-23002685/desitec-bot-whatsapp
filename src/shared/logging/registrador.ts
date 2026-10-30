import { pino } from 'pino'
import type { Logger } from 'pino'

export type RegistradorApp = Logger

export function crearRegistrador(nivel = 'info'): Logger {
  return pino({
    level: nivel,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers["x-hub-signature-256"]',
        '*.token',
        '*.tokenAcceso',
        '*.credencial',
        '*.accessToken',
        '*.idWa',
        '*.telefonoVisible',
        '*.idNumeroTelefono',
        '*.idMensajeMeta',
        '*.cuerpo',
      ],
      censor: '[redacted]',
    },
  })
}

export function enmascararTelefono(valor: string): string {
  const digitos = valor.replace(/\D/g, '')
  if (digitos.length <= 4) {
    return '***'
  }
  return `***${digitos.slice(-4)}`
}
