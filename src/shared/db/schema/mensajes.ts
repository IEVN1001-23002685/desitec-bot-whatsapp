import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { conversaciones } from './conversaciones.js'
import { enumeracionDireccionMensaje } from './enumeraciones.js'
import { cuentasWhatsApp } from './cuentas-whatsapp.js'

export const mensajes = pgTable(
  'mensajes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    idConversacion: uuid('id_conversacion')
      .notNull()
      .references(() => conversaciones.id, { onDelete: 'cascade' }),
    idCuentaWhatsApp: uuid('id_cuenta_whatsapp')
      .notNull()
      .references(() => cuentasWhatsApp.id, { onDelete: 'restrict' }),
    direccion: enumeracionDireccionMensaje('direccion').notNull(),
    idMensajeMeta: text('id_mensaje_meta').unique(),
    tipo: text('tipo').notNull(),
    cuerpo: text('cuerpo'),
    cargaUtil: jsonb('carga_util'),
    estado: text('estado'),
    marcaTiempoMeta: timestamp('marca_tiempo_meta', { withTimezone: true }),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (tabla) => [
    index('mensajes_conversacion_idx').on(tabla.idConversacion),
    index('mensajes_cuenta_idx').on(tabla.idCuentaWhatsApp),
    index('mensajes_creados_idx').on(tabla.creadoEn),
  ],
)
