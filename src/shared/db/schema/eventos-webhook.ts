import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { enumeracionEstadoEventoWebhook } from './enumeraciones.js'

export const eventosWebhook = pgTable(
  'eventos_webhook',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    claveEvento: text('clave_evento').notNull().unique(),
    fuente: text('fuente').notNull().default('whatsapp'),
    tipoObjeto: text('tipo_objeto'),
    estado: enumeracionEstadoEventoWebhook('estado').notNull().default('recibido'),
    error: text('error'),
    cargaUtilOriginal: jsonb('carga_util_original').notNull(),
    recibidoEn: timestamp('recibido_en', { withTimezone: true }).notNull().defaultNow(),
    procesadoEn: timestamp('procesado_en', { withTimezone: true }),
  },
  (tabla) => [
    index('eventos_webhook_estado_idx').on(tabla.estado),
    index('eventos_webhook_recibidos_idx').on(tabla.recibidoEn),
  ],
)