import { pgEnum } from 'drizzle-orm/pg-core'

export const enumeracionEstadoConversacion = pgEnum('estado_conversacion', [
  'abierta',
  'cerrada',
])

export const enumeracionDireccionMensaje = pgEnum('direccion_mensaje', ['entrante', 'saliente'])

export const enumeracionEstadoEventoWebhook = pgEnum('estado_evento_webhook', [
  'recibido',
  'procesado',
  'ignorado',
  'fallido',
])