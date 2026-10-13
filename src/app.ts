import Fastify from 'fastify'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { registrarManejadorErrores } from './shared/http/manejador-errores.js'
import { registrarCuerpoCrudo } from './shared/http/cuerpo-crudo.js'
import {
  rutasWebhookWhatsApp,
  type OpcionesRutasWebhookWhatsApp,
} from './modules/whatsapp/presentation/routes/rutas-webhook-whatsapp.js'

export type OpcionesCrearApp = {
  registrador: FastifyBaseLogger
  webhook: OpcionesRutasWebhookWhatsApp
  bodyLimit?: number
}

export function crearApp(opciones: OpcionesCrearApp): FastifyInstance {
  const aplicacion = Fastify({
    loggerInstance: opciones.registrador,
    bodyLimit: opciones.bodyLimit ?? 1_048_576,
    trustProxy: false,
  })

  registrarCuerpoCrudo(aplicacion)
  registrarManejadorErrores(aplicacion)

  aplicacion.get('/health', async () => ({ estado: 'ok' }))
  aplicacion.register(rutasWebhookWhatsApp(opciones.webhook))

  return aplicacion
}