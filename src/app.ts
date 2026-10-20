import Fastify from 'fastify'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { registrarManejadorErrores } from './shared/http/manejador-errores.js'
import { registrarCuerpoCrudo } from './shared/http/cuerpo-crudo.js'
import {
  rutasWebhookWhatsApp,
  type OpcionesRutasWebhookWhatsApp,
} from './modules/whatsapp/presentation/routes/rutas-webhook-whatsapp.js'
import {
  rutasWebhook360Dialog,
  type OpcionesRutasWebhook360Dialog,
} from './modules/whatsapp/presentation/routes/rutas-webhook-360dialog.js'
import {
  rutasMensajes,
  type OpcionesRutasMensajes,
} from './modules/whatsapp/presentation/routes/rutas-mensajes.js'
import {
  rutasSeguimientos,
  type OpcionesRutasSeguimientos,
} from './modules/followups/presentation/routes/rutas-seguimientos.js'

export type OpcionesCrearApp = {
  registrador: FastifyBaseLogger
  webhook?: OpcionesRutasWebhookWhatsApp
  webhook360?: OpcionesRutasWebhook360Dialog
  mensajes?: OpcionesRutasMensajes
  seguimientos?: OpcionesRutasSeguimientos
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
  if (opciones.webhook) {
    aplicacion.register(rutasWebhookWhatsApp(opciones.webhook))
  }
  if (opciones.webhook360) {
    aplicacion.register(rutasWebhook360Dialog(opciones.webhook360))
  }
  if (opciones.mensajes) {
    aplicacion.register(rutasMensajes(opciones.mensajes))
  }
  if (opciones.seguimientos) {
    aplicacion.register(rutasSeguimientos(opciones.seguimientos))
  }

  return aplicacion
}
