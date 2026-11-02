import { pgEnum } from 'drizzle-orm/pg-core'

export const enumeracionEstadoConversacion = pgEnum('estado_conversacion', ['abierta', 'cerrada'])

export const enumeracionDireccionMensaje = pgEnum('direccion_mensaje', ['entrante', 'saliente'])

export const enumeracionProveedorMensajeria = pgEnum('proveedor_mensajeria', ['meta', '360dialog'])

export const enumeracionEstadoEventoWebhook = pgEnum('estado_evento_webhook', [
  'recibido',
  'procesado',
  'ignorado',
  'fallido',
])

export const enumeracionEstadoSeguimiento = pgEnum('estado_seguimiento', [
  'pendiente',
  'en_proceso',
  'enviado',
  'cancelado',
  'fallido',
])

export const enumeracionEstadoLead = pgEnum('estado_lead', [
  'capturando',
  'listo_pipedrive',
  'en_asesor',
  'seguimiento',
  'fuera_de_cobertura',
])

export const enumeracionPasoLead = pgEnum('paso_lead', [
  'nombre',
  'correo',
  'modelos',
  'cantidad',
  'ciudad',
])
