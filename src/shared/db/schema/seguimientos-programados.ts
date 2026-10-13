import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { conversaciones } from './conversaciones.js'
import { reglasSeguimiento } from './reglas-seguimiento.js'
import { enumeracionEstadoSeguimiento } from './enumeraciones.js'

export const seguimientosProgramados = pgTable(
  'seguimientos_programados',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    idConversacion: uuid('id_conversacion')
      .notNull()
      .references(() => conversaciones.id, { onDelete: 'cascade' }),
    idReglaSeguimiento: uuid('id_regla_seguimiento')
      .notNull()
      .references(() => reglasSeguimiento.id, { onDelete: 'restrict' }),
    programadoPara: timestamp('programado_para', { withTimezone: true }).notNull(),
    estado: enumeracionEstadoSeguimiento('estado').notNull().default('pendiente'),
    intentos: integer('intentos').notNull().default(0),
    idMensajeMeta: text('id_mensaje_meta'),
    error: text('error'),
    motivoCancelacion: text('motivo_cancelacion'),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
    actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
    enviadoEn: timestamp('enviado_en', { withTimezone: true }),
  },
  (tabla) => [
    index('seguimientos_programados_estado_programado_idx').on(tabla.estado, tabla.programadoPara),
    index('seguimientos_programados_conversacion_estado_idx').on(
      tabla.idConversacion,
      tabla.estado,
    ),
    uniqueIndex('seguimientos_programados_conv_regla_unico').on(
      tabla.idConversacion,
      tabla.idReglaSeguimiento,
    ),
  ],
)
